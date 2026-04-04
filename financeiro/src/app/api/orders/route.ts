import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { sendPushToAll } from '@/lib/push';

/* ─── Helper: create in-app notifications for users with 'pedidos' permission ─── */
async function notifyPedidosUsers(
  title: string,
  message: string,
  icon: string,
  type: string,
  link: string,
  excludeUserId?: string,
) {
  try {
    const allUsers = await prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, role: true, permissions: true },
    });

    const targets = allUsers.filter((u) => {
      if (excludeUserId && u.id === excludeUserId) return false;
      const perms = (u.permissions as Record<string, boolean>) || {};
      const isAdmin = perms.admin === true || u.role === 'ADMINISTRADOR';
      return isAdmin || perms.pedidos === true;
    });

    if (targets.length === 0) return;

    await prisma.notification.createMany({
      data: targets.map((u) => ({
        userId: u.id,
        type,
        title,
        message,
        icon,
        link,
      })),
    });
  } catch (err) {
    console.error('notifyPedidosUsers error:', err);
  }
}

/* ─── Helper: notify only admins (for approval requests) ─── */
async function notifyAdminsOnly(
  title: string,
  message: string,
  icon: string,
  link: string,
) {
  try {
    const admins = await prisma.user.findMany({
      where: {
        isActive: true,
        OR: [
          { role: 'ADMINISTRADOR' },
        ],
      },
      select: { id: true, permissions: true },
    });

    // Also include users with admin permission
    const allUsers = await prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, permissions: true },
    });

    const adminIds = new Set(admins.map(a => a.id));
    allUsers.forEach(u => {
      const perms = (u.permissions as Record<string, boolean>) || {};
      if (perms.admin === true) adminIds.add(u.id);
    });

    if (adminIds.size === 0) return;

    await prisma.notification.createMany({
      data: Array.from(adminIds).map((id) => ({
        userId: id,
        type: 'warning',
        title,
        message,
        icon,
        link,
      })),
    });
  } catch (err) {
    console.error('notifyAdminsOnly error:', err);
  }
}

/* ─── Helper: check if a user is admin ─── */
async function isUserAdmin(userId?: string): Promise<boolean> {
  if (!userId) return false;
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, permissions: true },
    });
    if (!user) return false;
    const perms = (user.permissions as Record<string, boolean>) || {};
    return user.role === 'ADMINISTRADOR' || perms.admin === true;
  } catch {
    return false;
  }
}


// GET — List all orders
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const search = searchParams.get('search')?.toLowerCase() || '';
        const status = searchParams.get('status') || 'All';
        const urgency = searchParams.get('urgency') || 'All';
        const unit = searchParams.get('unit') || 'all';
        const dateFrom = searchParams.get('dateFrom');
        const dateTo = searchParams.get('dateTo');

        const whereClause: any = {};

        if (search) {
            whereClause.productName = { contains: search };
        }
        if (status && status !== 'All') {
            whereClause.status = status;
        }
        if (urgency && urgency !== 'All') {
            whereClause.urgency = urgency;
        }
        if (unit && unit !== 'all') {
            whereClause.unit = unit;
        }
        if (dateFrom || dateTo) {
            whereClause.createdAt = {};
            if (dateFrom) whereClause.createdAt.gte = new Date(dateFrom);
            if (dateTo) {
                const end = new Date(dateTo);
                end.setDate(end.getDate() + 1);
                whereClause.createdAt.lte = end;
            }
        }

        const orders = await prisma.order.findMany({
            where: whereClause,
            orderBy: { createdAt: 'desc' },
        });

        return NextResponse.json(orders);
    } catch (err) {
        console.error('GET orders error:', err);
        return NextResponse.json({ error: 'Erro ao buscar pedidos' }, { status: 500 });
    }
}

// POST — Create a new order or multiple orders
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        // Extract userName from body (sent by client)
        let userName = 'Alguém';
        let userId: string | undefined;
        let userUnit: string | undefined;
        let orderItems: any[];

        if (Array.isArray(body)) {
            orderItems = body;
        } else if (body.items && Array.isArray(body.items)) {
            orderItems = body.items;
            userName = body.userName || 'Alguém';
            userId = body.userId;
            userUnit = body.userUnit;
        } else {
            orderItems = [body];
            userName = body.userName || 'Alguém';
            userId = body.userId;
            userUnit = body.userUnit;
        }

        const validOrders = orderItems.map((item: any) => {
            const { productName, quantity, urgency, notes, unitPrice, totalPrice, unit: itemUnit, sourceUrl } = item;
            if (!productName || !quantity || !urgency) {
                throw new Error('Campos obrigatórios ausentes em um ou mais itens');
            }
            return {
                productName,
                quantity: Number(quantity),
                urgency,
                status: 'Aguardando',
                unit: itemUnit || userUnit || null,
                notes: notes || null,
                unitPrice: unitPrice ? Number(unitPrice) : null,
                totalPrice: totalPrice ? Number(totalPrice) : null,
                sourceUrl: sourceUrl || null,
            };
        });

        // Get next batch number
        const lastBatch = await prisma.order.findFirst({
            orderBy: { batchNumber: 'desc' },
            where: { batchNumber: { not: null } },
            select: { batchNumber: true },
        });
        const nextBatch = (lastBatch?.batchNumber || 0) + 1;

        const newOrders = await prisma.order.createMany({
            data: validOrders.map(o => ({ ...o, batchNumber: nextBatch })),
        });

        // Send push notification to all other users
        const count = validOrders.length;
        const pushTitle = '🛒 Novo Pedido';
        const pushBody = count > 1
            ? `${userName} adicionou ${count} itens no Lote #${nextBatch}`
            : `${userName} adicionou: ${validOrders[0].productName} (Lote #${nextBatch})`;

        sendPushToAll(pushTitle, pushBody, userId).catch(() => {});

        // Create in-app notifications for users with 'pedidos' permission
        const notifTitle = '🛒 Novo Pedido Criado';
        const notifMsg = count > 1
            ? `${userName} adicionou ${count} itens no Lote #${nextBatch}.`
            : `${userName} adicionou o pedido: "${validOrders[0].productName}" (Qtd: ${validOrders[0].quantity}, Urgência: ${validOrders[0].urgency}) — Lote #${nextBatch}`;

        notifyPedidosUsers(notifTitle, notifMsg, 'shopping_cart', 'info', '/pedidos', userId).catch(() => {});

        return NextResponse.json({ success: true, count: newOrders.count, batchNumber: nextBatch }, { status: 201 });
    } catch (err: any) {
        console.error('POST order error:', err);
        return NextResponse.json({ error: err.message || 'Erro ao criar pedido(s)' }, { status: 500 });
    }
}

// PUT — Update an order (edit details or status)
export async function PUT(request: NextRequest) {
    try {
        const body = await request.json();
        const { id, productName, quantity, urgency, status, notes, estimatedArrival, userName, userId, unitPrice, totalPrice, unit, sourceUrl } = body;

        if (!id) {
            return NextResponse.json({ error: 'ID do pedido é obrigatório' }, { status: 400 });
        }

        // Get current order for context
        const currentOrder = await prisma.order.findUnique({ where: { id } });
        if (!currentOrder) {
            return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 });
        }

        // Check if user is admin
        const userIsAdmin = await isUserAdmin(userId);

        // Non-admin trying to update an existing order → send approval request to admins
        if (!userIsAdmin) {
            const actor = userName || 'Alguém';
            let changeDescription = '';

            if (status && status !== currentOrder.status) {
                changeDescription = `alterar o status de "${currentOrder.productName}" de "${currentOrder.status}" para "${status}"`;
            } else if (productName || quantity || urgency) {
                const changes: string[] = [];
                if (productName && productName !== currentOrder.productName) changes.push(`nome: "${currentOrder.productName}" → "${productName}"`);
                if (quantity && Number(quantity) !== currentOrder.quantity) changes.push(`qtd: ${currentOrder.quantity} → ${quantity}`);
                if (urgency && urgency !== currentOrder.urgency) changes.push(`urgência: ${currentOrder.urgency} → ${urgency}`);
                changeDescription = changes.length > 0
                    ? `editar o pedido "${currentOrder.productName}": ${changes.join(', ')}`
                    : `editar o pedido "${currentOrder.productName}"`;
            } else {
                changeDescription = `modificar o pedido "${currentOrder.productName}"`;
            }

            // Notify admins for approval
            const approvalTitle = '⚠️ Aprovação Necessária — Pedido';
            const approvalMsg = `${actor} solicitou ${changeDescription}. Acesse a aba Pedidos para aprovar ou recusar.`;

            await notifyAdminsOnly(approvalTitle, approvalMsg, 'approval', '/pedidos');

            // Also send push to admins
            sendPushToAll('⚠️ Aprovação de Pedido', `${actor} solicitou alteração em "${currentOrder.productName}"`, userId).catch(() => {});

            return NextResponse.json({
                success: false,
                pendingApproval: true,
                message: 'Solicitação enviada ao administrador para aprovação.',
            });
        }

        // Admin user → proceed with update
        const updateData: any = {};
        if (productName) updateData.productName = productName;
        if (quantity) updateData.quantity = Number(quantity);
        if (urgency) updateData.urgency = urgency;
        if (status) updateData.status = status;
        if (notes !== undefined) updateData.notes = notes;
        if (unitPrice !== undefined) updateData.unitPrice = unitPrice !== null ? Number(unitPrice) : null;
        if (totalPrice !== undefined) updateData.totalPrice = totalPrice !== null ? Number(totalPrice) : null;
        if (unit !== undefined) updateData.unit = unit;
        if (estimatedArrival !== undefined) updateData.estimatedArrival = estimatedArrival ? new Date(estimatedArrival) : null;
        if (sourceUrl !== undefined) updateData.sourceUrl = sourceUrl || null;

        const updatedOrder = await prisma.order.update({
            where: { id },
            data: updateData,
        });

        // Send push notification
        const actor = userName || 'Alguém';
        let pushTitle: string;
        let pushBody: string;
        let notifTitle: string;
        let notifMsg: string;

        if (status && status !== currentOrder.status) {
            pushTitle = '✅ Status Atualizado';
            const etaInfo = estimatedArrival ? ` (previsão: ${new Date(estimatedArrival).toLocaleDateString('pt-BR')})` : '';
            pushBody = `${actor} alterou "${currentOrder.productName}": ${currentOrder.status} → ${status}${etaInfo}`;
            notifTitle = '📦 Status de Pedido Alterado';
            notifMsg = `${actor} alterou o status do pedido "${currentOrder.productName}" de "${currentOrder.status}" para "${status}"${etaInfo}.`;
        } else {
            pushTitle = '📦 Pedido Atualizado';
            pushBody = `${actor} atualizou: ${updatedOrder.productName}`;
            notifTitle = '📦 Pedido Atualizado';
            notifMsg = `${actor} atualizou o pedido "${updatedOrder.productName}".`;
        }

        sendPushToAll(pushTitle, pushBody, userId).catch(() => {});

        // Create in-app notifications for users with 'pedidos' permission
        notifyPedidosUsers(notifTitle, notifMsg, 'inventory_2', 'info', '/pedidos', userId).catch(() => {});

        return NextResponse.json(updatedOrder);
    } catch (err) {
        console.error('PUT order error:', err);
        return NextResponse.json({ error: 'Erro ao atualizar pedido' }, { status: 500 });
    }
}

// DELETE — Remove an order
export async function DELETE(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'ID do pedido é obrigatório' }, { status: 400 });
        }

        await prisma.order.delete({
            where: { id },
        });

        return NextResponse.json({ success: true, message: 'Pedido excluído com sucesso' });
    } catch (err) {
        console.error('DELETE order error:', err);
        return NextResponse.json({ error: 'Erro ao excluir pedido' }, { status: 500 });
    }
}
