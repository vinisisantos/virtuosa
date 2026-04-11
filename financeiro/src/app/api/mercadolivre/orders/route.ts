import { NextRequest, NextResponse } from 'next/server';
import { requireUnitGuard } from '@/lib/unit-guard';
import { syncOrdersForUnit } from '@/lib/mercadolivre';
import { prisma } from '@/lib/db';

/* GET /api/mercadolivre/orders?unit=SBC — List synced ML orders */
export async function GET(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  try {
    const unit = new URL(req.url).searchParams.get('unit');
    const where: any = {};
    if (unit && unit !== 'all') where.unit = unit;

    const orders = await prisma.mercadoLivreOrder.findMany({
      where,
      orderBy: { buyDate: 'desc' },
      take: 100,
    });

    return NextResponse.json(orders);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/* POST /api/mercadolivre/orders — Trigger manual sync */
export async function POST(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  try {
    const { unit } = await req.json();
    if (!unit) return NextResponse.json({ error: 'Unidade obrigatória.' }, { status: 400 });

    const result = await syncOrdersForUnit(unit);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
