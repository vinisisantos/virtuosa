import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUnitGuard } from '@/lib/unit-guard';

export async function GET(req: NextRequest) {
  // Enforce unit access for this route
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  try {
    const searchParams = req.nextUrl.searchParams;
    let unit = searchParams.get('unit');

    // Se a unidade não for fornecida e o guard tiver uma unitFilter, use-a
    if (!unit && guard.unitFilter) {
      unit = guard.unitFilter;
    } else if (!unit) {
      // Se ainda não tiver unit, pegue a unit do user logado
      unit = guard.userUnit;
    }

    if (!unit || unit === 'Todas') {
      return NextResponse.json({ error: 'Unidade específica é requerida' }, { status: 400 });
    }

    const credito = await prisma.creditoAcumulado.findUnique({
      where: { unit }
    });

    return NextResponse.json({
      unit,
      saldo: credito?.saldo || 0,
      ultimaAtualizacao: credito?.ultimaAtualizacao || null
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Erro ao buscar crédito' }, { status: 500 });
  }
}
