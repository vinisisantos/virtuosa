import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUnitGuard, UnitAccessDeniedError, unitAccessDeniedResponse } from '@/lib/unit-guard';

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
  const guard = requireUnitGuard(req, { requestedUnit: new URL(req.url).searchParams.get('unit') });
  if (guard instanceof NextResponse) return guard;

  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');

    const where: Record<string, unknown> = {};
    if (status && status !== 'todos') where.status = status;
    
    // Privacy: Reembolsos are completely personal and global. 
    // We do NOT filter by unit, and we do NOT let admins see others' reembolsos.
    where.requesterId = guard.userId;

    const tickets = await prisma.reembolsoTicket.findMany({
      where,
      include: {
        items: true,
        attachments: { select: { id: true, fileName: true, fileType: true, fileSize: true, createdAt: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

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
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  try {
    const body = await req.json();
    const { items, attachments } = body;
    const requesterName = guard.userName || body.requesterName;
    const requesterId = guard.userId;

    if (!requesterName) return NextResponse.json({ error: 'Nome do solicitante obrigatório' }, { status: 400 });
    
    

    const { isAdmin } = await getUserInfo(requesterId);
    const totalAmount = (items || []).reduce((sum: number, item: any) => sum + (item.price || 0), 0);

    const ticket = await prisma.reembolsoTicket.create({
      data: {
        requesterName,
        requesterId: requesterId || null,
        unit: guard.createUnit(), // UNIT GUARD: Force JWT unit
        totalAmount,
        isCreatedByAdmin: isAdmin,
        items: items && items.length > 0 ? {
          create: items.map((item: any) => ({
            name: item.name, price: item.price || 0,
            expenseDate: item.expenseDate ? new Date(item.expenseDate) : null,
            description: item.description || null,
          })),
        } : undefined,
        attachments: {
          create: attachments.map((att: { fileName: string; fileType: string; fileSize: number; fileData: string }) => ({
            fileName: att.fileName, fileType: att.fileType, fileSize: att.fileSize, fileData: att.fileData,
          })),
        },
      },
      include: { items: true, attachments: { select: { id: true, fileName: true, fileType: true, fileSize: true, createdAt: true } } },
    });

    await auditLog({
      ticketId: ticket.id, action: 'ticket_criado', actorId: requesterId,
      actorName: requesterName,
      description: `Ticket #${ticket.ticketNumber} criado com ${items.length} item(ns) — Total: R$ ${totalAmount.toFixed(2)}`,
    });

    // Notify admins in the same unit
    try {
      const allUsers = await prisma.user.findMany({ where: { isActive: true, unit: guard.userUnit }, select: { id: true, role: true, permissions: true } });
      const admins = allUsers.filter(u => {
        const perms = (u.permissions as Record<string, boolean>) || {};
        return u.role === 'ADMINISTRADOR' || perms.admin === true;
      });
      if (admins.length > 0) {
        await prisma.notification.createMany({
          data: admins.map(a => ({
            userId: a.id, type: 'alert', title: '📋 Nova Solicitação de Reembolso',
            message: `${requesterName} enviou reembolso #${ticket.ticketNumber} — R$ ${totalAmount.toFixed(2).replace('.', ',')} com ${items.length} item(ns).`,
            icon: 'receipt_long', link: '/?tab=reembolso', unit: guard.userUnit,
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
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  try {
    const body = await req.json();
    const { ticketId, status, adminNotes, paymentProof, editData } = body;

    if (!ticketId) return NextResponse.json({ error: 'ticketId obrigatório' }, { status: 400 });

    // Only admins can edit
    if (!guard.isAdmin) return NextResponse.json({ error: 'Somente administradores podem editar reembolsos' }, { status: 403 });

    const currentTicket = await prisma.reembolsoTicket.findUnique({
      where: { id: ticketId },
      include: { items: true },
    });
    if (!currentTicket) return NextResponse.json({ error: 'Ticket não encontrado' }, { status: 404 });

    // UNIT GUARD: Validate record belongs to user's unit
    try { guard.enforceUnit(currentTicket.unit); } catch (e) {
      if (e instanceof UnitAccessDeniedError) return unitAccessDeniedResponse();
      throw e;
    }

    const name = guard.userName || 'Admin';

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
            changes.push({ field: `item_preco (${currentItem.name}
          if (itemEdit.expenseDate !== undefined) {
            itemUpdate.expenseDate = itemEdit.expenseDate ? new Date(itemEdit.expenseDate) : null;
          }
          if (itemEdit.description !== undefined && itemEdit.description !== currentItem.description) {
            itemUpdate.description = itemEdit.description;
          })`, old: String(currentItem.price), new_: String(itemEdit.price) });
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
          oldValue: change.old, newValue: change.new_, actorId: guard.userId, actorName: name,
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
      const validStatuses = ['rascunho', 'pendente', 'aprovado', 'reprovado', 'pago', 'parcialmente_reembolsado', 'reembolsado', 'finalizado'];
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
        actorId: guard.userId, actorName: name,
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
