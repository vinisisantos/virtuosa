import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { sendPushToAll } from '@/lib/push';
import { requireUnitGuard, UnitAccessDeniedError, unitAccessDeniedResponse } from '@/lib/unit-guard';

/* ─── Field label map for UI-friendly audit ─── */
const FIELD_LABELS: Record<string, string> = {
  productName: 'Produto', quantity: 'Quantidade', urgency: 'Urgência',
  status: 'Status', notes: 'Observação', unitPrice: 'Preço Unitário',
  totalPrice: 'Preço Total', unit: 'Unidade', estimatedArrival: 'Previsão de Chegada',
  sourceUrl: 'URL do Produto',
};

/* ─── Helper: get user + permissions ─── */
async function getUserPerms(userId?: string) {
  if (!userId) return { isAdmin: false, canEditDirect: false, canApprove: false };
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, permissions: true } });
    if (!user) return { isAdmin: false, canEditDirect: false, canApprove: false };
    const perms = (user.permissions as Record<string, boolean>) || {};
    const isAdmin = user.role === 'ADMINISTRADOR' || perms.admin === true;
    return {
      isAdmin,
      canEditDirect: isAdmin || perms.pedidosEditarDireto === true,
      canApprove: isAdmin || perms.pedidosAprovar === true,
    };
  } catch { return { isAdmin: false, canEditDirect: false, canApprove: false }; }
}

/* ─── Helper: create audit log entries for each changed field ─── */
async function createAuditLogs(opts: {
  orderId: string; approvalId?: string; action: string; reason?: string;
  actorId?: string; actorName: string; approverId?: string; approverName?: string;
  productName: string; batchNumber?: number | null; unit?: string | null;
  changes: { field: string; oldValue: string | null; newValue: string | null }[];
}) {
  const { orderId, approvalId, action, reason, actorId, actorName, approverId, approverName, productName, batchNumber, unit, changes } = opts;
  if (changes.length === 0) {
    // No specific field changes — log as a general entry
    await prisma.orderAuditLog.create({
      data: { orderId, approvalId, action, reason, actorId, actorName, approverId, approverName, productName, batchNumber, unit },
    });
    return;
  }
  await prisma.orderAuditLog.createMany({
    data: changes.map(c => ({
      orderId, approvalId, action, field: c.field, oldValue: c.oldValue, newValue: c.newValue,
      reason, actorId, actorName, approverId, approverName, productName, batchNumber, unit,
    })),
  });
}

/* ─── Helper: compute field-level changes ─── */
function computeChanges(currentOrder: any, updateFields: Record<string, any>): { field: string; oldValue: string | null; newValue: string | null }[] {
  const changes: { field: string; oldValue: string | null; newValue: string | null }[] = [];
  for (const [key, newVal] of Object.entries(updateFields)) {
    const oldVal = currentOrder[key];
    const oldStr = oldVal !== null && oldVal !== undefined ? String(oldVal) : null;
    const newStr = newVal !== null && newVal !== undefined ? String(newVal) : null;
    if (oldStr !== newStr) {
      changes.push({ field: key, oldValue: oldStr, newValue: newStr });
    }
  }
  return changes;
}

/* ─── Helper: notify users with specific permission (unit-scoped) ─── */
async function notifyUsersWithPerm(
  permKey: string, title: string, message: string, icon: string, type: string, link: string, unitScope?: string, excludeUserId?: string,
) {
  try {
    const userWhere: any = { isActive: true };
    if (unitScope) userWhere.unit = unitScope;
    const allUsers = await prisma.user.findMany({ where: userWhere, select: { id: true, role: true, permissions: true } });
    const targets = allUsers.filter((u) => {
      if (excludeUserId && u.id === excludeUserId) return false;
      const perms = (u.permissions as Record<string, boolean>) || {};
      return perms.admin === true || u.role === 'ADMINISTRADOR' || perms[permKey] === true;
    });
    if (targets.length === 0) return;
    await prisma.notification.createMany({ data: targets.map((u) => ({ userId: u.id, type, title, message, icon, link, unit: unitScope || null })) });
  } catch (err) { console.error('notifyUsersWithPerm error:', err); }
}

/* ─── Helper: notify users with pedidos permission ─── */
async function notifyPedidosUsers(title: string, message: string, icon: string, type: string, link: string, unitScope?: string, excludeUserId?: string) {
  return notifyUsersWithPerm('pedidos', title, message, icon, type, link, unitScope, excludeUserId);
}


// ═════════════════════════════════════════════════════════════
// GET — List all orders
// ═════════════════════════════════════════════════════════════
export async function GET(request: NextRequest) {
    const guard = requireUnitGuard(request, { requestedUnit: new URL(request.url).searchParams.get('unit') });
    if (guard instanceof NextResponse) return guard;

    try {
        const { searchParams } = new URL(request.url);
        const search = searchParams.get('search')?.toLowerCase() || '';
        const status = searchParams.get('status') || 'All';
        const urgency = searchParams.get('urgency') || 'All';
        const dateFrom = searchParams.get('dateFrom');
        const dateTo = searchParams.get('dateTo');

        const whereClause: any = {};
        // UNIT GUARD: Filter by JWT unit
        if (guard.unitFilter) whereClause.unit = guard.unitFilter;
        if (search) whereClause.productName = { contains: search };
        if (status && status !== 'All') whereClause.status = status;
        if (urgency && urgency !== 'All') whereClause.urgency = urgency;
        if (dateFrom || dateTo) {
            whereClause.createdAt = {};
            if (dateFrom) whereClause.createdAt.gte = new Date(dateFrom);
            if (dateTo) { const end = new Date(dateTo); end.setDate(end.getDate() + 1); whereClause.createdAt.lte = end; }
        }

        const orders = await prisma.order.findMany({ where: whereClause, orderBy: { createdAt: 'desc' } });
        return NextResponse.json(orders);
    } catch (err) {
        console.error('GET orders error:', err);
        return NextResponse.json({ error: 'Erro ao buscar pedidos' }, { status: 500 });
    }
}


// ═════════════════════════════════════════════════════════════
// POST — Create new orders
// ═════════════════════════════════════════════════════════════
export async function POST(request: NextRequest) {
    const guard = requireUnitGuard(request);
    if (guard instanceof NextResponse) return guard;

    try {
        const body = await request.json();
        const userName = guard.userName || 'Alguém';
        const userId = guard.userId;
        let orderItems: any[];

        if (Array.isArray(body)) { orderItems = body; }
        else if (body.items && Array.isArray(body.items)) { orderItems = body.items; }
        else { orderItems = [body]; }

        // UNIT GUARD: Force JWT unit on all created orders
        const forcedUnit = guard.createUnit();
        const validOrders = orderItems.map((item: any) => {
            const { productName, quantity, urgency, notes, unitPrice, totalPrice, sourceUrl } = item;
            if (!productName || !quantity || !urgency) throw new Error('Campos obrigatórios ausentes em um ou mais itens');
            return { productName, quantity: Number(quantity), urgency, status: 'Aguardando', unit: forcedUnit, notes: notes || null, unitPrice: unitPrice ? Number(unitPrice) : null, totalPrice: totalPrice ? Number(totalPrice) : null, sourceUrl: sourceUrl || null };
        });

        const lastBatch = await prisma.order.findFirst({ orderBy: { batchNumber: 'desc' }, where: { batchNumber: { not: null } }, select: { batchNumber: true } });
        const nextBatch = (lastBatch?.batchNumber || 0) + 1;
        const newOrders = await prisma.order.createMany({ data: validOrders.map(o => ({ ...o, batchNumber: nextBatch })) });

        const createdOrders = await prisma.order.findMany({ where: { batchNumber: nextBatch }, orderBy: { createdAt: 'desc' } });
        for (const order of createdOrders) {
            await createAuditLogs({
                orderId: order.id, action: 'pedido_criado', actorId: userId, actorName: userName,
                productName: order.productName, batchNumber: nextBatch, unit: order.unit, changes: [],
            });
        }

        const count = validOrders.length;
        const pushTitle = '🛒 Novo Pedido';
        const pushBody = count > 1 ? `${userName} adicionou ${count} itens no Lote #${nextBatch}` : `${userName} adicionou: ${validOrders[0].productName} (Lote #${nextBatch})`;
        sendPushToAll(pushTitle, pushBody, userId, forcedUnit).catch(() => {});
        const notifMsg = count > 1 ? `${userName} adicionou ${count} itens no Lote #${nextBatch}.` : `${userName} adicionou o pedido: "${validOrders[0].productName}" (Qtd: ${validOrders[0].quantity}, Urgência: ${validOrders[0].urgency}) — Lote #${nextBatch}`;
        notifyPedidosUsers('🛒 Novo Pedido Criado', notifMsg, 'shopping_cart', 'info', '/pedidos', forcedUnit, userId).catch(() => {});

        return NextResponse.json({ success: true, count: newOrders.count, batchNumber: nextBatch }, { status: 201 });
    } catch (err: any) {
        console.error('POST order error:', err);
        return NextResponse.json({ error: err.message || 'Erro ao criar pedido(s)' }, { status: 500 });
    }
}


// ═════════════════════════════════════════════════════════════
// PUT — Update an order (permission-aware)
// ═════════════════════════════════════════════════════════════
export async function PUT(request: NextRequest) {
    const guard = requireUnitGuard(request);
    if (guard instanceof NextResponse) return guard;

    try {
        const body = await request.json();
        const { id, productName, quantity, urgency, status, notes, estimatedArrival, unitPrice, totalPrice, unit, sourceUrl, reason } = body;

        if (!id) return NextResponse.json({ error: 'ID do pedido é obrigatório' }, { status: 400 });

        const currentOrder = await prisma.order.findUnique({ where: { id } });
        if (!currentOrder) return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 });

        // UNIT GUARD: Validate record belongs to user's unit
        try { guard.enforceUnit(currentOrder.unit); } catch (e) {
          if (e instanceof UnitAccessDeniedError) return unitAccessDeniedResponse();
          throw e;
        }

        const updateFields: Record<string, any> = {};
        if (productName !== undefined && productName !== currentOrder.productName) updateFields.productName = productName;
        if (quantity !== undefined && Number(quantity) !== currentOrder.quantity) updateFields.quantity = Number(quantity);
        if (urgency !== undefined && urgency !== currentOrder.urgency) updateFields.urgency = urgency;
        if (status !== undefined && status !== currentOrder.status) updateFields.status = status;
        if (notes !== undefined && notes !== currentOrder.notes) updateFields.notes = notes;
        if (unitPrice !== undefined) { const v = unitPrice !== null ? Number(unitPrice) : null; if (v !== currentOrder.unitPrice) updateFields.unitPrice = v; }
        if (totalPrice !== undefined) { const v = totalPrice !== null ? Number(totalPrice) : null; if (v !== currentOrder.totalPrice) updateFields.totalPrice = v; }
        // UNIT GUARD: Only admins can change unit
        if (unit !== undefined && unit !== currentOrder.unit && guard.isAdmin) updateFields.unit = unit;
        if (estimatedArrival !== undefined) {
            const newEta = estimatedArrival ? new Date(estimatedArrival) : null;
            const curEta = currentOrder.estimatedArrival ? new Date(currentOrder.estimatedArrival).toISOString() : null;
            if ((newEta?.toISOString() || null) !== curEta) updateFields.estimatedArrival = newEta;
        }
        if (sourceUrl !== undefined && (sourceUrl || null) !== currentOrder.sourceUrl) updateFields.sourceUrl = sourceUrl || null;

        if (Object.keys(updateFields).length === 0) {
            return NextResponse.json({ success: true, message: 'Nenhuma alteração detectada.' });
        }

        const actor = guard.userName || 'Alguém';
        const userId = guard.userId;
        const { canEditDirect } = await getUserPerms(userId);
        const changes = computeChanges(currentOrder, updateFields);
        const changesDesc = changes.map(c => `${FIELD_LABELS[c.field] || c.field}: "${c.oldValue || '—'}" → "${c.newValue || '—'}"`).join('; ');
        const changeDescription = `alterar "${currentOrder.productName}": ${changesDesc}`;

        // Permite edição direta se o usuário tiver permissão, ou se estiver mudando apenas o status (e opcionalmente previsão de chegada)
        const nonStatusChanges = changes.filter(c => c.field !== 'status' && c.field !== 'estimatedArrival');
        const effectiveCanEditDirect = canEditDirect || (changes.length > 0 && nonStatusChanges.length === 0);

        if (effectiveCanEditDirect) {
            await prisma.order.update({ where: { id }, data: updateFields });
            const approval = await prisma.orderApproval.create({
                data: {
                    orderId: id, requesterId: userId || null, requesterName: actor,
                    changeType: 'direct_edit', changeData: JSON.stringify(updateFields),
                    description: changeDescription, reason: reason || null, status: 'direto',
                    reviewedBy: userId || null, reviewedByName: actor, reviewedAt: new Date(),
                    unit: guard.userUnit,
                },
            });
            await createAuditLogs({
                orderId: id, approvalId: approval.id, action: 'alteracao_direta', reason: reason || undefined,
                actorId: userId, actorName: actor, productName: currentOrder.productName,
                batchNumber: currentOrder.batchNumber, unit: currentOrder.unit, changes,
            });
            const pushBody = `${actor} alterou diretamente: ${currentOrder.productName}`;
            sendPushToAll('📦 Pedido Atualizado', pushBody, userId, currentOrder.unit).catch(() => {});
            notifyPedidosUsers('📦 Pedido Atualizado', `${actor} alterou o pedido "${currentOrder.productName}" diretamente.`, 'inventory_2', 'info', '/pedidos', guard.userUnit, userId).catch(() => {});
            return NextResponse.json({ success: true });
        }

        const approval = await prisma.orderApproval.create({
            data: {
                orderId: id, requesterId: userId || null, requesterName: actor,
                changeType: status && status !== currentOrder.status ? 'status_change' : 'edit',
                changeData: JSON.stringify(updateFields), description: changeDescription,
                reason: reason || null, status: 'pendente', unit: guard.userUnit,
            },
        });
        await createAuditLogs({
            orderId: id, approvalId: approval.id, action: 'solicitacao_criada', reason: reason || undefined,
            actorId: userId, actorName: actor, productName: currentOrder.productName,
            batchNumber: currentOrder.batchNumber, unit: currentOrder.unit, changes,
        });
        const approvalMsg = `${actor} solicitou ${changeDescription}. Acesse Pedidos para aprovar.`;
        notifyUsersWithPerm('pedidosAprovar', '⚠️ Aprovação Necessária — Pedido', approvalMsg, 'approval', 'warning', '/pedidos', guard.userUnit, userId).catch(() => {});
        sendPushToAll('⚠️ Aprovação de Pedido', `${actor} solicitou alteração em "${currentOrder.productName}"`, userId, guard.userUnit).catch(() => {});

        return NextResponse.json({ success: false, pendingApproval: true, message: 'Solicitação enviada para aprovação.' });
    } catch (err) {
        console.error('PUT order error:', err);
        return NextResponse.json({ error: 'Erro ao atualizar pedido' }, { status: 500 });
    }
}


// ═════════════════════════════════════════════════════════════
// DELETE — Remove an order
// ═════════════════════════════════════════════════════════════
export async function DELETE(request: NextRequest) {
    const guard = requireUnitGuard(request);
    if (guard instanceof NextResponse) return guard;

    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        if (!id) return NextResponse.json({ error: 'ID do pedido é obrigatório' }, { status: 400 });

        const order = await prisma.order.findUnique({ where: { id } });
        if (!order) return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 });

        // UNIT GUARD: Validate record belongs to user's unit
        try { guard.enforceUnit(order.unit); } catch (e) {
          if (e instanceof UnitAccessDeniedError) return unitAccessDeniedResponse();
          throw e;
        }

        await createAuditLogs({
            orderId: id, action: 'pedido_excluido', actorId: guard.userId, actorName: guard.userName,
            productName: order.productName, batchNumber: order.batchNumber, unit: order.unit, changes: [],
        });

        await prisma.order.delete({ where: { id } });
        return NextResponse.json({ success: true, message: 'Pedido excluído com sucesso' });
    } catch (err) {
        console.error('DELETE order error:', err);
        return NextResponse.json({ error: 'Erro ao excluir pedido' }, { status: 500 });
    }
}
