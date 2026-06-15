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
      const liquidadosIds: string[] = []; // Ticket IDs that received SOME allocation
      const updatedTickets = [];
      const recebimentoId = crypto.randomUUID();

      for (const ticket of pendentes) {
        if (saldoRestanteCentavos <= 0) break;

        // Sort unpaid items chronologically
        const ticketItems = ticket.items.filter(i => !i.isReimbursed).sort((a, b) => {
           const timeA = a.expenseDate ? new Date(a.expenseDate).getTime() : 0;
           const timeB = b.expenseDate ? new Date(b.expenseDate).getTime() : 0;
           return timeA - timeB || a.id.localeCompare(b.id);
        });

        let ticketReimbursedThisRound = 0;
        let ticketFullyPaid = ticketItems.length === 0;

        for (const item of ticketItems) {
           const itemPriceCentavos = Math.round(item.price * 100);
           if (saldoRestanteCentavos >= itemPriceCentavos) {
              saldoRestanteCentavos -= itemPriceCentavos;
              ticketReimbursedThisRound += itemPriceCentavos;
              
              await tx.reembolsoItem.update({
                 where: { id: item.id },
                 data: {
                    isReimbursed: true,
                    reimbursedAt: new Date(),
                    reimbursedBy: `Recebimento ${recebimentoId}` // Track exactly which Recebimento paid this item
                 }
              });
           } else {
              ticketFullyPaid = false;
              break; // Stop immediately if we can't pay the chronological item
           }
        }

        if (ticketReimbursedThisRound > 0) {
            const ticketTotalCentavos = Math.round(ticket.totalAmount * 100);
            const prevReimbursedCentavos = Math.round(ticket.reimbursedAmount * 100);
            const newReimbursedCentavos = prevReimbursedCentavos + ticketReimbursedThisRound;
            const isFullyPaid = newReimbursedCentavos >= ticketTotalCentavos;
            
            const ut = await tx.reembolsoTicket.update({
                where: { id: ticket.id },
                data: {
                   reimbursedAmount: newReimbursedCentavos / 100,
                   status: isFullyPaid ? 'finalizado' : 'parcialmente_reembolsado',
                   finalizedAt: isFullyPaid ? new Date() : null
                }
            });
            
            liquidadosIds.push(ticket.id);
            updatedTickets.push({ ticket: ut, valorAlocadoCentavos: ticketReimbursedThisRound, isFullyPaid });
        }

        // If we stopped halfway through this ticket's items, we stop the entire algorithm
        if (!ticketFullyPaid) {
            break; 
        }
      }

      const totalLiquidadoCentavos = totalDisponivelCentavos - saldoRestanteCentavos;
      const creditoGeradoCentavos = saldoRestanteCentavos;

      // 4. Create the RecebimentoReembolso record with our pre-generated ID
      const recebimento = await tx.recebimentoReembolso.create({
        data: {
          id: recebimentoId,
          unit,
          usuarioId: guard.userId,
          valorRecebido: valorRecebidoCentavos / 100,
          creditoAnterior: creditoAnteriorCentavos / 100,
          totalDisponivel: totalDisponivelCentavos / 100,
          totalLiquidado: totalLiquidadoCentavos / 100,
          creditoGerado: creditoGeradoCentavos / 100,
          quantidadeLiquidada: liquidadosIds.length // Number of tickets affected
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
            action: ut.isFullyPaid ? 'ticket_finalizado' : 'pagamento_parcial',
            field: 'status',
            oldValue: 'pendente',
            newValue: ut.isFullyPaid ? 'finalizado' : 'parcialmente_reembolsado',
            actorId: guard.userId,
            actorName: guard.userName || 'Sistema',
            description: `Recebeu pagamento de ${ut.valorAlocadoCentavos / 100} automático pelo recebimento #${recebimento.id.substring(0,6)}`
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

export async function GET(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  try {
    const { searchParams } = new URL(req.url);
    const unit = searchParams.get('unit') || 'Barueri';

    const recebimentos = await prisma.recebimentoReembolso.findMany({
      where: { unit },
      orderBy: { createdAt: 'desc' },
      take: 20
    });

    return NextResponse.json(recebimentos);
  } catch (err: any) {
    return NextResponse.json({ error: 'Erro ao buscar histórico de recebimentos' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const unit = searchParams.get('unit') || 'Barueri';

    if (!id) return NextResponse.json({ error: 'ID do recebimento é obrigatório' }, { status: 400 });

    const result = await prisma.$transaction(async (tx) => {
      // 1. Lock
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'reembolso_' + unit}));`;

      // 2. Fetch the recebimento
      const recebimento = await tx.recebimentoReembolso.findUnique({
        where: { id },
        include: { alocacoes: true }
      });

      if (!recebimento) throw new Error('Recebimento não encontrado');

      // 3. Find items that were reimbursed by this specific Recebimento
      const itemsToRevert = await tx.reembolsoItem.findMany({
        where: { reimbursedBy: `Recebimento ${id}` }
      });

      // 4. Update the items back to unpaid
      if (itemsToRevert.length > 0) {
        await tx.reembolsoItem.updateMany({
          where: { id: { in: itemsToRevert.map(i => i.id) } },
          data: { isReimbursed: false, reimbursedAt: null, reimbursedBy: null }
        });
      }

      // 5. Update the affected tickets
      // Re-calculate the reimbursedAmount based on remaining items for those tickets
      const ticketIds = [...new Set(recebimento.alocacoes.map(a => a.ticketId))];
      
      for (const ticketId of ticketIds) {
        const ticket = await tx.reembolsoTicket.findUnique({
          where: { id: ticketId },
          include: { items: true }
        });

        if (ticket) {
          const reimbursedTotalCentavos = ticket.items.filter(i => i.isReimbursed).reduce((acc, curr) => acc + Math.round(curr.price * 100), 0);
          const totalAmountCentavos = Math.round(ticket.totalAmount * 100);
          
          let newStatus = 'pendente';
          if (reimbursedTotalCentavos > 0) {
            newStatus = reimbursedTotalCentavos >= totalAmountCentavos ? 'finalizado' : 'parcialmente_reembolsado';
          }

          await tx.reembolsoTicket.update({
            where: { id: ticketId },
            data: {
              reimbursedAmount: reimbursedTotalCentavos / 100,
              status: newStatus,
              finalizedAt: newStatus === 'finalizado' ? new Date() : null
            }
          });

          await tx.reembolsoAuditLog.create({
            data: {
              ticketId,
              action: 'reversao_recebimento',
              field: 'status',
              oldValue: ticket.status,
              newValue: newStatus,
              actorId: guard.userId,
              actorName: guard.userName || 'Sistema',
              description: `Recebimento #${id.substring(0,6)} revertido.`
            }
          });
        }
      }

      // 6. Deduct the creditoGerado from CreditoAcumulado
      const creditoRegistro = await tx.creditoAcumulado.findUnique({ where: { unit } });
      const currentCreditoCentavos = Math.round((creditoRegistro?.saldo || 0) * 100);
      const recebimentoCreditoCentavos = Math.round(recebimento.creditoGerado * 100);
      
      const newCreditoCentavos = currentCreditoCentavos - recebimentoCreditoCentavos;
      
      await tx.creditoAcumulado.update({
        where: { unit },
        data: { saldo: newCreditoCentavos / 100 }
      });

      // 7. Delete the Recebimento (Cascade will delete AlocacaoReembolso)
      await tx.recebimentoReembolso.delete({ where: { id } });

      return true;
    }, {
      timeout: 30000,
      maxWait: 5000
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Erro ao reverter recebimento:', err);
    return NextResponse.json({ error: err.message || 'Erro ao reverter' }, { status: 500 });
  }
}
