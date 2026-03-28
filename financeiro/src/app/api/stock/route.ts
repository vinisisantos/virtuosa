import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/* GET — List stock items */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const unit = url.searchParams.get('unit');
    const category = url.searchParams.get('category');
    const lowStock = url.searchParams.get('lowStock') === 'true';

    const where: any = { isActive: true };
    if (unit && unit !== 'all') where.unit = unit;
    if (category) where.category = category;
    if (lowStock) {
      where.quantity = { lte: prisma.stockItem.fields.minQuantity };
    }

    const items = await prisma.stockItem.findMany({
      where,
      include: { movements: { orderBy: { createdAt: 'desc' }, take: 5 } },
      orderBy: { name: 'asc' },
    });

    // Post-filter for lowStock since we can't easily compare fields
    const filtered = lowStock ? items.filter(i => i.quantity <= i.minQuantity) : items;
    const lowStockCount = items.filter(i => i.quantity <= i.minQuantity).length;

    return NextResponse.json({ items: filtered, total: filtered.length, lowStockCount });
  } catch (err) {
    console.error('Stock GET error:', err);
    return NextResponse.json({ error: 'Falha ao carregar estoque' }, { status: 500 });
  }
}

/* POST — Create stock item or register movement */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (body.action === 'movement') {
      const { stockItemId, type, quantity, reason, userName } = body;
      if (!stockItemId || !type || !quantity) return NextResponse.json({ error: 'Dados incompletos' }, { status: 400 });

      const delta = type === 'entrada' ? Math.abs(quantity) : type === 'saida' ? -Math.abs(quantity) : quantity;

      const [movement] = await prisma.$transaction([
        prisma.stockMovement.create({
          data: { stockItemId, type, quantity: Math.abs(quantity), reason, userName },
        }),
        prisma.stockItem.update({
          where: { id: stockItemId },
          data: { quantity: { increment: delta } },
        }),
      ]);

      return NextResponse.json({ success: true, movement });
    }

    // Create new item
    const { name, category, unit, quantity, minQuantity, unitCost, supplier, location } = body;
    if (!name) return NextResponse.json({ error: 'Nome obrigatório' }, { status: 400 });

    const item = await prisma.stockItem.create({
      data: { name, category, unit: unit || 'Barueri', quantity: quantity || 0, minQuantity: minQuantity || 5, unitCost: unitCost || 0, supplier, location },
    });

    return NextResponse.json({ success: true, item });
  } catch (err) {
    console.error('Stock POST error:', err);
    return NextResponse.json({ error: 'Falha ao criar item' }, { status: 500 });
  }
}

/* PUT — Update stock item */
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, ...data } = body;
    if (!id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 });

    const item = await prisma.stockItem.update({ where: { id }, data });
    return NextResponse.json({ success: true, item });
  } catch (err) {
    console.error('Stock PUT error:', err);
    return NextResponse.json({ error: 'Falha ao atualizar item' }, { status: 500 });
  }
}

/* DELETE — Soft delete */
export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 });

    await prisma.stockItem.update({ where: { id }, data: { isActive: false } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Stock DELETE error:', err);
    return NextResponse.json({ error: 'Falha ao remover item' }, { status: 500 });
  }
}
