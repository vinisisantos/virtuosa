import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUnitGuard, UnitAccessDeniedError, unitAccessDeniedResponse } from '@/lib/unit-guard';
import { parseDateTimeRange } from '@/lib/date-filter';

// Map pipeline stages to client stages for sync
const pipelineToClientStage: Record<string, string> = {
  novo_lead: 'entrada',
  em_atendimento: 'em_andamento',
  enviado: 'em_andamento',
  agendado: 'em_andamento',
  em_negociacao: 'avaliacao',
  fechado: 'venda',
  perdido: 'nao_venda',
  finalizado: 'nao_venda',
  encerrado: 'nao_venda',
  descartado: 'nao_venda',
  sem_retorno: 'nao_venda',
  nao_viavel: 'nao_venda',
};

// Deriva a chave canônica de `stage` a partir do nome da etapa (PipelineStage),
// mantendo a coluna legada `stage` em sincronia com a etapa real (`stageId`).
// Ex.: "Em Negociação" → "em_negociacao", "Enviado" → "enviado".
function stageKeyFromName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '') // remove acentos
    .replace(/\s+/g, '_');
}

function isDiscardStage(stage?: string | null): boolean {
  return !!stage && ['perdido', 'finalizado', 'encerrado', 'descartado', 'sem_retorno', 'nao_viavel'].includes(stage);
}

async function syncServiceDealsFromClientStage(params: { pipelineId?: string | null; unit?: string }) {
  const { pipelineId, unit } = params;
  if (!pipelineId || !unit) return;

  const stages = await prisma.pipelineStage.findMany({
    where: { pipelineId },
    orderBy: { position: 'asc' },
    take: 2,
  });
  const firstStage = stages[0];
  const serviceStage = stages[1];
  if (!firstStage || !serviceStage) return;

  const candidateDeals = await prisma.salesPipeline.findMany({
    where: {
      pipelineId,
      unit,
      OR: [
        { stageId: firstStage.id },
        { stage: { in: ['novo_lead', 'entrada'] } },
      ],
    },
    select: { id: true, clientId: true },
    take: 500,
  });
  if (!candidateDeals.length) return;

  const clientIds = [...new Set(candidateDeals.map((deal) => deal.clientId).filter(Boolean))];
  const serviceClients = await prisma.client.findMany({
    where: {
      id: { in: clientIds },
      unit,
      stage: 'em_andamento',
    },
    select: { id: true },
  });
  const serviceClientIds = new Set(serviceClients.map((client) => client.id));
  const dealIds = candidateDeals
    .filter((deal) => serviceClientIds.has(deal.clientId))
    .map((deal) => deal.id);
  if (!dealIds.length) return;

  await prisma.salesPipeline.updateMany({
    where: { id: { in: dealIds } },
    data: {
      stageId: serviceStage.id,
      stage: stageKeyFromName(serviceStage.name),
    },
  });
}

// GET — List pipeline entries
export async function GET(req: NextRequest) {
  const guard = requireUnitGuard(req, { requestedUnit: new URL(req.url).searchParams.get('unit') });
  if (guard instanceof NextResponse) return guard;

  const { searchParams } = new URL(req.url);
  const pipelineId = searchParams.get('pipelineId');
  const stageId = searchParams.get('stageId');
  const assignedTo = searchParams.get('assignedTo');
  const order = searchParams.get('order') || 'recent';
  const dateRange = parseDateTimeRange(searchParams);

  const where: any = {};
  if (pipelineId) where.pipelineId = pipelineId;
  if (stageId) where.stageId = { in: stageId.split(',').map((v) => v.trim()).filter(Boolean) };
  // Fallback for old stage string if needed
  if (searchParams.get('stage')) where.stage = { in: searchParams.get('stage')!.split(',').map((v) => v.trim()).filter(Boolean) };
  if (dateRange) where.createdAt = dateRange;

  // UNIT GUARD: Filter by JWT unit  
  if (guard.unitFilter) where.unit = guard.unitFilter;
  if (assignedTo) where.assignedTo = assignedTo;

  await syncServiceDealsFromClientStage({ pipelineId, unit: guard.unitFilter });

  const entries = await prisma.salesPipeline.findMany({
    where,
    orderBy: order === 'oldest' ? { createdAt: 'asc' } : { createdAt: 'desc' },
  });
  return NextResponse.json(entries);
}

// POST — Create pipeline entry manually
export async function POST(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  try {
    const body = await req.json();
    const { clientId, clientName, stage, stageId, pipelineId, value, source, assignedTo, assignedName, notes, leadId } = body;

    if (!clientId || !clientName) return NextResponse.json({ error: 'clientId and clientName required' }, { status: 400 });

    let finalPipelineId = pipelineId;
    let finalStageId = stageId;

    if (!finalPipelineId) {
      const defaultPipeline = await prisma.pipeline.findFirst({
        where: { unit: guard.createUnit() },
        orderBy: { createdAt: 'asc' },
      }) || await prisma.pipeline.findFirst({
        orderBy: { createdAt: 'asc' }
      });

      if (defaultPipeline) {
        finalPipelineId = defaultPipeline.id;
        if (!finalStageId) {
          const firstStage = await prisma.pipelineStage.findFirst({
            where: { pipelineId: defaultPipeline.id },
            orderBy: { position: 'asc' },
          });
          if (firstStage) finalStageId = firstStage.id;
        }
      }
    }

    let effectiveStage = stage || 'novo_lead';
    if (!stage && finalStageId) {
      const ps = await prisma.pipelineStage.findUnique({
        where: { id: finalStageId },
        select: { name: true },
      });
      if (ps?.name) effectiveStage = stageKeyFromName(ps.name);
    }

    const entry = await prisma.salesPipeline.create({
      data: {
        clientId, clientName, 
        stage: effectiveStage,
        stageId: finalStageId, pipelineId: finalPipelineId,
        value: value || 0,
        source, assignedTo, assignedName,
        unit: guard.createUnit(), // UNIT GUARD: Force JWT unit
        notes, leadId,
      },
    });

    const clientStage = pipelineToClientStage[effectiveStage];
    if (clientStage) {
      await prisma.client.update({
        where: { id: clientId },
        data: { stage: clientStage },
      }).catch(() => { /* client may not exist */ });
    }

    return NextResponse.json(entry, { status: 201 });
  } catch (error) {
    console.error('[Pipeline] Create error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// PUT — Update pipeline entry
export async function PUT(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  try {
    const body = await req.json();
    const { id, stage, stageId, pipelineId, assignedTo, assignedName, value, notes, lostReason, closedAt } = body;
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

    // UNIT GUARD: Validate record belongs to user's unit
    const existing = await prisma.salesPipeline.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
    try { guard.enforceUnit(existing.unit); } catch (e) {
      if (e instanceof UnitAccessDeniedError) return unitAccessDeniedResponse();
      throw e;
    }

    // Mantém a string `stage` em sincronia com o `stageId`: quando a UI move o
    // lead enviando só o stageId (ex.: seletor do chat), derivamos a etapa pelo
    // nome do PipelineStage. Sem isso, a string `stage` ficava congelada e
    // contagens (deals abertos), Client.stage, closedAt e log saíam errados.
    let effectiveStage: string | undefined = stage;
    if (effectiveStage === undefined && stageId) {
      const ps = await prisma.pipelineStage.findUnique({
        where: { id: stageId },
        select: { name: true },
      });
      if (ps?.name) effectiveStage = stageKeyFromName(ps.name);
    }
    const isDiscard = isDiscardStage(effectiveStage);
    const isClosing = effectiveStage === 'fechado' || isDiscard;

    const data: Record<string, unknown> = {};
    if (effectiveStage !== undefined) {
      data.stage = effectiveStage;
      if (isClosing) data.closedAt = closedAt ? new Date(closedAt) : new Date();
      if (isDiscard && lostReason === undefined && !existing.lostReason) {
        data.lostReason = 'Encerrado sem motivo informado';
      }
      if (effectiveStage === 'fechado' && lostReason === undefined) {
        data.lostReason = null;
      }
      if (!isClosing) {
        data.closedAt = null;
        if (lostReason === undefined) data.lostReason = null;
      }
    }
    if (stageId !== undefined) data.stageId = stageId;
    if (pipelineId !== undefined) data.pipelineId = pipelineId;
    if (assignedTo !== undefined) data.assignedTo = assignedTo;
    if (assignedName !== undefined) data.assignedName = assignedName;
    if (value !== undefined) data.value = value;
    if (notes !== undefined) data.notes = notes;
    if (closedAt !== undefined && !isClosing) data.closedAt = closedAt ? new Date(closedAt) : null;
    if (lostReason !== undefined) data.lostReason = lostReason;

    const updated = await prisma.salesPipeline.update({ where: { id }, data });

    // ── Sync Client stage when pipeline moves ──
    if (effectiveStage && existing.clientId) {
      const clientStage = pipelineToClientStage[effectiveStage];
      if (clientStage) {
        await prisma.client.update({
          where: { id: existing.clientId },
          data: { stage: clientStage },
        }).catch(() => { /* client may not exist */ });
      }
    }

    if (effectiveStage) {
      await prisma.auditLog.create({
        data: {
          userName: guard.userName || assignedName || 'Sistema',
          action: 'update', entity: 'pipeline', entityId: id,
          details: `Oportunidade "${updated.clientName}" movida para estágio: ${effectiveStage}`,
          unit: guard.userUnit,
        },
      });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error('[Pipeline] Update error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// DELETE — Remove pipeline entry
export async function DELETE(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

  const existing = await prisma.salesPipeline.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  try { guard.enforceUnit(existing.unit); } catch (e) {
    if (e instanceof UnitAccessDeniedError) return unitAccessDeniedResponse();
    throw e;
  }

  await prisma.salesPipeline.delete({ where: { id } });

  // Reset client stage to 'entrada' when pipeline entry is removed
  if (existing.clientId) {
    await prisma.client.update({
      where: { id: existing.clientId },
      data: { stage: 'entrada' },
    }).catch(() => { /* client may not exist */ });
  }

  return NextResponse.json({ success: true });
}
