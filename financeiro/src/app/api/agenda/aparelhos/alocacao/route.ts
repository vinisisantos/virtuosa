import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUnitGuard } from '@/lib/unit-guard';

export async function POST(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  try {
    const body = await req.json();
    const { aparelhoId, unit, date, userId, userName } = body;

    if (!aparelhoId || !unit || !date) {
      return NextResponse.json({ error: 'aparelhoId, unit e date são obrigatórios' }, { status: 400 });
    }

    const isoDate = new Date(date);
    isoDate.setUTCHours(0, 0, 0, 0);

    const alocacao = await prisma.alocacaoAparelho.upsert({
      where: {
        aparelhoId_date: {
          aparelhoId,
          date: isoDate
        }
      },
      update: {
        unit,
        userId: userId || null,
        userName: userName || null
      },
      create: {
        aparelhoId,
        unit,
        date: isoDate,
        userId: userId || null,
        userName: userName || null
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
    const userId = searchParams.get('userId');

    if (!aparelhoId || !date) {
      return NextResponse.json({ error: 'aparelhoId e date são obrigatórios' }, { status: 400 });
    }

    const isoDate = new Date(date);
    isoDate.setUTCHours(0, 0, 0, 0);

    const existing = await prisma.alocacaoAparelho.findUnique({
      where: { aparelhoId_date: { aparelhoId, date: isoDate } }
    });

    if (!existing) return NextResponse.json({ success: true });

    if (existing.userId && existing.userId !== userId) {
      // Check if user is admin
      if (userId) {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user || (user.role !== 'ADMINISTRADOR' && !(user.permissions as any)?.admin)) {
          return NextResponse.json({ error: 'Você não tem permissão para remover esta alocação. Apenas quem criou ou um ADM pode excluí-la.' }, { status: 403 });
        }
      } else {
        return NextResponse.json({ error: 'Autenticação necessária' }, { status: 401 });
      }
    }

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
