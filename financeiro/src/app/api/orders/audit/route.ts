import { NextRequest, NextResponse } from 'next/server';
import {
  requireUnitGuard,
  UnitAccessDeniedError,
  unitAccessDeniedResponse,
} from '@/lib/unit-guard';
import { prisma } from '@/lib/db';
import { canDeleteOrderHistory, canViewOrderHistory } from '@/lib/automatic-costs';
import type { Prisma } from '@prisma/client';

// ═══════════════════════════════════════
// GET — List audit log entries
// ═══════════════════════════════════════
export async function GET(request: NextRequest) {
  const guard = requireUnitGuard(request, { requestedUnit: request.nextUrl.searchParams.get('unit') });
  if (guard instanceof NextResponse) return guard;
  if (!canViewOrderHistory(guard)) {
    return NextResponse.json({ error: 'Sem permissão para visualizar histórico' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);

    // Filters
    const orderId = searchParams.get('orderId');
    const action = searchParams.get('action');
    const actorId = searchParams.get('actorId');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const search = searchParams.get('search')?.toLowerCase();
    const requestedPage = Number.parseInt(searchParams.get('page') || '1', 10);
    const requestedLimit = Number.parseInt(searchParams.get('limit') || '50', 10);
    const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const limit = Number.isInteger(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, 100)
      : 50;

    const where: Prisma.OrderAuditLogWhereInput = { isDeleted: false };
    if (guard.unitFilter) where.unit = guard.unitFilter;
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
  const guard = requireUnitGuard(request);
  if (guard instanceof NextResponse) return guard;
  if (!canDeleteOrderHistory(guard)) {
    return NextResponse.json({ error: 'Sem permissão para excluir histórico' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { logId } = body;
    const userId = guard.userId;
    const userName = guard.userName || 'Admin';

    if (!logId) return NextResponse.json({ error: 'logId é obrigatório' }, { status: 400 });

    const log = await prisma.orderAuditLog.findUnique({ where: { id: logId } });
    if (!log) return NextResponse.json({ error: 'Registro não encontrado' }, { status: 404 });
    guard.enforceUnit(log.unit);

    await prisma.$transaction(async tx => {
      await tx.orderAuditLog.update({
        where: { id: logId },
        data: { isDeleted: true, deletedBy: userId, deletedByName: userName, deletedAt: new Date() },
      });

      await tx.orderAuditLog.create({
        data: {
          orderId: log.orderId, action: 'historico_excluido',
          actorId: userId, actorName: userName,
          productName: log.productName, batchNumber: log.batchNumber, unit: log.unit,
          reason: `Registro de auditoria "${log.action}" excluído por ${userName}`,
        },
      });
    });

    return NextResponse.json({ success: true, message: 'Registro excluído do histórico.' });
  } catch (err) {
    if (err instanceof UnitAccessDeniedError) return unitAccessDeniedResponse(err);
    console.error('DELETE audit error:', err);
    return NextResponse.json({ error: 'Erro ao excluir registro' }, { status: 500 });
  }
}
