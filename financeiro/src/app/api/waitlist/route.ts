import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUnitGuard, UnitAccessDeniedError, unitAccessDeniedResponse } from '@/lib/unit-guard';

export async function GET(req: NextRequest) {
  const guard = requireUnitGuard(req, { requestedUnit: new URL(req.url).searchParams.get('unit') });
  if (guard instanceof NextResponse) return guard;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');

  const where: any = {};
  if (status) where.status = status;
  // UNIT GUARD: Filter by JWT unit
  if (guard.unitFilter) where.unit = guard.unitFilter;

  const entries = await prisma.waitlistEntry.findMany({ where, orderBy: { desiredDate: 'asc' } });

  // Stats also scoped by unit
  const unitWhere = guard.unitFilter ? { unit: guard.unitFilter } : {};
  const stats = {
    waiting: await prisma.waitlistEntry.count({ where: { ...unitWhere, status: 'aguardando' } }),
    notified: await prisma.waitlistEntry.count({ where: { ...unitWhere, status: 'notificado' } }),
    scheduled: await prisma.waitlistEntry.count({ where: { ...unitWhere, status: 'agendado' } }),
  };
  return NextResponse.json({ entries, stats });
}

export async function POST(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  const body = await req.json();
  const entry = await prisma.waitlistEntry.create({
    data: {
      clientName: body.clientName, clientPhone: body.clientPhone || null,
      procedimento: body.procedimento, profissional: body.profissional || null,
      desiredDate: new Date(body.desiredDate),
      unit: guard.createUnit(), // UNIT GUARD: Force JWT unit
      notes: body.notes || null,
    },
  });
  return NextResponse.json(entry);
}

export async function PUT(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  const body = await req.json();

  const existing = await prisma.waitlistEntry.findUnique({ where: { id: body.id } });
  if (!existing) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  try { guard.enforceUnit(existing.unit); } catch (e) {
    if (e instanceof UnitAccessDeniedError) return unitAccessDeniedResponse();
    throw e;
  }

  const updated = await prisma.waitlistEntry.update({ where: { id: body.id }, data: { status: body.status } });
  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

  const existing = await prisma.waitlistEntry.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  try { guard.enforceUnit(existing.unit); } catch (e) {
    if (e instanceof UnitAccessDeniedError) return unitAccessDeniedResponse();
    throw e;
  }

  await prisma.waitlistEntry.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
