import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUnitGuard } from '@/lib/unit-guard';

export async function GET(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  try {
    const { searchParams } = new URL(req.url);
    const month = searchParams.get('month');
    const year = searchParams.get('year');

    const aparelhos = await prisma.aparelho.findMany({
      include: {
        alocacoes: month && year ? {
          where: {
            date: {
              gte: new Date(Number(year), Number(month), 1),
              lt: new Date(Number(year), Number(month) + 1, 1),
            }
          }
        } : true
      },
      orderBy: { name: 'asc' }
    });

    return NextResponse.json(aparelhos);
  } catch (err: any) {
    console.error('Erro ao buscar aparelhos:', err);
    return NextResponse.json({ error: 'Erro ao buscar aparelhos' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  try {
    const body = await req.json();
    const { name, color } = body;

    if (!name) return NextResponse.json({ error: 'Nome do aparelho é obrigatório' }, { status: 400 });

    const aparelho = await prisma.aparelho.create({
      data: {
        name,
        color: color || '#3b82f6'
      }
    });

    return NextResponse.json(aparelho, { status: 201 });
  } catch (err: any) {
    console.error('Erro ao criar aparelho:', err);
    return NextResponse.json({ error: 'Erro ao criar aparelho' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) return NextResponse.json({ error: 'ID do aparelho é obrigatório' }, { status: 400 });

    await prisma.aparelho.delete({
      where: { id }
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Erro ao excluir aparelho:', err);
    return NextResponse.json({ error: 'Erro ao excluir aparelho' }, { status: 500 });
  }
}
