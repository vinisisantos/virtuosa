import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUnitGuard, UnitAccessDeniedError, unitAccessDeniedResponse } from '@/lib/unit-guard';

export async function GET(req: NextRequest) {
  const guard = requireUnitGuard(req, { requestedUnit: new URL(req.url).searchParams.get('unit') });
  if (guard instanceof NextResponse) return guard;

  const where: Record<string, unknown> = { isActive: true };
  // UNIT GUARD: Filter by JWT unit
  if (guard.unitFilter) where.unit = guard.unitFilter;
  const profissionais = await prisma.profissional.findMany({ where, orderBy: { createdAt: 'asc' } });
  return NextResponse.json(profissionais);
}

export async function POST(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  const body = await req.json();
  const profissional = await prisma.profissional.create({
    data: {
      name: body.name,
      unit: guard.createUnit(body.unit), // UNIT GUARD: Force JWT unit
      color: body.color || '#e600a0',
    },
  });
  return NextResponse.json(profissional);
}

export async function PUT(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  const body = await req.json();

  // UNIT GUARD: Validate record belongs to user's unit
  const existing = await prisma.profissional.findUnique({ where: { id: body.id } });
  if (!existing) return NextResponse.json({ error: 'Profissional não encontrado' }, { status: 404 });
  try { guard.enforceUnit(existing.unit); } catch (e) {
    if (e instanceof UnitAccessDeniedError) return unitAccessDeniedResponse();
    throw e;
  }

  const updated = await prisma.profissional.update({
    where: { id: body.id },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      // UNIT GUARD: Only admins can change unit
      ...(body.unit !== undefined && guard.isAdmin && { unit: body.unit }),
      ...(body.color !== undefined && { color: body.color }),
      ...(body.isActive !== undefined && { isActive: body.isActive }),
      ...(body.absenceSchedule !== undefined && { absenceSchedule: body.absenceSchedule }),
    },
  });
  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

  const existing = await prisma.profissional.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: 'Profissional não encontrado' }, { status: 404 });
  try { guard.enforceUnit(existing.unit); } catch (e) {
    if (e instanceof UnitAccessDeniedError) return unitAccessDeniedResponse();
    throw e;
  }

  await prisma.profissional.update({ where: { id }, data: { isActive: false } });
  return NextResponse.json({ ok: true });
}
