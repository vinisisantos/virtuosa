import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUnitGuard } from '@/lib/unit-guard';
import { filterDealsByPipelineOwnerScope, resolvePipelineOwnerScope } from '@/lib/pipeline-owner-scope';

// GET — Pipeline statistics / KPIs
export async function GET(req: NextRequest) {
  const guard = requireUnitGuard(req, { requestedUnit: new URL(req.url).searchParams.get('unit') });
  if (guard instanceof NextResponse) return guard;

  const url = new URL(req.url);
  const startDateStr = url.searchParams.get('startDate');
  const endDateStr = url.searchParams.get('endDate');
  const userId = url.searchParams.get('userId');
  const ownerScope = await resolvePipelineOwnerScope(req, guard);

  const where: any = {};
  // UNIT GUARD: Filter by JWT unit
  if (guard.unitFilter) where.unit = guard.unitFilter;
  if (userId && guard.isAdmin && !url.searchParams.get('targetUserId') && !url.searchParams.get('targetInstanceId')) {
    where.assignedTo = userId;
  }

  if (startDateStr || endDateStr) {
    where.createdAt = {};
    if (startDateStr) where.createdAt.gte = new Date(startDateStr);
    if (endDateStr) {
      const endDate = new Date(endDateStr);
      endDate.setHours(23, 59, 59, 999);
      where.createdAt.lte = endDate;
    }
  }

  const allRows = await prisma.salesPipeline.findMany({ where });
  const all = await filterDealsByPipelineOwnerScope(allRows, ownerScope);

  const stages = ['novo_lead', 'em_atendimento', 'em_negociacao', 'fechado', 'perdido'];
  const stageMap: Record<string, { count: number; value: number }> = {};
  for (const s of stages) stageMap[s] = { count: 0, value: 0 };
  for (const row of all) {
    if (!stageMap[row.stage]) stageMap[row.stage] = { count: 0, value: 0 };
    stageMap[row.stage].count += 1;
    stageMap[row.stage].value += row.value || 0;
  }

  const totalLeads = all.length;
  const totalValue = all.reduce((sum, e) => sum + e.value, 0);
  const closedCount = stageMap.fechado.count;
  const lostCount = stageMap.perdido.count;
  const activeCount = totalLeads - closedCount - lostCount;
  const conversionRate = totalLeads > 0 ? ((closedCount / totalLeads) * 100).toFixed(1) : '0.0';

  return NextResponse.json({
    totalLeads, activeCount, totalValue, closedCount, lostCount,
    conversionRate: parseFloat(conversionRate), byStage: stageMap,
  });
}
