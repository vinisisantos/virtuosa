import { after, NextRequest, NextResponse } from 'next/server';
import { requireUnitGuard, UnitAccessDeniedError, unitAccessDeniedResponse } from '@/lib/unit-guard';
import { dispatchEvaluationGroupNotice, enqueueEvaluationGroupConfirmation } from '@/lib/whatsapp/evaluation-group-notice';

import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  const { searchParams } = new URL(req.url);
  const agendamentoId = searchParams.get('agendamentoId');

  // Generate check-in code for an agendamento
  if (agendamentoId) {
    // Create a simple check-in code (base64 of id + timestamp)
    const code = Buffer.from(`${agendamentoId}:${Date.now()}`).toString('base64url');
    const checkInUrl = `${req.headers.get('origin') || ''}/checkin?code=${code}&id=${agendamentoId}`;
    return NextResponse.json({ code, checkInUrl, agendamentoId });
  }

  return NextResponse.json({ error: 'agendamentoId required' }, { status: 400 });
}

export async function POST(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  const body = await req.json();
  const { agendamentoId } = body;

  if (!agendamentoId) return NextResponse.json({ error: 'agendamentoId required' }, { status: 400 });

  // Update agendamento status to confirmed
  try {
    const result = await prisma.$transaction(async (tx) => {
      const [latest] = await tx.$queryRaw<Array<{ id: string; status: string; unit: string }>>`
        SELECT "id", "status", "unit" FROM "Agendamento" WHERE "id" = ${agendamentoId} FOR UPDATE
      `;
      if (!latest) return null;
      guard.enforceUnit(latest.unit);
      const updated = await tx.agendamento.update({
        where: { id: agendamentoId },
        data: { status: 'confirmado' },
      });
      const noticeId = await enqueueEvaluationGroupConfirmation(tx, {
        appointment: updated,
        previousStatus: latest.status,
      });
      return { updated, noticeId };
    });
    if (!result) return NextResponse.json({ error: 'Agendamento not found' }, { status: 404 });
    const { updated, noticeId } = result;
    if (noticeId) after(async () => { await dispatchEvaluationGroupNotice(noticeId); });
    return NextResponse.json({ success: true, agendamento: updated });
  } catch (error) {
    if (error instanceof UnitAccessDeniedError) return unitAccessDeniedResponse();
    return NextResponse.json({ error: 'Agendamento not found' }, { status: 404 });
  }
}
