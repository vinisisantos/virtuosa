import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { getUserFromHeaders } from '@/lib/auth';

const prisma = new PrismaClient();

export async function GET(req: NextRequest) {
  const user = getUserFromHeaders(req);
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  if (!user.isAdmin && !user.permissions?.financeiro)
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const requestedUnit = searchParams.get('unit');
  const clientName = searchParams.get('clientName');
  const limit = parseInt(searchParams.get('limit') || '200');

  // Non-admins only see their own unit
  const unitFilter = user.isAdmin ? requestedUnit : user.unit;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};
  if (status) where.status = status;
  if (unitFilter) where.unit = unitFilter;
  if (clientName) where.clientName = { contains: clientName };

  const [payments, total] = await Promise.all([
    prisma.payment.findMany({ where, orderBy: { dueDate: 'desc' }, take: limit }),
    prisma.payment.count({ where }),
  ]);

  // Stats filtered by the same unit scope
  const statsWhere: any = unitFilter ? { unit: unitFilter } : {};
  const all = await prisma.payment.findMany({ where: statsWhere });
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

export async function POST(req: NextRequest) {
  const user = getUserFromHeaders(req);
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  if (!user.isAdmin && !user.permissions?.financeiro)
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });

  const body = await req.json();

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
        unit: user.isAdmin ? (body.unit || 'Barueri') : user.unit,
        agendamentoId: body.agendamentoId || null,
        notes: body.notes || null,
      },
    });
    created.push(payment);
  }

  return NextResponse.json(created);
}

export async function PUT(req: NextRequest) {
  const user = getUserFromHeaders(req);
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  if (!user.isAdmin && !user.permissions?.financeiro)
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });

  const body = await req.json();

  // Non-admins can only update payments from their own unit
  if (!user.isAdmin) {
    const existing = await prisma.payment.findUnique({ where: { id: body.id }, select: { unit: true } });
    if (!existing || existing.unit !== user.unit) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }
  }

  const data: Record<string, unknown> = {};
  if (body.status !== undefined) data.status = body.status;
  if (body.paidAt !== undefined) data.paidAt = body.paidAt ? new Date(body.paidAt) : null;
  if (body.method !== undefined) data.method = body.method;
  if (body.notes !== undefined) data.notes = body.notes;
  if (body.amount !== undefined) data.amount = body.amount;
  if (body.dueDate !== undefined) data.dueDate = new Date(body.dueDate);

  if (body.status === 'pago' && !body.paidAt) data.paidAt = new Date();

  const updated = await prisma.payment.update({ where: { id: body.id }, data });
  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest) {
  const user = getUserFromHeaders(req);
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  if (!user.isAdmin && !user.permissions?.financeiro)
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

  if (!user.isAdmin) {
    const existing = await prisma.payment.findUnique({ where: { id }, select: { unit: true } });
    if (!existing || existing.unit !== user.unit) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }
  }

  await prisma.payment.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
