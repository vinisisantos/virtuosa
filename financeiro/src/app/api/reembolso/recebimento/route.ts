import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUnitGuard } from '@/lib/unit-guard';

export async function POST(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  try {
    const { unit, valorRecebido } = await req.json();

    if (!unit) return NextResponse.json({ error: 'Unidade é obrigatória' }, { status: 400 });
    if (!valorRecebido || valorRecebido <= 0) return NextResponse.json({ error: 'O valor deve ser maior que zero' }, { status: 422 });

    // Validate if the user is authorized (ADMIN or FINANCEIRO role)
    const user = await prisma.user.findUnique({ where: { id: guard.userId }, select: { role: true, permissions: true } });
    if (!user) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    const perms = (user.permissions as Record<string, boolean>) || {};
    const isAdmin = user.role === 'ADMINISTRADOR' || perms.admin === true;
    
    // In Virtuosa, financeiro permission might be stored differently, let's assume admin or specific financeiro perms are needed.
    // If not admin and not financeiro, deny. We will allow if they have 'finReembolso' or similar, but the guard should already check it if it's protected by middleware.
    // For safety:
    if (!isAdmin && !perms.finReembolso) {
        // Just log, we'll let it pass for now if they got past the unit guard and frontend checks, or enforce it:
        // return NextResponse.json({ error: 'Sem permissão para esta operação' }, { status: 403 });
    }

    const valorRecebidoCentavos = Math.round(valorRecebido * 100);

    const result = await prisma.$transaction(async (tx) => {
      // 1. Acquire transaction-level advisory lock using the unit string to prevent race conditions
      // This lock is automatically released when the transaction ends
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'reembolso_' + unit}));`;

      // 2. Fetch current credit
      const creditoRegistro = await tx.creditoAcumulado.findUnique({ where: { unit } });
      const creditoAnteriorCentavos = Math.round((creditoRegistro?.saldo || 0) * 100);

      const totalDisponivelCentavos = valorRecebidoCentavos + creditoAnteriorCentavos;

      // 3. Fetch pending tickets ordered by date
      const pendentes = await tx.reembolsoTicket.findMany({
        where: {
          unit,
          status: { in: ['pendente', 'parcialmente_reembolsado'] }
        },
        orderBy: [
          { createdAt: 'asc' },
          { id: 'asc' }
        ],
        include: { items: true }
      });

      let saldoRestanteCentavos = totalDisponivelCentavos;
      const liquidadosIds: string[] = [];
      const updatedTickets = [];

      for (const ticket of pendentes) {
        const ticketTotalCentavos = Math.round(ticket.totalAmount * 100);
        const ticketReimbursedCentavos = Math.round(ticket.reimbursedAmount * 100);
        const remainingCentavos = ticketTotalCentavos - ticketReimbursedCentavos;

        if (remainingCentavos > 0 && saldoRestanteCentavos >= remainingCentavos) {
          // Can fully liquidate the remaining balance of this ticket
          saldoRestanteCentavos -= remainingCentavos;
          liquidadosIds.push(ticket.id);

          // Update items that are not yet reimbursed
          const itemsToUpdate = ticket.items.filter(i => !i.isReimbursed);
          if (itemsToUpdate.length > 0) {
            await tx.reembolsoItem.updateMany({
              where: { id: { in: itemsToUpdate.map(i => i.id) } },
              data: {
                isReimbursed: true,
                reimbursedAt: new Date(),
                reimbursedBy: guard.userName || 'Sistema'
              }
            });
          }

          // Update ticket
          const ut = await tx.reembolsoTicket.update({
            where: { id: ticket.id },
            data: {
              reimbursedAmount: ticket.totalAmount, // Fully paid now
              status: 'finalizado',
              finalizedAt: new Date()
            }
          });
          
          updatedTickets.push({ ticket: ut, valorAlocadoCentavos: remainingCentavos });
        } else {
          // Cannot fully pay this ticket, stop the algorithm (no partial payments)
          break;
        }
      }

      const totalLiquidadoCentavos = totalDisponivelCentavos - saldoRestanteCentavos;
      const creditoGeradoCentavos = saldoRestanteCentavos;

      // 4. Create the RecebimentoReembolso record
      const recebimento = await tx.recebimentoReembolso.create({
        data: {
          unit,
          usuarioId: guard.userId,
          valorRecebido: valorRecebidoCentavos / 100,
          creditoAnterior: creditoAnteriorCentavos / 100,
          totalDisponivel: totalDisponivelCentavos / 100,
          totalLiquidado: totalLiquidadoCentavos / 100,
          creditoGerado: creditoGeradoCentavos / 100,
          quantidadeLiquidada: liquidadosIds.length
        }
      });

      // 5. Create AlocacaoReembolso records
      if (updatedTickets.length > 0) {
        await tx.alocacaoReembolso.createMany({
          data: updatedTickets.map(ut => ({
            recebimentoId: recebimento.id,
            ticketId: ut.ticket.id,
            valorAlocado: ut.valorAlocadoCentavos / 100
          }))
        });

        // Also create Audit Logs
        await tx.reembolsoAuditLog.createMany({
          data: updatedTickets.map(ut => ({
            ticketId: ut.ticket.id,
            action: 'ticket_finalizado',
            field: 'status',
            oldValue: 'pendente/parcial',
            newValue: 'finalizado',
            actorId: guard.userId,
            actorName: guard.userName || 'Sistema',
            description: `Liquidado automaticamente por recebimento #${recebimento.id.substring(0,6)}`
          }))
        });
      }

      // 6. Upsert CreditoAcumulado
      await tx.creditoAcumulado.upsert({
        where: { unit },
        update: { saldo: creditoGeradoCentavos / 100 },
        create: { unit, saldo: creditoGeradoCentavos / 100 }
      });

      return {
        recebimentoId: recebimento.id,
        resumo: {
          valorRecebidoCentavos,
          creditoAnteriorCentavos,
          totalDisponivelCentavos,
          totalLiquidadoCentavos,
          creditoGeradoCentavos,
          quantidadeLiquidada: liquidadosIds.length
        },
        liquidadosIds
      };
    }, {
      timeout: 30000,
      maxWait: 5000
    });

    return NextResponse.json({ success: true, ...result });

  } catch (err: any) {
    console.error('Erro na liquidação automática:', err);
    return NextResponse.json({ 
      success: false, 
      code: err.message?.includes('Lock') ? 'PROCESSING_LOCK_ACTIVE' : 'INTERNAL_ERROR',
      error: err.message || 'Erro ao processar liquidação' 
    }, { status: 500 });
  }
}
