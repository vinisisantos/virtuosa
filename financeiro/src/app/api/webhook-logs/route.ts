import { NextRequest, NextResponse } from 'next/server';
import { requireUnitGuard } from '@/lib/unit-guard';
import { prisma } from '@/lib/db';

// GET — List webhook logs
export async function GET(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  const { searchParams } = new URL(req.url);
  const source = searchParams.get('source');
  const status = searchParams.get('status');
  const limit = parseInt(searchParams.get('limit') || '100');

  const where: Record<string, unknown> = {};
  if (source) where.source = source;
  if (status) where.status = status;

  const logs = await prisma.webhookLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return NextResponse.json(logs);
}
