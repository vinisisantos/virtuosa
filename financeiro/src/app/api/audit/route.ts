import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUnitGuard } from '@/lib/unit-guard';

export async function GET(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');
  const entity = searchParams.get('entity');
  const limit = parseInt(searchParams.get('limit') || '100');

  const where: any = {};
  if (action) where.action = action;
  if (entity) where.entity = entity;
  // UNIT GUARD: Non-admins only see their unit's audit logs
  if (guard.unitFilter) where.unit = guard.unitFilter;

  try {
    const entries = await prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: limit });
    return NextResponse.json({ entries });
  } catch {
    return NextResponse.json({ entries: [] });
  }
}

export async function POST(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  try {
    const body = await req.json();
    const entry = await prisma.auditLog.create({
      data: {
        userName: body.userName || guard.userName || 'Sistema',
        action: body.action, entity: body.entity,
        entityId: body.entityId || '', details: body.details || '',
        unit: guard.createUnit(), // UNIT GUARD: Force JWT unit
      },
    });
    return NextResponse.json(entry);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
