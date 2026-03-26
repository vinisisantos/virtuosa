import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { sendPushToAll } from '@/lib/push';

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
            const { productName, quantity, urgency, notes, unitPrice, totalPrice, unit: itemUnit } = item;
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
            };
        });

        const newOrders = await prisma.order.createMany({
            data: validOrders,
        });

        // Send push notification to all other users
        const count = validOrders.length;
        const pushTitle = '🛒 Novo Pedido';
        const pushBody = count > 1
            ? `${userName} adicionou ${count} novos pedidos`
            : `${userName} adicionou: ${validOrders[0].productName}`;

        sendPushToAll(pushTitle, pushBody, userId).catch(() => {});

        return NextResponse.json({ success: true, count: newOrders.count }, { status: 201 });
    } catch (err: any) {
        console.error('POST order error:', err);
        return NextResponse.json({ error: err.message || 'Erro ao criar pedido(s)' }, { status: 500 });
    }
}

// PUT — Update an order (edit details or status)
export async function PUT(request: NextRequest) {
    try {
        const body = await request.json();
        const { id, productName, quantity, urgency, status, notes, estimatedArrival, userName, userId, unitPrice, totalPrice, unit } = body;

        if (!id) {
            return NextResponse.json({ error: 'ID do pedido é obrigatório' }, { status: 400 });
        }

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

        // Get current order for notification context
        const currentOrder = await prisma.order.findUnique({ where: { id } });

        const updatedOrder = await prisma.order.update({
            where: { id },
            data: updateData,
        });

        // Send push notification
        const actor = userName || 'Alguém';
        let pushTitle: string;
        let pushBody: string;

        if (status && currentOrder && status !== currentOrder.status) {
            pushTitle = '✅ Status Atualizado';
            const etaInfo = estimatedArrival ? ` (previsão: ${new Date(estimatedArrival).toLocaleDateString('pt-BR')})` : '';
            pushBody = `${actor} alterou "${currentOrder.productName}": ${currentOrder.status} → ${status}${etaInfo}`;
        } else {
            pushTitle = '📦 Pedido Atualizado';
            pushBody = `${actor} atualizou: ${updatedOrder.productName}`;
        }

        sendPushToAll(pushTitle, pushBody, userId).catch(() => {});

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
