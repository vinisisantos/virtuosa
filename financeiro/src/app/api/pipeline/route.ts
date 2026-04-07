import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// GET — List pipeline entries
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const stage = searchParams.get('stage');
  const unit = searchParams.get('unit');
  const assignedTo = searchParams.get('assignedTo');

  const where: Record<string, unknown> = {};
  if (stage) where.stage = stage;
  if (unit) where.unit = unit;
  if (assignedTo) where.assignedTo = assignedTo;

  const entries = await prisma.salesPipeline.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
  });

  return NextResponse.json(entries);
}

// POST — Create pipeline entry manually
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { clientId, clientName, stage, value, source, assignedTo, assignedName, unit, notes, leadId } = body;

    if (!clientId || !clientName) {
      return NextResponse.json({ error: 'clientId and clientName required' }, { status: 400 });
    }

    const entry = await prisma.salesPipeline.create({
      data: {
        clientId,
        clientName,
        stage: stage || 'novo_lead',
        value: value || 0,
        source,
        assignedTo,
        assignedName,
        unit: unit || 'Barueri',
        notes,
        leadId,
      },
    });

    return NextResponse.json(entry, { status: 201 });
  } catch (error) {
    console.error('[Pipeline] Create error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// PUT — Update pipeline entry (move stage, assign, etc.)
export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { id, stage, assignedTo, assignedName, value, notes, lostReason } = body;

    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

    const data: Record<string, unknown> = {};
    if (stage !== undefined) {
      data.stage = stage;
      if (stage === 'fechado') data.closedAt = new Date();
      if (stage === 'perdido') data.closedAt = new Date();
    }
    if (assignedTo !== undefined) data.assignedTo = assignedTo;
    if (assignedName !== undefined) data.assignedName = assignedName;
    if (value !== undefined) data.value = value;
    if (notes !== undefined) data.notes = notes;
    if (lostReason !== undefined) data.lostReason = lostReason;

    const updated = await prisma.salesPipeline.update({
      where: { id },
      data,
    });

    // Audit log for stage changes
    if (stage) {
      await prisma.auditLog.create({
        data: {
          userName: assignedName || 'Sistema',
          action: 'update',
          entity: 'pipeline',
          entityId: id,
          details: `Oportunidade "${updated.clientName}" movida para estágio: ${stage}`,
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
export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

  await prisma.salesPipeline.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
