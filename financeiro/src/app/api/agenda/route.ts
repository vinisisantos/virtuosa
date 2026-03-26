import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const unit = searchParams.get('unit');
  const start = searchParams.get('start'); // ISO date
  const end = searchParams.get('end');     // ISO date
  const profissionalId = searchParams.get('profissionalId');
  const status = searchParams.get('status');
  const procedimento = searchParams.get('procedimento');
  const search = searchParams.get('search');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};
  if (unit) where.unit = unit;
  if (profissionalId) where.profissionalId = profissionalId;
  if (status) where.status = status;
  if (procedimento) where.procedimento = { contains: procedimento };
  if (search) {
    where.OR = [
      { clientName: { contains: search } },
      { procedimento: { contains: search } },
    ];
  }
  if (start && end) {
    where.startTime = { gte: new Date(start), lte: new Date(end) };
  }

  const agendamentos = await prisma.agendamento.findMany({
    where,
    include: { profissional: true },
    orderBy: { startTime: 'asc' },
  });

  return NextResponse.json(agendamentos);
}

export async function POST(req: Request) {
  const body = await req.json();
  const agendamento = await prisma.agendamento.create({
    data: {
      clientName: body.clientName,
      clientPhone: body.clientPhone || null,
      procedimento: body.procedimento,
      profissionalId: body.profissionalId,
      unit: body.unit || 'Barueri',
      startTime: new Date(body.startTime),
      endTime: new Date(body.endTime),
      status: body.status || 'pendente',
      sala: body.sala || null,
      sessionNumber: body.sessionNumber || null,
      totalSessions: body.totalSessions || null,
      notes: body.notes || null,
    },
    include: { profissional: true },
  });
  return NextResponse.json(agendamento);
}

export async function PUT(req: Request) {
  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (body.clientName !== undefined) data.clientName = body.clientName;
  if (body.clientPhone !== undefined) data.clientPhone = body.clientPhone;
  if (body.procedimento !== undefined) data.procedimento = body.procedimento;
  if (body.profissionalId !== undefined) data.profissionalId = body.profissionalId;
  if (body.unit !== undefined) data.unit = body.unit;
  if (body.startTime !== undefined) data.startTime = new Date(body.startTime);
  if (body.endTime !== undefined) data.endTime = new Date(body.endTime);
  if (body.status !== undefined) data.status = body.status;
  if (body.sala !== undefined) data.sala = body.sala;
  if (body.sessionNumber !== undefined) data.sessionNumber = body.sessionNumber;
  if (body.totalSessions !== undefined) data.totalSessions = body.totalSessions;
  if (body.notes !== undefined) data.notes = body.notes;

  const updated = await prisma.agendamento.update({
    where: { id: body.id },
    data,
    include: { profissional: true },
  });
  return NextResponse.json(updated);
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });
  await prisma.agendamento.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
