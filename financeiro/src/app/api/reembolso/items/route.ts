import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/* ─── Helper: get user info ─── */
async function getUserInfo(userId?: string | null) {
  if (!userId) return { isAdmin: false, name: '', id: '' };
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, role: true, permissions: true } });
    if (!user) return { isAdmin: false, name: '', id: '' };
    const perms = (user.permissions as Record<string, boolean>) || {};
    return { isAdmin: user.role === 'ADMINISTRADOR' || perms.admin === true, name: user.name, id: user.id };
  } catch { return { isAdmin: false, name: '', id: '' }; }
}

/* ═══════════════════════════════
   PUT: Toggle item reimbursement
   ═══════════════════════════════ */
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { itemId, isReimbursed, userId, userName } = body;

    if (!itemId) return NextResponse.json({ error: 'itemId obrigatório' }, { status: 400 });
    if (typeof isReimbursed !== 'boolean') return NextResponse.json({ error: 'isReimbursed obrigatório' }, { status: 400 });

    // Only admins can toggle items
    const { isAdmin, name: actorName } = await getUserInfo(userId);
    if (!isAdmin) return NextResponse.json({ error: 'Somente administradores podem marcar itens' }, { status: 403 });

    const name = userName || actorName || 'Admin';

    // Get the item
    const item = await prisma.reembolsoItem.findUnique({ where: { id: itemId } });
    if (!item) return NextResponse.json({ error: 'Item não encontrado' }, { status: 404 });

    // Update item
    await prisma.reembolsoItem.update({
      where: { id: itemId },
      data: {
        isReimbursed,
        reimbursedAt: isReimbursed ? new Date() : null,
        reimbursedBy: isReimbursed ? name : null,
      },
    });

    // Audit log
    await prisma.reembolsoAuditLog.create({
      data: {
        ticketId: item.ticketId,
        action: isReimbursed ? 'item_reembolsado' : 'item_desreembolsado',
        field: 'isReimbursed',
        oldValue: String(!isReimbursed),
        newValue: String(isReimbursed),
        actorId: userId || null,
        actorName: name,
        description: `${isReimbursed ? '✅ Marcou' : '↩️ Desmarcou'} item "${item.name}" (R$ ${item.price.toFixed(2)})`,
      },
    });

    // Recalculate ticket totals and status
    const ticketItems = await prisma.reembolsoItem.findMany({ where: { ticketId: item.ticketId } });
    const reimbursedAmount = ticketItems.filter(i => i.isReimbursed).reduce((s, i) => s + i.price, 0);
    const allReimbursed = ticketItems.length > 0 && ticketItems.every(i => i.isReimbursed);
    const someReimbursed = ticketItems.some(i => i.isReimbursed);

    const ticket = await prisma.reembolsoTicket.findUnique({ where: { id: item.ticketId } });
    const oldStatus = ticket?.status || 'pendente';

    let newStatus: string;
    let finalizedAt: Date | null = null;

    if (allReimbursed) {
      newStatus = 'finalizado';
      finalizedAt = new Date();
    } else if (someReimbursed) {
      newStatus = 'parcialmente_reembolsado';
    } else {
      newStatus = 'pendente';
    }

    const updateData: Record<string, any> = {
      reimbursedAmount,
      status: newStatus,
    };
    if (finalizedAt) updateData.finalizedAt = finalizedAt;
    if (newStatus !== 'finalizado' && ticket?.finalizedAt) updateData.finalizedAt = null;

    const updatedTicket = await prisma.reembolsoTicket.update({
      where: { id: item.ticketId },
      data: updateData,
      include: {
        items: true,
        attachments: { select: { id: true, fileName: true, fileType: true, fileSize: true, createdAt: true } },
      },
    });

    // If status changed, audit it
    if (oldStatus !== newStatus) {
      await prisma.reembolsoAuditLog.create({
        data: {
          ticketId: item.ticketId, action: newStatus === 'finalizado' ? 'ticket_finalizado' : 'status_alterado',
          field: 'status', oldValue: oldStatus, newValue: newStatus,
          actorId: userId || null, actorName: name,
          description: newStatus === 'finalizado'
            ? `🎉 Ticket finalizado — 100% dos itens reembolsados (R$ ${reimbursedAmount.toFixed(2)})`
            : `Status: "${oldStatus}" → "${newStatus}"`,
        },
      });
    }

    // Notify requester
    if (ticket?.requesterId) {
      const msg = allReimbursed
        ? `🎉 Seu reembolso #${ticket.ticketNumber} foi totalmente reembolsado! Valor: R$ ${reimbursedAmount.toFixed(2).replace('.', ',')}`
        : isReimbursed
          ? `O item "${item.name}" (R$ ${item.price.toFixed(2).replace('.', ',')}) do seu reembolso #${ticket.ticketNumber} foi marcado como reembolsado por ${name}.`
          : `O item "${item.name}" do seu reembolso #${ticket.ticketNumber} foi desmarcado por ${name}.`;

      try {
        await prisma.notification.create({
          data: {
            userId: ticket.requesterId,
            type: allReimbursed ? 'success' : 'info',
            title: allReimbursed ? `🎉 Reembolso #${ticket.ticketNumber} Concluído` : `📋 Reembolso #${ticket.ticketNumber} Atualizado`,
            message: msg, icon: allReimbursed ? 'verified' : 'receipt_long',
            link: '/?tab=reembolso',
          },
        });
      } catch {}
    }

    const { paymentProofData: _ppd, ...safe } = updatedTicket;
    return NextResponse.json(safe);
  } catch (err: any) {
    console.error('PUT reembolso/items error:', err);
    return NextResponse.json({ error: err.message || 'Erro ao atualizar item' }, { status: 500 });
  }
}
