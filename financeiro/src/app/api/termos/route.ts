import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUnitGuard } from '@/lib/unit-guard';

export async function GET(req: NextRequest) {
  const guard = requireUnitGuard(req, { requestedUnit: new URL(req.url).searchParams.get('unit') });
  if (guard instanceof NextResponse) return guard;

  try {
    const where: Record<string, unknown> = {};
    // UNIT GUARD: Filter by JWT unit
    if (guard.unitFilter) where.unit = guard.unitFilter;

    const history = await prisma.termoHistory.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      orderBy: { createdAt: 'desc' },
    });

    const clientNames = [...new Set(history.map((h: any) => h.clientName).filter(Boolean))];
    let contractStatusMap: Record<string, string> = {};
    if (clientNames.length > 0) {
      const contracts = await (prisma as any).digitalContract.findMany({
        where: { clientName: { in: clientNames } },
        select: { clientName: true, status: true },
        orderBy: { createdAt: 'desc' },
      });
      for (const c of contracts) {
        if (!contractStatusMap[c.clientName]) contractStatusMap[c.clientName] = c.status;
      }
    }

    const enriched = history.map((h: any) => ({ ...h, contractStatus: contractStatusMap[h.clientName] || null }));
    return NextResponse.json(enriched);
  } catch (error) {
    console.error('Failed to fetch termos history:', error);
    return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  try {
    const body = await req.json();
    const { templateName, clientName, docType, html } = body;

    if (!templateName) return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });

    const record = await prisma.termoHistory.create({
      data: {
        templateName, clientName: clientName || 'Cliente',
        unit: guard.createUnit(), // UNIT GUARD: Force JWT unit
        docType: docType || 'Termo', html: html || '',
      },
    });

    return NextResponse.json(record, { status: 201 });
  } catch (error) {
    console.error('Failed to save termo history:', error);
    return NextResponse.json({ error: 'Failed to save record' }, { status: 500 });
  }
}
