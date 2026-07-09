import { NextRequest, NextResponse } from 'next/server';
import {
  syncPipelinePlacementsFromClientUnits,
  syncServiceDealsFromClientStage,
} from '@/lib/pipeline/maintenance';
import { requireUnitGuard } from '@/lib/unit-guard';

export async function POST(req: NextRequest) {
  const guard = requireUnitGuard(req, { requestedUnit: new URL(req.url).searchParams.get('unit') });
  if (guard instanceof NextResponse) return guard;

  if (!guard.isAdmin && guard.permissions?.admin !== true) {
    return NextResponse.json(
      { error: 'Apenas administradores podem executar manutenção do pipeline.' },
      { status: 403 },
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const force = body.force === true;
    const pipelineId = typeof body.pipelineId === 'string' ? body.pipelineId : null;
    const unit = typeof body.unit === 'string' ? guard.createUnit(body.unit) : guard.unitFilter;
    const runServiceStageSync = body.serviceStageSync === true;

    const placement = await syncPipelinePlacementsFromClientUnits({ force });
    const serviceStage = runServiceStageSync
      ? await syncServiceDealsFromClientStage({ pipelineId, unit })
      : null;

    return NextResponse.json({
      ok: true,
      placement,
      serviceStage,
    });
  } catch (error) {
    console.error('[PipelineMaintenance] Erro ao executar manutenção:', error);
    return NextResponse.json({ error: 'Erro ao executar manutenção do pipeline' }, { status: 500 });
  }
}
