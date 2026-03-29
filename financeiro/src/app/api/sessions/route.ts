import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/* GET — List sessions for a package */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const packageId = url.searchParams.get('packageId');
    if (!packageId) return NextResponse.json({ error: 'packageId obrigatório' }, { status: 400 });

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
  try {
    const body = await req.json();
    const { packageId, sessionNumber, professional, needsPhotos, needsMeasures, photos, measures, notes } = body;

    if (!packageId) return NextResponse.json({ error: 'packageId obrigatório' }, { status: 400 });

    const session = await (prisma as any).treatmentSession.create({
      data: {
        packageId,
        sessionNumber: parseInt(sessionNumber),
        professional: professional || null,
        needsPhotos: !!needsPhotos,
        needsMeasures: !!needsMeasures,
        photos: photos || null,
        measures: measures || null,
        notes: notes || null,
        status: 'concluida',
      },
    });

    // Increment completedSessions on the Package
    await (prisma as any).package.update({
      where: { id: packageId },
      data: { completedSessions: { increment: 1 } },
    });

    // Check if package is now complete
    const pkg = await (prisma as any).package.findUnique({ where: { id: packageId } });
    if (pkg && pkg.completedSessions >= pkg.totalSessions) {
      await (prisma as any).package.update({
        where: { id: packageId },
        data: { status: 'concluido' },
      });
    }

    return NextResponse.json({ success: true, session });
  } catch (err) {
    console.error('Sessions POST error:', err);
    return NextResponse.json({ error: 'Falha ao criar sessão' }, { status: 500 });
  }
}

/* DELETE — Remove session & decrement completedSessions */
export async function DELETE(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 });

    const session = await (prisma as any).treatmentSession.findUnique({ where: { id } });
    if (!session) return NextResponse.json({ error: 'Sessão não encontrada' }, { status: 404 });

    await (prisma as any).treatmentSession.delete({ where: { id } });

    // Decrement completedSessions
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
