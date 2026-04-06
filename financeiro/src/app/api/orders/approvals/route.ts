import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { sendPushToAll } from '@/lib/push';

/* ─── Helper: get user permissions ─── */
async function getUserPerms(userId?: string) {
  if (!userId) return { isAdmin: false, canApprove: false };
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, permissions: true } });
    if (!user) return { isAdmin: false, canApprove: false };
    const perms = (user.permissions as Record<string, boolean>) || {};
    const isAdmin = user.role === 'ADMINISTRADOR' || perms.admin === true;
    return { isAdmin, canApprove: isAdmin || perms.pedidosAprovar === true };
  } catch { return { isAdmin: false, canApprove: false }; }
}

/* ─── Helper: notify users with specific permission ─── */
async function notifyUsersWithPerm(permKey: string, title: string, message: string, icon: string, type: string, link: string, excludeUserId?: string) {
  try {
    const allUsers = await prisma.user.findMany({ where: { isActive: true }, select: { id: true, role: true, permissions: true } });
    const targets = allUsers.filter((u) => {
      if (excludeUserId && u.id === excludeUserId) return false;
      const perms = (u.permissions as Record<string, boolean>) || {};
      return perms.admin === true || u.role === 'ADMINISTRADOR' || perms[permKey] === true;
    });
    if (targets.length === 0) return;
    await prisma.notification.createMany({ data: targets.map((u) => ({ userId: u.id, type, title, message, icon, link })) });
  } catch (err) { console.error('notifyUsersWithPerm error:', err); }
}

// ═══════════════════════════════════════
// GET — List approvals (with filters)
// ═══════════════════════════════════════
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get('status') || 'pendente';
    const orderId = searchParams.get('orderId');

    const where: any = { status: statusFilter };
    if (orderId) where.orderId = orderId;

    const approvals = await prisma.orderApproval.findMany({ where, orderBy: { createdAt: 'desc' } });

    const enriched = await Promise.all(
      approvals.map(async (a: any) => {
        const order = await prisma.order.findUnique({ where: { id: a.orderId } });
        return {
          ...a,
          changeData: JSON.parse(a.changeData),
          order: order ? {
            id: order.id, productName: order.productName, quantity: order.quantity,
            status: order.status, urgency: order.urgency, unit: order.unit, batchNumber: order.batchNumber,
            unitPrice: order.unitPrice, totalPrice: order.totalPrice,
          } : null,
        };
      })
    );

    return NextResponse.json(enriched);
  } catch (err) {
    console.error('GET approvals error:', err);
    return NextResponse.json({ error: 'Erro ao buscar aprovações' }, { status: 500 });
  }
}

// ═══════════════════════════════════════
// PUT — Approve or reject
// ═══════════════════════════════════════
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { approvalId, action, userId, userName, reason } = body;

    if (!approvalId || !action) return NextResponse.json({ error: 'approvalId e action são obrigatórios' }, { status: 400 });
    if (!['aprovar', 'recusar'].includes(action)) return NextResponse.json({ error: 'action inválida' }, { status: 400 });

    // Check permission: pedidosAprovar
    const { canApprove } = await getUserPerms(userId);
    if (!canApprove) return NextResponse.json({ error: 'Sem permissão para aprovar/recusar alterações' }, { status: 403 });

    const approval = await prisma.orderApproval.findUnique({ where: { id: approvalId } });
    if (!approval) return NextResponse.json({ error: 'Aprovação não encontrada' }, { status: 404 });
    if (approval.status !== 'pendente') return NextResponse.json({ error: 'Aprovação já foi processada' }, { status: 400 });

    const currentOrder = await prisma.order.findUnique({ where: { id: approval.orderId } });
    const productName = currentOrder?.productName || 'Pedido';

    if (action === 'aprovar') {
      // Apply changes to the order
      const changeData = JSON.parse(approval.changeData);
      const updateData: any = {};
      if (changeData.productName !== undefined) updateData.productName = changeData.productName;
      if (changeData.quantity !== undefined) updateData.quantity = Number(changeData.quantity);
      if (changeData.urgency !== undefined) updateData.urgency = changeData.urgency;
      if (changeData.status !== undefined) updateData.status = changeData.status;
      if (changeData.notes !== undefined) updateData.notes = changeData.notes;
      if (changeData.unitPrice !== undefined) updateData.unitPrice = changeData.unitPrice !== null ? Number(changeData.unitPrice) : null;
      if (changeData.totalPrice !== undefined) updateData.totalPrice = changeData.totalPrice !== null ? Number(changeData.totalPrice) : null;
      if (changeData.unit !== undefined) updateData.unit = changeData.unit;
      if (changeData.estimatedArrival !== undefined) updateData.estimatedArrival = changeData.estimatedArrival ? new Date(changeData.estimatedArrival) : null;
      if (changeData.sourceUrl !== undefined) updateData.sourceUrl = changeData.sourceUrl || null;

      await prisma.order.update({ where: { id: approval.orderId }, data: updateData });

      // Mark approval as approved
      await prisma.orderApproval.update({
        where: { id: approvalId },
        data: { status: 'aprovado', reviewedBy: userId, reviewedByName: userName || 'Aprovador', reviewedAt: new Date() },
      });

      // Audit logs: one per changed field
      const changes: { field: string; oldValue: string | null; newValue: string | null }[] = [];
      if (currentOrder) {
        for (const [key, newVal] of Object.entries(updateData)) {
          const oldVal = (currentOrder as any)[key];
          changes.push({ field: key, oldValue: oldVal != null ? String(oldVal) : null, newValue: newVal != null ? String(newVal) : null });
        }
      }

      await prisma.orderAuditLog.createMany({
        data: (changes.length > 0 ? changes : [{ field: null, oldValue: null, newValue: null }]).map(c => ({
          orderId: approval.orderId, approvalId: approval.id, action: 'alteracao_aprovada',
          field: c.field, oldValue: c.oldValue, newValue: c.newValue, reason: reason || null,
          actorId: approval.requesterId, actorName: approval.requesterName,
          approverId: userId, approverName: userName || 'Aprovador',
          productName, batchNumber: currentOrder?.batchNumber, unit: currentOrder?.unit,
        })),
      });

      // Notifications
      const notifMsg = `${userName || 'Aprovador'} aprovou a alteração em "${productName}" solicitada por ${approval.requesterName}`;
      notifyUsersWithPerm('pedidos', '✅ Alteração Aprovada', notifMsg, 'check_circle', 'success', '/pedidos').catch(() => {});
      sendPushToAll('✅ Pedido Aprovado', notifMsg).catch(() => {});

      return NextResponse.json({ success: true, message: 'Aprovação concedida e alterações aplicadas.' });
    } else {
      // Reject
      await prisma.orderApproval.update({
        where: { id: approvalId },
        data: { status: 'recusado', reviewedBy: userId, reviewedByName: userName || 'Aprovador', reviewedAt: new Date() },
      });

      // Audit log
      await prisma.orderAuditLog.create({
        data: {
          orderId: approval.orderId, approvalId: approval.id, action: 'alteracao_recusada',
          reason: reason || null, actorId: approval.requesterId, actorName: approval.requesterName,
          approverId: userId, approverName: userName || 'Aprovador',
          productName, batchNumber: currentOrder?.batchNumber, unit: currentOrder?.unit,
        },
      });

      const notifMsg = `${userName || 'Aprovador'} recusou a alteração em "${productName}" solicitada por ${approval.requesterName}`;
      notifyUsersWithPerm('pedidos', '❌ Alteração Recusada', notifMsg, 'cancel', 'warning', '/pedidos').catch(() => {});
      sendPushToAll('❌ Pedido Recusado', notifMsg).catch(() => {});

      return NextResponse.json({ success: true, message: 'Solicitação recusada.' });
    }
  } catch (err) {
    console.error('PUT approval error:', err);
    return NextResponse.json({ error: 'Erro ao processar aprovação' }, { status: 500 });
  }
}
