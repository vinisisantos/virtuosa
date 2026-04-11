import { NextRequest, NextResponse } from 'next/server';
import { requireUnitGuard } from '@/lib/unit-guard';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/* DELETE — Remove all packages matching a client name */
export async function DELETE(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  try {
    const body = await req.json();
    const { clientName } = body;
    if (!clientName) return NextResponse.json({ error: 'clientName obrigatório' }, { status: 400 });

    const result = await (prisma as any).package.deleteMany({
      where: { clientName },
    });

    return NextResponse.json({ success: true, count: result.count });
  } catch (err) {
    console.error('Packages batch-delete-by-name error:', err);
    return NextResponse.json({ error: 'Falha ao remover pacotes' }, { status: 500 });
  }
}
