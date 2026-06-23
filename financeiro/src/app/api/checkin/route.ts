import { NextRequest, NextResponse } from 'next/server';
import { requireUnitGuard } from '@/lib/unit-guard';

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
    const updated = await prisma.agendamento.update({
      where: { id: agendamentoId },
      data: { status: 'confirmado' },
    });
    return NextResponse.json({ success: true, agendamento: updated });
  } catch {
    return NextResponse.json({ error: 'Agendamento not found' }, { status: 404 });
  }
}
