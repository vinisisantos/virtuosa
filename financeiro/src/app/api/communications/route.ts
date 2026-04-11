import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUnitGuard } from '@/lib/unit-guard';

export async function GET(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  const { searchParams } = new URL(req.url);
  const clientName = searchParams.get('clientName');
  const channel = searchParams.get('channel');

  const where: any = {};
  if (clientName) where.clientName = { contains: clientName };
  if (channel) where.channel = channel;
  // UNIT GUARD: Filter by JWT unit
  if (guard.unitFilter) where.unit = guard.unitFilter;

  const logs = await prisma.communicationLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100 });

  const unitWhere = guard.unitFilter ? { unit: guard.unitFilter } : {};
  const stats = {
    total: await prisma.communicationLog.count({ where: unitWhere }),
    whatsapp: await prisma.communicationLog.count({ where: { ...unitWhere, channel: 'whatsapp' } }),
    phone: await prisma.communicationLog.count({ where: { ...unitWhere, channel: 'phone' } }),
    email: await prisma.communicationLog.count({ where: { ...unitWhere, channel: 'email' } }),
  };

  return NextResponse.json({ logs, stats });
}

export async function POST(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  const body = await req.json();
  const log = await prisma.communicationLog.create({
    data: {
      clientName: body.clientName, clientPhone: body.clientPhone || null,
      channel: body.channel || 'whatsapp', direction: body.direction || 'outgoing',
      message: body.message, type: body.type || 'manual',
      unit: guard.createUnit(), // UNIT GUARD: Force JWT unit
    },
  });
  return NextResponse.json(log);
}
