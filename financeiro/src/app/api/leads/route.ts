import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { processLead } from '@/lib/lead-processor';
import { requireUnitGuard } from '@/lib/unit-guard';

// GET — List Meta leads
export async function GET(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const limit = parseInt(searchParams.get('limit') || '100');

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  // UNIT GUARD: Filter by JWT unit
  if (guard.unitFilter) where.unit = guard.unitFilter;

  const leads = await prisma.metaLead.findMany({ where, orderBy: { createdAt: 'desc' }, take: limit });
  return NextResponse.json(leads);
}

// POST — Reprocess a lead manually
export async function POST(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  try {
    const body = await req.json();
    const { leadId } = body;
    if (!leadId) return NextResponse.json({ error: 'leadId required' }, { status: 400 });

    const lead = await prisma.metaLead.findUnique({ where: { id: leadId } });
    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

    const result = await processLead({
      leadgenId: lead.leadgenId, formId: lead.formId || undefined,
      formName: lead.formName || undefined, adId: lead.adId || undefined,
      adName: lead.adName || undefined, campaignId: lead.campaignId || undefined,
      campaignName: lead.campaignName || undefined, pageId: lead.pageId || undefined,
      platform: lead.platform, name: lead.name || undefined,
      email: lead.email || undefined, phone: lead.phone || undefined,
      rawData: lead.rawData || undefined,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('[Leads] Reprocess error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
