import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUnitGuard } from '@/lib/unit-guard';

/**
 * GET /api/clients/search?q=maria&limit=8&unit=Barueri
 * Busca otimizada de pacientes para autocomplete.
 * Retorna campos essenciais para preenchimento rápido.
 */
export async function GET(req: NextRequest) {
  const guard = requireUnitGuard(req, { requestedUnit: new URL(req.url).searchParams.get('unit') });
  if (guard instanceof NextResponse) return guard;

  try {
    const url = new URL(req.url);
    const q = url.searchParams.get('q')?.trim() || '';
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '8'), 20);

    if (q.length < 2) {
      return NextResponse.json({ clients: [] });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {
      isActive: true,
      OR: [
        { name: { contains: q } },
        { phone: { contains: q } },
        { email: { contains: q } },
        { cpf: { contains: q } },
      ],
    };

    // Apply unit filter
    if (guard.unitFilter) where.unit = guard.unitFilter;

    const clients = await prisma.client.findMany({
      where,
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        cpf: true,
        rg: true,
        birthdate: true,
        gender: true,
        profissao: true,
        estadoCivil: true,
        unit: true,
        notes: true,
        // Address fields
        cep: true,
        estado: true,
        cidade: true,
        bairro: true,
        rua: true,
        numero: true,
        complemento: true,
        pais: true,
      },
      orderBy: { name: 'asc' },
      take: limit,
    });

    return NextResponse.json({ clients });
  } catch (err) {
    console.error('Client search error:', err);
    return NextResponse.json({ error: 'Falha na busca' }, { status: 500 });
  }
}
