import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const unit = searchParams.get('unit');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};
  if (status) where.status = status;
  if (unit) where.unit = unit;

  const entries = await prisma.waitlistEntry.findMany({ where, orderBy: { desiredDate: 'asc' } });
  const stats = {
    waiting: await prisma.waitlistEntry.count({ where: { status: 'aguardando' } }),
    notified: await prisma.waitlistEntry.count({ where: { status: 'notificado' } }),
    scheduled: await prisma.waitlistEntry.count({ where: { status: 'agendado' } }),
  };
  return NextResponse.json({ entries, stats });
}

export async function POST(req: Request) {
  const body = await req.json();
  const entry = await prisma.waitlistEntry.create({
    data: {
      clientName: body.clientName,
      clientPhone: body.clientPhone || null,
      procedimento: body.procedimento,
      profissional: body.profissional || null,
      desiredDate: new Date(body.desiredDate),
      unit: body.unit || 'Barueri',
      notes: body.notes || null,
    },
  });
  return NextResponse.json(entry);
}

export async function PUT(req: Request) {
  const body = await req.json();
  const updated = await prisma.waitlistEntry.update({
    where: { id: body.id },
    data: { status: body.status },
  });
  return NextResponse.json(updated);
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });
  await prisma.waitlistEntry.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
