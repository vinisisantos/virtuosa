import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get('category');
  const activeOnly = searchParams.get('active') !== 'false';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};
  if (category) where.category = category;
  if (activeOnly) where.active = true;

  const services = await prisma.serviceCatalog.findMany({ where, orderBy: { category: 'asc' } });

  // Group by category
  const categories: Record<string, typeof services> = {};
  services.forEach(s => {
    if (!categories[s.category]) categories[s.category] = [];
    categories[s.category].push(s);
  });

  return NextResponse.json({ services, categories });
}

export async function POST(req: Request) {
  const body = await req.json();
  const service = await prisma.serviceCatalog.create({
    data: {
      name: body.name,
      description: body.description || null,
      category: body.category || 'Estética',
      price: body.price,
      duration: body.duration || 60,
      unit: body.unit || 'Todas',
      active: body.active !== false,
    },
  });
  return NextResponse.json(service);
}

export async function PUT(req: Request) {
  const body = await req.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.description !== undefined) data.description = body.description;
  if (body.category !== undefined) data.category = body.category;
  if (body.price !== undefined) data.price = body.price;
  if (body.duration !== undefined) data.duration = body.duration;
  if (body.active !== undefined) data.active = body.active;
  if (body.unit !== undefined) data.unit = body.unit;

  const updated = await prisma.serviceCatalog.update({ where: { id: body.id }, data });
  return NextResponse.json(updated);
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });
  await prisma.serviceCatalog.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
