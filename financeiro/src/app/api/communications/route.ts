import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const clientName = searchParams.get('clientName');
  const channel = searchParams.get('channel');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};
  if (clientName) where.clientName = { contains: clientName };
  if (channel) where.channel = channel;

  const logs = await prisma.communicationLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100 });

  const stats = {
    total: await prisma.communicationLog.count(),
    whatsapp: await prisma.communicationLog.count({ where: { channel: 'whatsapp' } }),
    phone: await prisma.communicationLog.count({ where: { channel: 'phone' } }),
    email: await prisma.communicationLog.count({ where: { channel: 'email' } }),
  };

  return NextResponse.json({ logs, stats });
}

export async function POST(req: Request) {
  const body = await req.json();
  const log = await prisma.communicationLog.create({
    data: {
      clientName: body.clientName,
      clientPhone: body.clientPhone || null,
      channel: body.channel || 'whatsapp',
      direction: body.direction || 'outgoing',
      message: body.message,
      type: body.type || 'manual',
      unit: body.unit || 'Barueri',
    },
  });
  return NextResponse.json(log);
}
