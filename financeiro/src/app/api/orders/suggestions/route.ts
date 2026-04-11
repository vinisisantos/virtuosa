import { NextRequest, NextResponse } from 'next/server';
import { requireUnitGuard } from '@/lib/unit-guard';
import { prisma } from '@/lib/db';

// GET — Return unique product names from order history for autocomplete
export async function GET(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

    try {
        const orders = await prisma.order.findMany({
            select: { productName: true },
            distinct: ['productName'],
            orderBy: { createdAt: 'desc' },
            take: 200,
        });

        const suggestions = orders.map(o => o.productName);

        return NextResponse.json(suggestions);
    } catch (err) {
        console.error('GET suggestions error:', err);
        return NextResponse.json([], { status: 500 });
    }
}
