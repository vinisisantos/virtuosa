import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const unit = searchParams.get('unit');

    const history = await prisma.cancelamentoHistory.findMany({
      where: unit ? { unit } : undefined,
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(history);
  } catch (error) {
    console.error('Failed to fetch history:', error);
    return NextResponse.json(
      { error: 'Failed to fetch history' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { clientName, unit, scenario, totalPago, totalConsumido, multa, totalDevolver, proceduresCount } = body;

    if (!unit || !scenario) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const record = await prisma.cancelamentoHistory.create({
      data: {
        clientName: clientName || 'Cliente',
        unit,
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
    return NextResponse.json(
      { error: 'Failed to save history' },
      { status: 500 }
    );
  }
}
