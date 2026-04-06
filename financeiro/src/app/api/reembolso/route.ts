import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/* ─── Helper: get user info + admin status ─── */
async function getUserInfo(userId?: string | null) {
  if (!userId) return { isAdmin: false, name: '', id: '' };
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, role: true, permissions: true } });
    if (!user) return { isAdmin: false, name: '', id: '' };
    const perms = (user.permissions as Record<string, boolean>) || {};
    const isAdmin = user.role === 'ADMINISTRADOR' || perms.admin === true;
    return { isAdmin, name: user.name, id: user.id };
  } catch { return { isAdmin: false, name: '', id: '' }; }
}

/* ─── Helper: create audit log ─── */
async function auditLog(opts: {
  ticketId: string; action: string; field?: string;
  oldValue?: string | null; newValue?: string | null;
  actorId?: string | null; actorName: string; description?: string;
}) {
  await prisma.reembolsoAuditLog.create({ data: {
    ticketId: opts.ticketId, action: opts.action, field: opts.field || null,
    oldValue: opts.oldValue || null, newValue: opts.newValue || null,
    actorId: opts.actorId || null, actorName: opts.actorName,
    description: opts.description || null,
  }});
}

/* ─── Helper: recalculate ticket amounts and status ─── */
async function recalcTicket(ticketId: string) {
  const items = await prisma.reembolsoItem.findMany({ where: { ticketId } });
  const total = items.reduce((s, i) => s + i.price, 0);
  const reimbursed = items.filter(i => i.isReimbursed).reduce((s, i) => s + i.price, 0);
  const allReimbursed = items.length > 0 && items.every(i => i.isReimbursed);
  const someReimbursed = items.some(i => i.isReimbursed);

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

  const ticket = await prisma.reembolsoTicket.update({
    where: { id: ticketId },
    data: {
      totalAmount: total,
      reimbursedAmount: reimbursed,
      status: newStatus,
      ...(finalizedAt ? { finalizedAt } : {}),
    },
    include: { items: true, attachments: { select: { id: true, fileName: true, fileType: true, fileSize: true, createdAt: true } } },
  });

  return ticket;
}


/* ════════════════════════════════════════════════
   GET: List reembolso tickets (role-aware)
   ════════════════════════════════════════════════ */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const unit = searchParams.get('unit');
    const userId = searchParams.get('userId');

    const { isAdmin } = await getUserInfo(userId);

    const where: Record<string, unknown> = {};
    if (status && status !== 'todos') where.status = status;
    if (unit && unit !== 'Todas' && unit !== 'all') where.unit = unit;

    if (isAdmin) {
      // Admin: vê todos os tickets da unidade (sem filtro de requesterId)
    } else if (userId) {
      // Usuário comum: vê apenas seus próprios + isCreatedByAdmin = false
      where.requesterId = userId;
      where.isCreatedByAdmin = false;
    } else {
      // Sem userId: retorna vazio por segurança
      return NextResponse.json([]);
    }

    const tickets = await prisma.reembolsoTicket.findMany({
      where,
      include: {
        items: true,
        attachments: { select: { id: true, fileName: true, fileType: true, fileSize: true, createdAt: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Strip large base64 payload from list response
    const safe = tickets.map(({ paymentProofData: _ppd, ...rest }) => rest);
    return NextResponse.json(safe);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Erro ao buscar tickets' }, { status: 500 });
  }
}


/* ════════════════════════════════════════════════
   POST: Create new reembolso ticket
   ════════════════════════════════════════════════ */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { requesterName, requesterId, unit, items, attachments } = body;

    if (!requesterName) return NextResponse.json({ error: 'Nome do solicitante obrigatório' }, { status: 400 });
    if (!items || !items.length) return NextResponse.json({ error: 'Pelo menos um produto é obrigatório' }, { status: 400 });
    if (!attachments || !attachments.length) return NextResponse.json({ error: 'Pelo menos um anexo/comprovante é obrigatório' }, { status: 400 });

    // Check if creator is admin
    const { isAdmin } = await getUserInfo(requesterId);

    const totalAmount = items.reduce((sum: number, item: { price: number }) => sum + (item.price || 0), 0);

    const ticket = await prisma.reembolsoTicket.create({
      data: {
        requesterName,
        requesterId: requesterId || null,
        unit: unit || 'Barueri',
        totalAmount,
        isCreatedByAdmin: isAdmin,
        items: {
          create: items.map((item: { name: string; price: number }) => ({
            name: item.name,
            price: item.price || 0,
          })),
        },
        attachments: {
          create: attachments.map((att: { fileName: string; fileType: string; fileSize: number; fileData: string }) => ({
            fileName: att.fileName,
            fileType: att.fileType,
            fileSize: att.fileSize,
            fileData: att.fileData,
          })),
        },
      },
      include: { items: true, attachments: { select: { id: true, fileName: true, fileType: true, fileSize: true, createdAt: true } } },
    });

    // Audit log
    await auditLog({
      ticketId: ticket.id, action: 'ticket_criado', actorId: requesterId,
      actorName: requesterName,
      description: `Ticket #${ticket.ticketNumber} criado com ${items.length} item(ns) — Total: R$ ${totalAmount.toFixed(2)}`,
    });

    // Notify admins
    try {
      const allUsers = await prisma.user.findMany({ where: { isActive: true }, select: { id: true, role: true, permissions: true } });
      const admins = allUsers.filter(u => {
        const perms = (u.permissions as Record<string, boolean>) || {};
        return u.role === 'ADMINISTRADOR' || perms.admin === true;
      });
      if (admins.length > 0) {
        await prisma.notification.createMany({
          data: admins.map(a => ({
            userId: a.id,
            type: 'alert',
            title: '📋 Nova Solicitação de Reembolso',
            message: `${requesterName} enviou reembolso #${ticket.ticketNumber} — R$ ${totalAmount.toFixed(2).replace('.', ',')} com ${items.length} item(ns).`,
            icon: 'receipt_long',
            link: '/?tab=reembolso',
          })),
        });
      }
    } catch {}

    return NextResponse.json(ticket, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Erro ao criar ticket' }, { status: 500 });
  }
}


/* ════════════════════════════════════════════════
   PUT: Update ticket (admin only) — edit fields, change status
   ════════════════════════════════════════════════ */
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { ticketId, status, adminNotes, userId, userName, paymentProof, editData } = body;

    if (!ticketId) return NextResponse.json({ error: 'ticketId obrigatório' }, { status: 400 });

    // Only admins can edit
    const { isAdmin, name: actorName } = await getUserInfo(userId);
    if (!isAdmin) return NextResponse.json({ error: 'Somente administradores podem editar reembolsos' }, { status: 403 });

    const currentTicket = await prisma.reembolsoTicket.findUnique({
      where: { id: ticketId },
      include: { items: true },
    });
    if (!currentTicket) return NextResponse.json({ error: 'Ticket não encontrado' }, { status: 404 });

    const name = userName || actorName || 'Admin';

    // ── Edit data (admin editing fields) ──
    if (editData) {
      const updateData: Record<string, any> = {};
      const changes: { field: string; old: string; new_: string }[] = [];

      if (editData.adminNotes !== undefined && editData.adminNotes !== currentTicket.adminNotes) {
        updateData.adminNotes = editData.adminNotes;
        changes.push({ field: 'adminNotes', old: currentTicket.adminNotes || '', new_: editData.adminNotes });
      }

      // Edit items if provided
      if (editData.items && Array.isArray(editData.items)) {
        for (const itemEdit of editData.items) {
          if (!itemEdit.id) continue;
          const currentItem = currentTicket.items.find(i => i.id === itemEdit.id);
          if (!currentItem) continue;

          const itemUpdate: Record<string, any> = {};
          if (itemEdit.name !== undefined && itemEdit.name !== currentItem.name) {
            itemUpdate.name = itemEdit.name;
            changes.push({ field: `item_nome (${currentItem.name})`, old: currentItem.name, new_: itemEdit.name });
          }
          if (itemEdit.price !== undefined && Number(itemEdit.price) !== currentItem.price) {
            itemUpdate.price = Number(itemEdit.price);
            changes.push({ field: `item_preco (${currentItem.name})`, old: String(currentItem.price), new_: String(itemEdit.price) });
          }
          if (Object.keys(itemUpdate).length > 0) {
            await prisma.reembolsoItem.update({ where: { id: itemEdit.id }, data: itemUpdate });
          }
        }
      }

      if (Object.keys(updateData).length > 0) {
        await prisma.reembolsoTicket.update({ where: { id: ticketId }, data: updateData });
      }

      // Audit log for each change
      for (const change of changes) {
        await auditLog({
          ticketId, action: 'ticket_editado', field: change.field,
          oldValue: change.old, newValue: change.new_, actorId: userId, actorName: name,
          description: `${change.field}: "${change.old}" → "${change.new_}"`,
        });
      }

      // Recalc totals
      const updated = await recalcTicket(ticketId);

      // Notify the requester
      if (currentTicket.requesterId && changes.length > 0) {
        try {
          await prisma.notification.create({
            data: {
              userId: currentTicket.requesterId,
              type: 'info', title: '✏️ Reembolso Atualizado',
              message: `O administrador ${name} editou seu reembolso #${currentTicket.ticketNumber}. ${changes.length} campo(s) alterado(s).`,
              icon: 'edit', link: '/?tab=reembolso',
            },
          });
        } catch {}
      }

      const { paymentProofData: _ppd, ...safe } = updated;
      return NextResponse.json(safe);
    }

    // ── Status change ──
    if (status) {
      const validStatuses = ['pendente', 'aprovado', 'reprovado', 'pago', 'parcialmente_reembolsado', 'reembolsado', 'finalizado'];
      if (!validStatuses.includes(status)) {
        return NextResponse.json({ error: `Status inválido. Use: ${validStatuses.join(', ')}` }, { status: 400 });
      }

      const updateData: Record<string, unknown> = {
        status,
        adminNotes: adminNotes || currentTicket.adminNotes,
        reviewedBy: name,
        reviewedAt: new Date(),
      };

      if (status === 'reprovado') {
        // Keep as is — just mark reprovado
      }

      if (status === 'pago' && paymentProof?.fileData) {
        updateData.paymentProofData = paymentProof.fileData;
        updateData.paymentProofName = paymentProof.fileName;
        updateData.paymentProofType = paymentProof.fileType;
        updateData.paidAt = new Date();
      }

      const ticket = await prisma.reembolsoTicket.update({
        where: { id: ticketId },
        data: updateData,
        include: { items: true, attachments: { select: { id: true, fileName: true, fileType: true, fileSize: true, createdAt: true } } },
      });

      // Audit log
      await auditLog({
        ticketId, action: 'status_alterado', field: 'status',
        oldValue: currentTicket.status, newValue: status,
        actorId: userId, actorName: name,
        description: `Status: "${currentTicket.status}" → "${status}"`,
      });

      // Notify requester
      if (currentTicket.requesterId) {
        const statusLabel = status === 'aprovado' ? '✅ Aprovado' : status === 'reprovado' ? '❌ Reprovado' : status === 'pago' ? '💰 Pago' : status === 'finalizado' ? '🎉 Finalizado' : 'Atualizado';
        const message = status === 'pago'
          ? `Seu reembolso #${ticket.ticketNumber} (R$ ${ticket.totalAmount.toFixed(2).replace('.', ',')}) foi pago!${adminNotes ? ` Obs: ${adminNotes}` : ''}`
          : status === 'reprovado'
            ? `Seu reembolso #${ticket.ticketNumber} foi reprovado.${adminNotes ? ` Motivo: ${adminNotes}` : ''}`
            : `Seu reembolso #${ticket.ticketNumber} foi ${statusLabel.toLowerCase()} por ${name}.`;

        try {
          await prisma.notification.create({
            data: {
              userId: currentTicket.requesterId,
              type: status === 'reprovado' ? 'warning' : 'success',
              title: `Reembolso #${ticket.ticketNumber} — ${statusLabel}`,
              message, icon: status === 'pago' ? 'paid' : 'receipt_long',
              link: '/?tab=reembolso',
            },
          });
        } catch {}
      }

      const { paymentProofData: _ppd, ...safe } = ticket;
      return NextResponse.json(safe);
    }

    return NextResponse.json({ error: 'Nenhuma ação especificada' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Erro ao atualizar ticket' }, { status: 500 });
  }
}
