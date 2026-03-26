import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const unit = searchParams.get('unit');
  const where: Record<string, unknown> = { isActive: true };
  if (unit) where.unit = unit;
  const profissionais = await prisma.profissional.findMany({ where, orderBy: { name: 'asc' } });
  return NextResponse.json(profissionais);
}

export async function POST(req: Request) {
  const body = await req.json();
  const profissional = await prisma.profissional.create({
    data: {
      name: body.name,
      unit: body.unit || 'Barueri',
      color: body.color || '#e600a0',
    },
  });
  return NextResponse.json(profissional);
}

export async function PUT(req: Request) {
  const body = await req.json();
  const updated = await prisma.profissional.update({
    where: { id: body.id },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.unit !== undefined && { unit: body.unit }),
      ...(body.color !== undefined && { color: body.color }),
      ...(body.isActive !== undefined && { isActive: body.isActive }),
    },
  });
  return NextResponse.json(updated);
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });
  await prisma.profissional.update({ where: { id }, data: { isActive: false } });
  return NextResponse.json({ ok: true });
}
