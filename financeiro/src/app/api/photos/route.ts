import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUnitGuard, UnitAccessDeniedError, unitAccessDeniedResponse } from '@/lib/unit-guard';

export async function GET(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get('clientId');
  const procedimento = searchParams.get('procedimento');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};
  if (clientId) where.clientId = clientId;
  if (procedimento) where.procedimento = procedimento;
  // UNIT GUARD: Filter photos by unit
  if (guard.unitFilter) where.unit = guard.unitFilter;

  const photos = await prisma.clientPhoto.findMany({ where, orderBy: { sessionDate: 'desc' } });
  return NextResponse.json({ photos });
}

export async function POST(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  const body = await req.json();
  const photo = await prisma.clientPhoto.create({
    data: {
      clientId: body.clientId,
      clientName: body.clientName,
      type: body.type,
      procedimento: body.procedimento,
      imageData: body.imageData,
      notes: body.notes || null,
      unit: guard.createUnit(), // UNIT GUARD: Force JWT unit
      sessionDate: body.sessionDate ? new Date(body.sessionDate) : new Date(),
    },
  });
  return NextResponse.json(photo);
}

export async function DELETE(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

  // UNIT GUARD: Validate record belongs to user's unit
  const existing = await prisma.clientPhoto.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: 'Foto não encontrada' }, { status: 404 });
  try { guard.enforceUnit(existing.unit); } catch (e) {
    if (e instanceof UnitAccessDeniedError) return unitAccessDeniedResponse();
    throw e;
  }

  await prisma.clientPhoto.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
