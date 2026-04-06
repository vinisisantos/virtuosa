import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/* ─── Helper: get user permissions ─── */
async function getUserPerms(userId?: string) {
  if (!userId) return { isAdmin: false, canViewHistory: false, canDeleteHistory: false };
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, permissions: true } });
    if (!user) return { isAdmin: false, canViewHistory: false, canDeleteHistory: false };
    const perms = (user.permissions as Record<string, boolean>) || {};
    const isAdmin = user.role === 'ADMINISTRADOR' || perms.admin === true;
    return {
      isAdmin,
      canViewHistory: isAdmin || perms.pedidosHistorico === true,
      canDeleteHistory: isAdmin || perms.pedidosExcluirHistorico === true,
    };
  } catch { return { isAdmin: false, canViewHistory: false, canDeleteHistory: false }; }
}

// ═══════════════════════════════════════
// GET — List audit log entries
// ═══════════════════════════════════════
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId') || undefined;

    // Check permission
    const { canViewHistory } = await getUserPerms(userId);
    if (!canViewHistory) {
      return NextResponse.json({ error: 'Sem permissão para visualizar histórico' }, { status: 403 });
    }

    // Filters
    const orderId = searchParams.get('orderId');
    const action = searchParams.get('action');
    const actorId = searchParams.get('actorId');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const search = searchParams.get('search')?.toLowerCase();
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');

    const where: any = { isDeleted: false };
    if (orderId) where.orderId = orderId;
    if (action) where.action = action;
    if (actorId) where.actorId = actorId;
    if (search) where.productName = { contains: search };
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) { const end = new Date(dateTo); end.setDate(end.getDate() + 1); where.createdAt.lte = end; }
    }

    const [total, logs] = await Promise.all([
      prisma.orderAuditLog.count({ where }),
      prisma.orderAuditLog.findMany({
        where, orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit, take: limit,
      }),
    ]);

    return NextResponse.json({ logs, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('GET audit error:', err);
    return NextResponse.json({ error: 'Erro ao buscar histórico' }, { status: 500 });
  }
}

// ═══════════════════════════════════════
// DELETE — Soft-delete audit log entries
// ═══════════════════════════════════════
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { logId, userId, userName } = body;

    if (!logId) return NextResponse.json({ error: 'logId é obrigatório' }, { status: 400 });

    // Check permission
    const { canDeleteHistory } = await getUserPerms(userId);
    if (!canDeleteHistory) {
      return NextResponse.json({ error: 'Sem permissão para excluir histórico' }, { status: 403 });
    }

    const log = await prisma.orderAuditLog.findUnique({ where: { id: logId } });
    if (!log) return NextResponse.json({ error: 'Registro não encontrado' }, { status: 404 });

    // Soft delete
    await prisma.orderAuditLog.update({
      where: { id: logId },
      data: { isDeleted: true, deletedBy: userId, deletedByName: userName || 'Admin', deletedAt: new Date() },
    });

    // Create a meta-audit entry: someone deleted history
    await prisma.orderAuditLog.create({
      data: {
        orderId: log.orderId, action: 'historico_excluido',
        actorId: userId, actorName: userName || 'Admin',
        productName: log.productName, batchNumber: log.batchNumber, unit: log.unit,
        reason: `Registro de auditoria "${log.action}" excluído por ${userName || 'Admin'}`,
      },
    });

    return NextResponse.json({ success: true, message: 'Registro excluído do histórico.' });
  } catch (err) {
    console.error('DELETE audit error:', err);
    return NextResponse.json({ error: 'Erro ao excluir registro' }, { status: 500 });
  }
}
