import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUnitGuard, UnitAccessDeniedError, unitAccessDeniedResponse } from '@/lib/unit-guard';

/* GET — List packages with filters */
export async function GET(req: NextRequest) {
  const guard = requireUnitGuard(req, { requestedUnit: new URL(req.url).searchParams.get('unit') });
  if (guard instanceof NextResponse) return guard;

  try {
    const url = new URL(req.url);
    const status = url.searchParams.get('status');
    const search = url.searchParams.get('search');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};
    // UNIT GUARD: Filter by JWT unit
    if (guard.unitFilter) where.unit = guard.unitFilter;
    if (status) where.status = status;
    if (search) {
      where.OR = [{ clientName: { contains: search } }];
    }

    const packages = await (prisma as any).package.findMany({ where, orderBy: { createdAt: 'desc' } });

    const stats = {
      total: packages.length,
      ativos: packages.filter((p: any) => p.status === 'ativo').length,
      concluidos: packages.filter((p: any) => p.status === 'concluido').length,
      totalValue: packages.reduce((s: number, p: any) => s + p.totalValue, 0),
      totalPaid: packages.reduce((s: number, p: any) => s + p.paidValue, 0),
    };

    return NextResponse.json({ packages, stats });
  } catch (err) {
    console.error('Packages GET error:', err);
    return NextResponse.json({ error: 'Falha ao carregar pacotes' }, { status: 500 });
  }
}

/* POST — Create package */
export async function POST(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  try {
    const body = await req.json();
    const pkg = await (prisma as any).package.create({
      data: {
        clientName: body.clientName,
        clientId: body.clientId || null,
        services: typeof body.services === 'string' ? body.services : JSON.stringify(body.services),
        totalValue: parseFloat(body.totalValue),
        paidValue: parseFloat(body.paidValue || '0'),
        paymentMethod: body.paymentMethod || 'pix',
        installments: parseInt(body.installments || '1'),
        totalSessions: parseInt(body.totalSessions || '1'),
        completedSessions: parseInt(body.completedSessions || '0'),
        status: body.status || 'ativo',
        unit: guard.createUnit(body.unit), // UNIT GUARD: Force JWT unit
        notes: body.notes || null,
      },
    });
    return NextResponse.json({ success: true, package: pkg });
  } catch (err) {
    console.error('Packages POST error:', err);
    return NextResponse.json({ error: 'Falha ao criar pacote' }, { status: 500 });
  }
}

/* PUT — Update package */
export async function PUT(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  try {
    const body = await req.json();
    const { id, ...data } = body;
    if (!id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 });

    // UNIT GUARD: Validate record belongs to user's unit
    const existing = await (prisma as any).package.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Pacote não encontrado' }, { status: 404 });
    try { guard.enforceUnit(existing.unit); } catch (e) {
      if (e instanceof UnitAccessDeniedError) return unitAccessDeniedResponse();
      throw e;
    }

    if (data.services && typeof data.services !== 'string') data.services = JSON.stringify(data.services);
    if (data.totalValue) data.totalValue = parseFloat(data.totalValue);
    if (data.paidValue !== undefined) data.paidValue = parseFloat(data.paidValue);
    if (data.installments) data.installments = parseInt(data.installments);
    if (data.totalSessions) data.totalSessions = parseInt(data.totalSessions);
    if (data.completedSessions !== undefined) data.completedSessions = parseInt(data.completedSessions);
    // UNIT GUARD: Don't allow unit change for non-admins
    if (!guard.isAdmin) delete data.unit;

    const pkg = await (prisma as any).package.update({ where: { id }, data });
    return NextResponse.json({ success: true, package: pkg });
  } catch (err) {
    console.error('Packages PUT error:', err);
    return NextResponse.json({ error: 'Falha ao atualizar pacote' }, { status: 500 });
  }
}

/* DELETE — Remove package */
export async function DELETE(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  try {
    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 });

    // UNIT GUARD: Validate record belongs to user's unit
    const existing = await (prisma as any).package.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Pacote não encontrado' }, { status: 404 });
    try { guard.enforceUnit(existing.unit); } catch (e) {
      if (e instanceof UnitAccessDeniedError) return unitAccessDeniedResponse();
      throw e;
    }

    await (prisma as any).package.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Packages DELETE error:', err);
    return NextResponse.json({ error: 'Falha ao remover pacote' }, { status: 500 });
  }
}
