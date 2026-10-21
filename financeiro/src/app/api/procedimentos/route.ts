import { NextRequest, NextResponse } from 'next/server';
import { requireUnitGuard } from '@/lib/unit-guard';
import { prisma } from '@/lib/db';

export async function GET(req: NextRequest) {
  const guard = requireUnitGuard(req, { requestedUnit: req.nextUrl.searchParams.get('unit') });
  if (guard instanceof NextResponse) return guard;

  try {
    const [procedures, catalog] = await Promise.all([
      prisma.procedimentoTermo.findMany({ select: { name: true }, orderBy: { name: 'asc' } }),
      prisma.serviceCatalog.findMany({
        where: { active: true, ...(guard.unitFilter ? { unit: { in: [guard.unitFilter, 'Todas'] } } : {}) },
        select: { name: true }, orderBy: { name: 'asc' },
      }),
    ]);
    return NextResponse.json([...new Set([...procedures, ...catalog].map(p => p.name))].sort((a, b) => a.localeCompare(b, 'pt-BR')));
  } catch (error) {
    console.error('Failed to fetch procedures:', error);
    return NextResponse.json([], { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const guard = requireUnitGuard(request);
  if (guard instanceof NextResponse) return guard;

  try {
    const { name } = await request.json();
    if (!name?.trim()) {
      return NextResponse.json({ error: 'Name required' }, { status: 400 });
    }
    // Upsert - create if not exists
    await prisma.procedimentoTermo.upsert({
      where: { name: name.trim() },
      update: {},
      create: { name: name.trim() },
    });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    console.error('Failed to save procedure:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
