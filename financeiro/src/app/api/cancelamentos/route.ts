import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUnitGuard } from '@/lib/unit-guard';

export async function GET(req: NextRequest) {
  const guard = requireUnitGuard(req, { requestedUnit: new URL(req.url).searchParams.get('unit') });
  if (guard instanceof NextResponse) return guard;

  try {
    const where: Record<string, unknown> = {};
    // UNIT GUARD: Filter by JWT unit
    if (guard.unitFilter) where.unit = guard.unitFilter;

    const history = await prisma.cancelamentoHistory.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      orderBy: { createdAt: 'desc' },
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
    const { clientName, scenario, totalPago, totalConsumido, multa, totalDevolver, proceduresCount } = body;

    if (!scenario) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const record = await prisma.cancelamentoHistory.create({
      data: {
        clientName: clientName || 'Cliente',
        unit: guard.createUnit(), // UNIT GUARD: Force JWT unit
        scenario,
        totalPago: parseFloat(totalPago) || 0,
        totalConsumido: parseFloat(totalConsumido) || 0,
        multa: parseFloat(multa) || 0,
        totalDevolver: parseFloat(totalDevolver) || 0,
        proceduresCount: parseInt(proceduresCount) || 0,
      },
    });

    return NextResponse.json(record, { status: 201 });
  } catch (error) {
    console.error('Failed to save history:', error);
    return NextResponse.json({ error: 'Failed to save history' }, { status: 500 });
  }
}
