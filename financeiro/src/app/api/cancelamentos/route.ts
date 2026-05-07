import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUnitGuard } from '@/lib/unit-guard';

export async function GET(req: NextRequest) {
  const guard = requireUnitGuard(req, { requestedUnit: new URL(req.url).searchParams.get('unit') });
  if (guard instanceof NextResponse) return guard;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  try {
    // Single record fetch (includes html)
    if (id) {
      const record = await prisma.cancelamentoHistory.findUnique({ where: { id } });
      if (!record) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      return NextResponse.json(record);
    }

    // List fetch (excludes html for performance)
    const where: Record<string, unknown> = {};
    if (guard.unitFilter) where.unit = guard.unitFilter;

    const history = await prisma.cancelamentoHistory.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        clientName: true,
        unit: true,
        scenario: true,
        totalPago: true,
        totalConsumido: true,
        multa: true,
        totalDevolver: true,
        proceduresCount: true,
        createdAt: true,
        // html is intentionally excluded from list queries for performance
      },
    });

    return NextResponse.json(history);
  } catch (error) {
    console.error('Failed to fetch history:', error);
    return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  try {
    const body = await req.json();
    const { clientName, scenario, totalPago, totalConsumido, multa, totalDevolver, proceduresCount, html } = body;

    if (!scenario) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const record = await prisma.cancelamentoHistory.create({
      data: {
        clientName: clientName || 'Cliente',
        unit: guard.createUnit(),
        scenario,
        totalPago: parseFloat(totalPago) || 0,
        totalConsumido: parseFloat(totalConsumido) || 0,
        multa: parseFloat(multa) || 0,
        totalDevolver: parseFloat(totalDevolver) || 0,
        proceduresCount: parseInt(proceduresCount) || 0,
        html: html || null,
      },
    });

    return NextResponse.json(record, { status: 201 });
  } catch (error) {
    console.error('Failed to save history:', error);
    return NextResponse.json({ error: 'Failed to save history' }, { status: 500 });
  }
}
