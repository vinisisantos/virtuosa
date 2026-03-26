import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/* GET /api/mercadolivre/status?unit=SBC — Check connection status */
export async function GET(req: NextRequest) {
  try {
    const unit = new URL(req.url).searchParams.get('unit');

    if (unit && unit !== 'all') {
      const conn = await prisma.mercadoLivreConnection.findUnique({ where: { unit } });
      return NextResponse.json({
        connected: !!conn?.isActive,
        mlUsername: conn?.mlUsername || null,
        unit,
        expiresAt: conn?.expiresAt || null,
      });
    }

    // Return all connections
    const conns = await prisma.mercadoLivreConnection.findMany({
      select: { unit: true, mlUsername: true, isActive: true, expiresAt: true, updatedAt: true },
    });
    return NextResponse.json(conns);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/* DELETE /api/mercadolivre/status?unit=SBC — Disconnect a unit */
export async function DELETE(req: NextRequest) {
  try {
    const unit = new URL(req.url).searchParams.get('unit');
    if (!unit) return NextResponse.json({ error: 'Unidade obrigatória.' }, { status: 400 });

    await prisma.mercadoLivreConnection.delete({ where: { unit } });
    await prisma.mercadoLivreOrder.deleteMany({ where: { unit } });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
