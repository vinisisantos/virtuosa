import { NextRequest, NextResponse } from 'next/server';
import { requireUnitGuard } from '@/lib/unit-guard';
import { prisma } from '@/lib/db';

// GET — List lead assignment operators
export async function GET(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  const { searchParams } = new URL(req.url);
  const unit = searchParams.get('unit');

  const where: Record<string, unknown> = {};
  if (unit) where.unit = unit;

  const operators = await prisma.leadAssignment.findMany({
    where,
    orderBy: { userName: 'asc' },
  });

  return NextResponse.json(operators);
}

// POST — Add operator to round-robin
export async function POST(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  try {
    const body = await req.json();
    const { userId, userName, unit, weight } = body;

    if (!userId || !userName) {
      return NextResponse.json({ error: 'userId and userName required' }, { status: 400 });
    }

    const existing = await prisma.leadAssignment.findFirst({
      where: { userId, unit: unit || 'Barueri' },
    });

    if (existing) {
      // Reactivate if was deactivated
      const updated = await prisma.leadAssignment.update({
        where: { id: existing.id },
        data: { isActive: true, weight: weight || existing.weight, userName },
      });
      return NextResponse.json(updated);
    }

    const assignment = await prisma.leadAssignment.create({
      data: {
        userId,
        userName,
        unit: unit || 'Barueri',
        weight: weight || 1,
      },
    });

    return NextResponse.json(assignment, { status: 201 });
  } catch (error) {
    console.error('[LeadAssignment] Error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// PUT — Update operator
export async function PUT(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  try {
    const body = await req.json();
    const { id, isActive, weight } = body;

    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

    const data: Record<string, unknown> = {};
    if (isActive !== undefined) data.isActive = isActive;
    if (weight !== undefined) data.weight = weight;

    const updated = await prisma.leadAssignment.update({
      where: { id },
      data,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('[LeadAssignment] Update error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// DELETE — Remove operator
export async function DELETE(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

  await prisma.leadAssignment.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
