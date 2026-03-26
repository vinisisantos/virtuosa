import { NextRequest, NextResponse } from 'next/server';
import { syncOrdersForUnit } from '@/lib/mercadolivre';
import { prisma } from '@/lib/db';

/* GET /api/mercadolivre/webhook — ML validates this URL */
export async function GET() {
  return NextResponse.json({ ok: true, message: 'Webhook ativo' });
}
/* POST /api/mercadolivre/webhook — ML sends notifications here */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { resource, topic, user_id } = body;

    // Only process orders and shipments
    if (topic !== 'orders_v2' && topic !== 'shipments') {
      return NextResponse.json({ ok: true });
    }

    // Find the connection for this user
    const conn = await prisma.mercadoLivreConnection.findFirst({
      where: { mlUserId: String(user_id), isActive: true },
    });

    if (!conn) {
      return NextResponse.json({ ok: true, message: 'No connection found' });
    }

    // Sync orders for this unit
    await syncOrdersForUnit(conn.unit);

    return NextResponse.json({ ok: true, synced: conn.unit });
  } catch (err: any) {
    console.error('ML webhook error:', err);
    return NextResponse.json({ ok: true }); // Always return 200 to ML
  }
}
