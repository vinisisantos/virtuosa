import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get('clientId');
  const procedimento = searchParams.get('procedimento');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};
  if (clientId) where.clientId = clientId;
  if (procedimento) where.procedimento = procedimento;

  const photos = await prisma.clientPhoto.findMany({ where, orderBy: { sessionDate: 'desc' } });
  return NextResponse.json({ photos });
}

export async function POST(req: Request) {
  const body = await req.json();
  const photo = await prisma.clientPhoto.create({
    data: {
      clientId: body.clientId,
      clientName: body.clientName,
      type: body.type, // before or after
      procedimento: body.procedimento,
      imageData: body.imageData, // base64
      notes: body.notes || null,
      sessionDate: body.sessionDate ? new Date(body.sessionDate) : new Date(),
    },
  });
  return NextResponse.json(photo);
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });
  await prisma.clientPhoto.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
