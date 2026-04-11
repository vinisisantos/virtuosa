import { NextRequest, NextResponse } from 'next/server';
import { requireUnitGuard } from '@/lib/unit-guard';
import { prisma } from '@/lib/db';

/* ── GET: Fetch payment proof for a ticket ── */
export async function GET(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  try {
    const { searchParams } = new URL(req.url);
    const ticketId = searchParams.get('ticketId');
    if (!ticketId) return NextResponse.json({ error: 'ticketId obrigatório' }, { status: 400 });

    const ticket = await prisma.reembolsoTicket.findUnique({
      where: { id: ticketId },
      select: { paymentProofData: true, paymentProofName: true, paymentProofType: true, paidAt: true },
    });
    if (!ticket || !ticket.paymentProofData) {
      return NextResponse.json({ error: 'Comprovante não encontrado' }, { status: 404 });
    }

    return NextResponse.json({
      fileData: ticket.paymentProofData,
      fileName: ticket.paymentProofName,
      fileType: ticket.paymentProofType,
      paidAt: ticket.paidAt,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Erro ao buscar comprovante' }, { status: 500 });
  }
}
