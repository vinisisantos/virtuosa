import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUnitGuard } from '@/lib/unit-guard';

export async function POST(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  try {
    const body = await req.json();
    const { aparelhoId, unit, date } = body;

    if (!aparelhoId || !unit || !date) {
      return NextResponse.json({ error: 'aparelhoId, unit e date são obrigatórios' }, { status: 400 });
    }

    const isoDate = new Date(date);
    isoDate.setUTCHours(0, 0, 0, 0); // Zera a hora para garantir apenas a data

    // Upsert para garantir que o aparelho está apenas em uma unidade no dia
    const alocacao = await prisma.alocacaoAparelho.upsert({
      where: {
        aparelhoId_date: {
          aparelhoId,
          date: isoDate
        }
      },
      update: {
        unit
      },
      create: {
        aparelhoId,
        unit,
        date: isoDate
      }
    });

    return NextResponse.json(alocacao, { status: 201 });
  } catch (err: any) {
    console.error('Erro ao alocar aparelho:', err);
    return NextResponse.json({ error: 'Erro ao alocar aparelho' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  try {
    const { searchParams } = new URL(req.url);
    const aparelhoId = searchParams.get('aparelhoId');
    const date = searchParams.get('date');

    if (!aparelhoId || !date) {
      return NextResponse.json({ error: 'aparelhoId e date são obrigatórios' }, { status: 400 });
    }

    const isoDate = new Date(date);
    isoDate.setUTCHours(0, 0, 0, 0);

    await prisma.alocacaoAparelho.delete({
      where: {
        aparelhoId_date: {
          aparelhoId,
          date: isoDate
        }
      }
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    if (err.code === 'P2025') {
      return NextResponse.json({ success: true }); // Já estava deletado
    }
    console.error('Erro ao remover alocação:', err);
    return NextResponse.json({ error: 'Erro ao remover alocação' }, { status: 500 });
  }
}
