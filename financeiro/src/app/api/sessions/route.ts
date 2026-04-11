import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUnitGuard, UnitAccessDeniedError, unitAccessDeniedResponse } from '@/lib/unit-guard';

/* GET — List sessions for a package */
export async function GET(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  try {
    const url = new URL(req.url);
    const packageId = url.searchParams.get('packageId');
    if (!packageId) return NextResponse.json({ error: 'packageId obrigatório' }, { status: 400 });

    // UNIT GUARD: Validate package belongs to user's unit
    const pkg = await (prisma as any).package.findUnique({ where: { id: packageId } });
    if (!pkg) return NextResponse.json({ error: 'Pacote não encontrado' }, { status: 404 });
    try { guard.enforceUnit(pkg.unit); } catch (e) {
      if (e instanceof UnitAccessDeniedError) return unitAccessDeniedResponse();
      throw e;
    }

    const sessions = await (prisma as any).treatmentSession.findMany({
      where: { packageId },
      orderBy: { sessionNumber: 'asc' },
    });

    return NextResponse.json({ sessions });
  } catch (err) {
    console.error('Sessions GET error:', err);
    return NextResponse.json({ error: 'Falha ao carregar sessões' }, { status: 500 });
  }
}

/* POST — Create/finalize a session & increment completedSessions */
export async function POST(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  try {
    const body = await req.json();
    const { packageId, sessionNumber, professional, needsPhotos, needsMeasures, photos, measures, notes } = body;

    if (!packageId) return NextResponse.json({ error: 'packageId obrigatório' }, { status: 400 });

    // UNIT GUARD: Validate package belongs to user's unit
    const pkg = await (prisma as any).package.findUnique({ where: { id: packageId } });
    if (!pkg) return NextResponse.json({ error: 'Pacote não encontrado' }, { status: 404 });
    try { guard.enforceUnit(pkg.unit); } catch (e) {
      if (e instanceof UnitAccessDeniedError) return unitAccessDeniedResponse();
      throw e;
    }

    const session = await (prisma as any).treatmentSession.create({
      data: {
        packageId, sessionNumber: parseInt(sessionNumber),
        professional: professional || null, needsPhotos: !!needsPhotos, needsMeasures: !!needsMeasures,
        photos: photos || null, measures: measures || null, notes: notes || null, status: 'concluida',
      },
    });

    await (prisma as any).package.update({
      where: { id: packageId },
      data: { completedSessions: { increment: 1 } },
    });

    const updatedPkg = await (prisma as any).package.findUnique({ where: { id: packageId } });
    if (updatedPkg && updatedPkg.completedSessions >= updatedPkg.totalSessions) {
      await (prisma as any).package.update({ where: { id: packageId }, data: { status: 'concluido' } });
    }

    return NextResponse.json({ success: true, session });
  } catch (err) {
    console.error('Sessions POST error:', err);
    return NextResponse.json({ error: 'Falha ao criar sessão' }, { status: 500 });
  }
}

/* DELETE — Remove session & decrement completedSessions */
export async function DELETE(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  try {
    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 });

    const session = await (prisma as any).treatmentSession.findUnique({ where: { id } });
    if (!session) return NextResponse.json({ error: 'Sessão não encontrada' }, { status: 404 });

    // UNIT GUARD: Validate parent package belongs to user's unit
    const pkg = await (prisma as any).package.findUnique({ where: { id: session.packageId } });
    if (pkg) {
      try { guard.enforceUnit(pkg.unit); } catch (e) {
        if (e instanceof UnitAccessDeniedError) return unitAccessDeniedResponse();
        throw e;
      }
    }

    await (prisma as any).treatmentSession.delete({ where: { id } });
    await (prisma as any).package.update({
      where: { id: session.packageId },
      data: { completedSessions: { decrement: 1 } },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Sessions DELETE error:', err);
    return NextResponse.json({ error: 'Falha ao remover sessão' }, { status: 500 });
  }
}
