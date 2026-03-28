import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const unit = searchParams.get('unit');
  const clientName = searchParams.get('clientName');
  const limit = parseInt(searchParams.get('limit') || '200');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};
  if (status) where.status = status;
  if (unit) where.unit = unit;
  if (clientName) where.clientName = { contains: clientName };

  const [payments, total] = await Promise.all([
    prisma.payment.findMany({ where, orderBy: { dueDate: 'desc' }, take: limit }),
    prisma.payment.count({ where }),
  ]);

  // Stats
  const all = await prisma.payment.findMany();
  const totalReceived = all.filter(p => p.status === 'pago').reduce((s, p) => s + p.amount, 0);
  const totalPending = all.filter(p => p.status === 'pendente').reduce((s, p) => s + p.amount, 0);
  const totalOverdue = all.filter(p => p.status === 'atrasado').reduce((s, p) => s + p.amount, 0);

  // Auto-mark overdue
  const now = new Date();
  const pendingPayments = all.filter(p => p.status === 'pendente' && new Date(p.dueDate) < now);
  for (const p of pendingPayments) {
    await prisma.payment.update({ where: { id: p.id }, data: { status: 'atrasado' } });
  }

  return NextResponse.json({ payments, total, stats: { totalReceived, totalPending, totalOverdue, count: all.length } });
}

export async function POST(req: Request) {
  const body = await req.json();

  // If installments > 1, create multiple payment records
  const installments = body.installments || 1;
  const amountPerInstall = body.amount / installments;
  const created = [];

  for (let i = 1; i <= installments; i++) {
    const dueDate = new Date(body.dueDate);
    dueDate.setMonth(dueDate.getMonth() + (i - 1));

    const payment = await prisma.payment.create({
      data: {
        clientName: body.clientName,
        description: installments > 1 ? `${body.description} (${i}/${installments})` : body.description,
        amount: amountPerInstall,
        method: body.method || 'pix',
        status: 'pendente',
        installments,
        currentInstall: i,
        dueDate,
        unit: body.unit || 'Barueri',
        agendamentoId: body.agendamentoId || null,
        notes: body.notes || null,
      },
    });
    created.push(payment);
  }

  return NextResponse.json(created);
}

export async function PUT(req: Request) {
  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (body.status !== undefined) data.status = body.status;
  if (body.paidAt !== undefined) data.paidAt = body.paidAt ? new Date(body.paidAt) : null;
  if (body.method !== undefined) data.method = body.method;
  if (body.notes !== undefined) data.notes = body.notes;
  if (body.amount !== undefined) data.amount = body.amount;
  if (body.dueDate !== undefined) data.dueDate = new Date(body.dueDate);

  // If marking as paid, set paidAt
  if (body.status === 'pago' && !body.paidAt) data.paidAt = new Date();

  const updated = await prisma.payment.update({ where: { id: body.id }, data });
  return NextResponse.json(updated);
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });
  await prisma.payment.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
