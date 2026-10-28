import { NextRequest, NextResponse } from 'next/server';
import { requireUnitGuard } from '@/lib/unit-guard';
import { getInstancesForRequest } from '@/lib/whatsapp/instance-resolver';
import { ClientReportError, loadClientReport } from '@/lib/whatsapp/client-report-service';

export async function GET(req: NextRequest) {
  const params = new URL(req.url).searchParams;
  const unit = params.get('unit');
  const guard = requireUnitGuard(req, { requestedUnit: unit });
  if (guard instanceof NextResponse) return guard;
  if (!unit || !['SBC', 'Osasco', 'SCS'].includes(unit) || guard.unitFilter !== unit) {
    return NextResponse.json({ error: 'Selecione uma unidade autorizada.' }, { status: 403 });
  }
  const conversationId = params.get('conversationId');
  const instanceId = params.get('targetInstanceId');
  if (!conversationId || !instanceId) return NextResponse.json({ error: 'Informe a conversa e a caixa de origem.' }, { status: 400 });
  try {
    const { instances, targetUserId } = await getInstancesForRequest(req);
    const instance = instances.find(candidate => candidate.id === instanceId && candidate.canView);
    if (!instance) return NextResponse.json({ error: 'Conversa não encontrada ou sem acesso.' }, { status: 404 });
    const report = await loadClientReport({
      conversationId, instanceId, unit, ownerUserId: targetUserId || guard.userId,
      managesSharedInstance: instance.canManage === true && instance.isShared === true,
    });
    return NextResponse.json(report, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    const status = error instanceof ClientReportError ? error.status : 500;
    return NextResponse.json({ error: error instanceof ClientReportError ? error.message : 'Não foi possível carregar o relatório. Tente novamente.' }, { status });
  }
}
