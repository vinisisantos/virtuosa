import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUnitGuard, UnitAccessDeniedError, unitAccessDeniedResponse } from '@/lib/unit-guard';

// GET — List pipeline entries
export async function GET(req: NextRequest) {
  const guard = requireUnitGuard(req, { requestedUnit: new URL(req.url).searchParams.get('unit') });
  if (guard instanceof NextResponse) return guard;

  const { searchParams } = new URL(req.url);
  const stage = searchParams.get('stage');
  const assignedTo = searchParams.get('assignedTo');

  const where: Record<string, unknown> = {};
  if (stage) where.stage = stage;
  // UNIT GUARD: Filter by JWT unit  
  if (guard.unitFilter) where.unit = guard.unitFilter;
  if (assignedTo) where.assignedTo = assignedTo;

  const entries = await prisma.salesPipeline.findMany({ where, orderBy: { updatedAt: 'desc' } });
  return NextResponse.json(entries);
}

// POST — Create pipeline entry manually
export async function POST(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  try {
    const body = await req.json();
    const { clientId, clientName, stage, value, source, assignedTo, assignedName, notes, leadId } = body;

    if (!clientId || !clientName) return NextResponse.json({ error: 'clientId and clientName required' }, { status: 400 });

    const entry = await prisma.salesPipeline.create({
      data: {
        clientId, clientName, stage: stage || 'novo_lead', value: value || 0,
        source, assignedTo, assignedName,
        unit: guard.createUnit(), // UNIT GUARD: Force JWT unit
        notes, leadId,
      },
    });

    return NextResponse.json(entry, { status: 201 });
  } catch (error) {
    console.error('[Pipeline] Create error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// PUT — Update pipeline entry
export async function PUT(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  try {
    const body = await req.json();
    const { id, stage, assignedTo, assignedName, value, notes, lostReason } = body;
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

    // UNIT GUARD: Validate record belongs to user's unit
    const existing = await prisma.salesPipeline.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
    try { guard.enforceUnit(existing.unit); } catch (e) {
      if (e instanceof UnitAccessDeniedError) return unitAccessDeniedResponse();
      throw e;
    }

    const data: Record<string, unknown> = {};
    if (stage !== undefined) {
      data.stage = stage;
      if (stage === 'fechado' || stage === 'perdido') data.closedAt = new Date();
    }
    if (assignedTo !== undefined) data.assignedTo = assignedTo;
    if (assignedName !== undefined) data.assignedName = assignedName;
    if (value !== undefined) data.value = value;
    if (notes !== undefined) data.notes = notes;
    if (lostReason !== undefined) data.lostReason = lostReason;

    const updated = await prisma.salesPipeline.update({ where: { id }, data });

    if (stage) {
      await prisma.auditLog.create({
        data: {
          userName: guard.userName || assignedName || 'Sistema',
          action: 'update', entity: 'pipeline', entityId: id,
          details: `Oportunidade "${updated.clientName}" movida para estágio: ${stage}`,
          unit: guard.userUnit,
        },
      });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error('[Pipeline] Update error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// DELETE — Remove pipeline entry
export async function DELETE(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

  const existing = await prisma.salesPipeline.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  try { guard.enforceUnit(existing.unit); } catch (e) {
    if (e instanceof UnitAccessDeniedError) return unitAccessDeniedResponse();
    throw e;
  }

  await prisma.salesPipeline.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
