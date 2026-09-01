import { NextRequest, NextResponse } from 'next/server';
import {
  requireUnitGuard,
  UnitAccessDeniedError,
  unitAccessDeniedResponse,
} from '@/lib/unit-guard';
import { prisma } from '@/lib/db';
import { sendPushToAll } from '@/lib/push';
import { canApproveOrderChanges, validateRecognizedOrderMutation } from '@/lib/automatic-costs';
import type { Prisma } from '@prisma/client';

type ApprovedOrderUpdate = Pick<Prisma.OrderUncheckedUpdateInput,
  | 'productName'
  | 'quantity'
  | 'urgency'
  | 'status'
  | 'notes'
  | 'unitPrice'
  | 'totalPrice'
  | 'unit'
  | 'estimatedArrival'
  | 'sourceUrl'
>;

/* ─── Helper: notify users with specific permission ─── */
async function notifyUsersWithPerm(
  permKey: string,
  title: string,
  message: string,
  icon: string,
  type: string,
  link: string,
  unitScope?: string | null,
  excludeUserId?: string,
) {
  try {
    const allUsers = await prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, role: true, unit: true, permissions: true },
    });
    const targets = allUsers.filter((u) => {
      if (excludeUserId && u.id === excludeUserId) return false;
      const perms = (u.permissions as Record<string, boolean>) || {};
      const isAdmin = perms.admin === true || u.role === 'ADMINISTRADOR';
      if (unitScope && !isAdmin && u.unit !== unitScope) return false;
      return isAdmin || perms[permKey] === true;
    });
    if (targets.length === 0) return;
    await prisma.notification.createMany({
      data: targets.map((u) => ({ userId: u.id, type, title, message, icon, link, unit: unitScope || null })),
    });
  } catch (err) { console.error('notifyUsersWithPerm error:', err); }
}

// ═══════════════════════════════════════
// GET — List approvals (with filters)
// ═══════════════════════════════════════
export async function GET(request: NextRequest) {
  const guard = requireUnitGuard(request, { requestedUnit: request.nextUrl.searchParams.get('unit') });
  if (guard instanceof NextResponse) return guard;
  if (!canApproveOrderChanges(guard)) {
    return NextResponse.json({ error: 'Sem permissão para visualizar aprovações' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get('status') || 'pendente';
    const orderId = searchParams.get('orderId');

    const where: Prisma.OrderApprovalWhereInput = { status: statusFilter };
    if (orderId) where.orderId = orderId;
    if (guard.unitFilter) where.unit = guard.unitFilter;

    const approvals = await prisma.orderApproval.findMany({ where, orderBy: { createdAt: 'desc' } });
    const orders = approvals.length > 0
      ? await prisma.order.findMany({
          where: { id: { in: Array.from(new Set(approvals.map(approval => approval.orderId))) } },
          select: {
            id: true,
            productName: true,
            quantity: true,
            status: true,
            urgency: true,
            unit: true,
            batchNumber: true,
            unitPrice: true,
            totalPrice: true,
          },
        })
      : [];
    const ordersById = new Map(orders.map(order => [order.id, order]));
    const enriched = approvals.flatMap(approval => {
      const order = ordersById.get(approval.orderId) || null;
      try {
        guard.enforceUnit(order?.unit ?? approval.unit);
      } catch (error) {
        if (error instanceof UnitAccessDeniedError) return [];
        throw error;
      }
      return [{
        ...approval,
        changeData: JSON.parse(approval.changeData),
        order,
      }];
    });

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
  const guard = requireUnitGuard(request);
  if (guard instanceof NextResponse) return guard;
  if (!canApproveOrderChanges(guard)) {
    return NextResponse.json({ error: 'Sem permissão para aprovar/recusar alterações' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { approvalId, action, reason } = body;
    const userId = guard.userId;
    const userName = guard.userName || 'Aprovador';

    if (!approvalId || !action) return NextResponse.json({ error: 'approvalId e action são obrigatórios' }, { status: 400 });
    if (!['aprovar', 'recusar'].includes(action)) return NextResponse.json({ error: 'action inválida' }, { status: 400 });

    const approval = await prisma.orderApproval.findUnique({ where: { id: approvalId } });
    if (!approval) return NextResponse.json({ error: 'Aprovação não encontrada' }, { status: 404 });
    if (approval.status !== 'pendente') return NextResponse.json({ error: 'Aprovação já foi processada' }, { status: 400 });

    const currentOrder = await prisma.order.findUnique({ where: { id: approval.orderId } });
    if (!currentOrder) return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 });
    guard.enforceUnit(currentOrder.unit);
    const productName = currentOrder.productName;

    if (action === 'aprovar') {
      // Apply changes to the order
      const changeData = JSON.parse(approval.changeData) as Record<string, unknown>;
      const updateData: ApprovedOrderUpdate = {};
      if (typeof changeData.productName === 'string') updateData.productName = changeData.productName;
      if (changeData.quantity !== undefined) updateData.quantity = Number(changeData.quantity);
      if (typeof changeData.urgency === 'string') updateData.urgency = changeData.urgency;
      if (typeof changeData.status === 'string') updateData.status = changeData.status;
      if (typeof changeData.notes === 'string' || changeData.notes === null) updateData.notes = changeData.notes;
      if (changeData.unitPrice !== undefined) updateData.unitPrice = changeData.unitPrice !== null ? Number(changeData.unitPrice) : null;
      if (changeData.totalPrice !== undefined) updateData.totalPrice = changeData.totalPrice !== null ? Number(changeData.totalPrice) : null;
      if (typeof changeData.unit === 'string' || changeData.unit === null) updateData.unit = changeData.unit;
      if (changeData.estimatedArrival !== undefined) {
        updateData.estimatedArrival = typeof changeData.estimatedArrival === 'string'
          ? new Date(changeData.estimatedArrival)
          : null;
      }
      if (typeof changeData.sourceUrl === 'string' || changeData.sourceUrl === null) updateData.sourceUrl = changeData.sourceUrl;

      const mutationValidationMessage = validateRecognizedOrderMutation({
        isRecognized: Boolean(currentOrder.costRecognizedAt),
        nextStatus: typeof updateData.status === 'string' ? updateData.status : currentOrder.status,
        nextTotalPrice: Object.prototype.hasOwnProperty.call(updateData, 'totalPrice')
          ? updateData.totalPrice as number | null
          : currentOrder.totalPrice,
      });
      if (mutationValidationMessage) {
        return NextResponse.json({ error: mutationValidationMessage }, { status: 409 });
      }

      await prisma.order.update({ where: { id: approval.orderId }, data: updateData });

      // Mark approval as approved
      await prisma.orderApproval.update({
        where: { id: approvalId },
        data: { status: 'aprovado', reviewedBy: userId, reviewedByName: userName || 'Aprovador', reviewedAt: new Date() },
      });

      // Audit logs: one per changed field
      const changes: { field: string; oldValue: string | null; newValue: string | null }[] = [];
      const currentOrderValues = currentOrder as unknown as Record<string, unknown>;
      for (const [key, newVal] of Object.entries(updateData)) {
        const oldVal = currentOrderValues[key];
        changes.push({ field: key, oldValue: oldVal != null ? String(oldVal) : null, newValue: newVal != null ? String(newVal) : null });
      }

      await prisma.orderAuditLog.createMany({
        data: (changes.length > 0 ? changes : [{ field: null, oldValue: null, newValue: null }]).map(c => ({
          orderId: approval.orderId, approvalId: approval.id, action: 'alteracao_aprovada',
          field: c.field, oldValue: c.oldValue, newValue: c.newValue, reason: reason || null,
          actorId: approval.requesterId, actorName: approval.requesterName,
          approverId: userId, approverName: userName || 'Aprovador',
          productName, batchNumber: currentOrder.batchNumber, unit: currentOrder.unit,
        })),
      });

      // Notifications
      const notifMsg = `${userName || 'Aprovador'} aprovou a alteração em "${productName}" solicitada por ${approval.requesterName}`;
      notifyUsersWithPerm('pedidos', '✅ Alteração Aprovada', notifMsg, 'check_circle', 'success', '/pedidos', currentOrder.unit, userId).catch(() => {});
      sendPushToAll('✅ Pedido Aprovado', notifMsg, userId, currentOrder.unit).catch(() => {});

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
          productName, batchNumber: currentOrder.batchNumber, unit: currentOrder.unit,
        },
      });

      const notifMsg = `${userName || 'Aprovador'} recusou a alteração em "${productName}" solicitada por ${approval.requesterName}`;
      notifyUsersWithPerm('pedidos', '❌ Alteração Recusada', notifMsg, 'cancel', 'warning', '/pedidos', currentOrder.unit, userId).catch(() => {});
      sendPushToAll('❌ Pedido Recusado', notifMsg, userId, currentOrder.unit).catch(() => {});

      return NextResponse.json({ success: true, message: 'Solicitação recusada.' });
    }
  } catch (err) {
    if (err instanceof UnitAccessDeniedError) return unitAccessDeniedResponse(err);
    console.error('PUT approval error:', err);
    return NextResponse.json({ error: 'Erro ao processar aprovação' }, { status: 500 });
  }
}
