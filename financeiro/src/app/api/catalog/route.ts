import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUnitGuard } from '@/lib/unit-guard';

export async function GET(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  const { searchParams } = new URL(req.url);
  const category = searchParams.get('category');
  const activeOnly = searchParams.get('active') !== 'false';

  const where: any = {};
  if (category) where.category = category;
  if (activeOnly) where.active = true;
  // UNIT GUARD: Show items for user's unit OR 'Todas'
  if (guard.unitFilter) {
    where.OR = [{ unit: guard.unitFilter }, { unit: 'Todas' }];
  }

  const services = await prisma.serviceCatalog.findMany({ where, orderBy: { category: 'asc' } });

  const categories: Record<string, typeof services> = {};
  services.forEach(s => {
    if (!categories[s.category]) categories[s.category] = [];
    categories[s.category].push(s);
  });

  return NextResponse.json({ services, categories });
}

export async function POST(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  const body = await req.json();
  const service = await prisma.serviceCatalog.create({
    data: {
      name: body.name, description: body.description || null,
      category: body.category || 'Estética', price: body.price,
      duration: body.duration || 60,
      unit: guard.isAdmin && body.unit ? body.unit : guard.createUnit(),
      active: body.active !== false,
    },
  });
  return NextResponse.json(service);
}

export async function PUT(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  const body = await req.json();
  const data: any = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.description !== undefined) data.description = body.description;
  if (body.category !== undefined) data.category = body.category;
  if (body.price !== undefined) data.price = body.price;
  if (body.duration !== undefined) data.duration = body.duration;
  if (body.active !== undefined) data.active = body.active;
  // UNIT GUARD: Only admins can change unit
  if (body.unit !== undefined && guard.isAdmin) data.unit = body.unit;

  const updated = await prisma.serviceCatalog.update({ where: { id: body.id }, data });
  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });
  await prisma.serviceCatalog.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
