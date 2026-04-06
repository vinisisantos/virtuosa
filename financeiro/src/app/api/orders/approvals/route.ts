import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { sendPushToAll } from '@/lib/push';

/* ─── Helper: check if a user is admin ─── */
async function checkAdmin(userId?: string): Promise<boolean> {
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

/* ─── Helper: notify users with pedidos permission ─── */
async function notifyPedidosUsers(
  title: string, message: string, icon: string, type: string, link: string, excludeUserId?: string,
) {
  try {
    const allUsers = await prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, role: true, permissions: true },
    });
    const targets = allUsers.filter((u) => {
      if (excludeUserId && u.id === excludeUserId) return false;
      const perms = (u.permissions as Record<string, boolean>) || {};
      return perms.admin === true || u.role === 'ADMINISTRADOR' || perms.pedidos === true;
    });
    if (targets.length === 0) return;
    await prisma.notification.createMany({
      data: targets.map((u) => ({ userId: u.id, type, title, message, icon, link })),
    });
  } catch (err) {
    console.error('notifyPedidosUsers error:', err);
  }
}

// GET — List pending approvals (for admins)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get('status') || 'pendente';

    const approvals = await prisma.orderApproval.findMany({
      where: { status: statusFilter },
      orderBy: { createdAt: 'desc' },
    });

    // Enrich with order data
    const enriched = await Promise.all(
      approvals.map(async (a) => {
        const order = await prisma.order.findUnique({ where: { id: a.orderId } });
        return {
          ...a,
          changeData: JSON.parse(a.changeData),
          order: order ? {
            id: order.id,
            productName: order.productName,
            quantity: order.quantity,
            status: order.status,
            urgency: order.urgency,
            unit: order.unit,
            batchNumber: order.batchNumber,
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

// PUT — Approve or reject a pending approval
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { approvalId, action, userId, userName } = body;

    if (!approvalId || !action) {
      return NextResponse.json({ error: 'approvalId e action são obrigatórios' }, { status: 400 });
    }

    if (!['aprovar', 'recusar'].includes(action)) {
      return NextResponse.json({ error: 'action deve ser "aprovar" ou "recusar"' }, { status: 400 });
    }

    // Check admin
    const isAdmin = await checkAdmin(userId);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Apenas administradores podem aprovar/recusar' }, { status: 403 });
    }

    // Get the approval
    const approval = await prisma.orderApproval.findUnique({ where: { id: approvalId } });
    if (!approval) {
      return NextResponse.json({ error: 'Aprovação não encontrada' }, { status: 404 });
    }
    if (approval.status !== 'pendente') {
      return NextResponse.json({ error: 'Aprovação já foi processada' }, { status: 400 });
    }

    if (action === 'aprovar') {
      // Apply the changes to the order
      const changeData = JSON.parse(approval.changeData);
      const updateData: any = {};

      if (changeData.status) updateData.status = changeData.status;
      if (changeData.productName) updateData.productName = changeData.productName;
      if (changeData.quantity !== undefined) updateData.quantity = Number(changeData.quantity);
      if (changeData.urgency) updateData.urgency = changeData.urgency;
      if (changeData.notes !== undefined) updateData.notes = changeData.notes;
      if (changeData.unitPrice !== undefined) updateData.unitPrice = changeData.unitPrice !== null ? Number(changeData.unitPrice) : null;
      if (changeData.totalPrice !== undefined) updateData.totalPrice = changeData.totalPrice !== null ? Number(changeData.totalPrice) : null;
      if (changeData.unit !== undefined) updateData.unit = changeData.unit;
      if (changeData.estimatedArrival !== undefined) updateData.estimatedArrival = changeData.estimatedArrival ? new Date(changeData.estimatedArrival) : null;
      if (changeData.sourceUrl !== undefined) updateData.sourceUrl = changeData.sourceUrl || null;

      await prisma.order.update({
        where: { id: approval.orderId },
        data: updateData,
      });

      // Mark approval as approved
      await prisma.orderApproval.update({
        where: { id: approvalId },
        data: {
          status: 'aprovado',
          reviewedBy: userId,
          reviewedByName: userName || 'Admin',
          reviewedAt: new Date(),
        },
      });

      // Notify the requester
      const notifMsg = `${userName || 'Admin'} aprovou sua solicitação: "${approval.description}"`;
      notifyPedidosUsers('✅ Solicitação Aprovada', notifMsg, 'check_circle', 'success', '/pedidos').catch(() => {});
      sendPushToAll('✅ Pedido Aprovado', notifMsg).catch(() => {});

      return NextResponse.json({ success: true, message: 'Aprovação concedida e alterações aplicadas.' });
    } else {
      // Reject — just mark as rejected
      await prisma.orderApproval.update({
        where: { id: approvalId },
        data: {
          status: 'recusado',
          reviewedBy: userId,
          reviewedByName: userName || 'Admin',
          reviewedAt: new Date(),
        },
      });

      const notifMsg = `${userName || 'Admin'} recusou a solicitação: "${approval.description}"`;
      notifyPedidosUsers('❌ Solicitação Recusada', notifMsg, 'cancel', 'warning', '/pedidos').catch(() => {});
      sendPushToAll('❌ Pedido Recusado', notifMsg).catch(() => {});

      return NextResponse.json({ success: true, message: 'Solicitação recusada.' });
    }
  } catch (err) {
    console.error('PUT approval error:', err);
    return NextResponse.json({ error: 'Erro ao processar aprovação' }, { status: 500 });
  }
}
