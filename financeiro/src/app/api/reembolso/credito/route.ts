import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUnitGuard } from '@/lib/unit-guard';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // Enforce unit access for this route
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  try {
    // Use a chaves particular do usuário globalmente.
    const personalUnitKey = `user_${guard.userId}`;

    const credito = await prisma.creditoAcumulado.findUnique({
      where: { unit: personalUnitKey }
    });

    return NextResponse.json({
      unit: personalUnitKey,
      saldo: credito?.saldo || 0,
      ultimaAtualizacao: credito?.ultimaAtualizacao || null
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Erro ao buscar crédito' }, { status: 500 });
  }
}
