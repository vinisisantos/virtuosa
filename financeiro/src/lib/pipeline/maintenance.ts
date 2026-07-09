import { prisma } from '@/lib/db';
import { phoneLookupKey } from '@/lib/phone';
import { pipelineStageKeyFromName } from '@/lib/pipeline/stages';

const PIPELINE_PLACEMENT_SYNC_KEY = 'pipeline_placement_sync_by_phone_and_dedup_last_run_v1';
const PIPELINE_PLACEMENT_SYNC_INTERVAL_MS = 5 * 60 * 1000;
const PIPELINE_UNITS = ['Osasco', 'SBC', 'SCS'];

export type PipelinePlacementSyncResult = {
  skipped: boolean;
  checkedDeals: number;
  checkedConversations: number;
  updatedDeals: number;
  updatedClients: number;
  deletedDuplicates: number;
  reason?: string;
};

export type PipelineServiceStageSyncResult = {
  skipped: boolean;
  checkedDeals: number;
  updatedDeals: number;
  reason?: string;
};

function emptyPlacementSyncResult(skipped: boolean, reason?: string): PipelinePlacementSyncResult {
  return {
    skipped,
    checkedDeals: 0,
    checkedConversations: 0,
    updatedDeals: 0,
    updatedClients: 0,
    deletedDuplicates: 0,
    reason,
  };
}

export async function syncPipelinePlacementsFromClientUnits(
  opts: { force?: boolean } = {},
): Promise<PipelinePlacementSyncResult> {
  if (!opts.force) {
    try {
      const lastRun = await prisma.appSetting.findUnique({
        where: { key: PIPELINE_PLACEMENT_SYNC_KEY },
        select: { value: true },
      });
      const lastRunAt = lastRun?.value ? new Date(lastRun.value).getTime() : 0;
      if (lastRunAt && Date.now() - lastRunAt < PIPELINE_PLACEMENT_SYNC_INTERVAL_MS) {
        return emptyPlacementSyncResult(true, 'interval');
      }
    } catch (error) {
      console.warn('[Pipeline] Não foi possível consultar a janela de sincronização:', error);
    }
  }

  try {
    await prisma.appSetting.upsert({
      where: { key: PIPELINE_PLACEMENT_SYNC_KEY },
      create: { key: PIPELINE_PLACEMENT_SYNC_KEY, value: new Date().toISOString() },
      update: { value: new Date().toISOString() },
    });
  } catch (error) {
    console.warn('[Pipeline] Não foi possível registrar a janela de sincronização:', error);
  }

  const result = emptyPlacementSyncResult(false);
  const deals = await prisma.salesPipeline.findMany({
    where: {
      clientId: { not: '' },
    },
    select: {
      id: true,
      clientId: true,
      clientName: true,
      unit: true,
      pipelineId: true,
      stage: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: 'desc' },
    take: 2000,
  });
  result.checkedDeals = deals.length;
  if (!deals.length) return result;

  const clientIds = [...new Set(deals.map((deal) => deal.clientId).filter(Boolean))];
  const pipelineIds = [...new Set(deals.map((deal) => deal.pipelineId).filter(Boolean))] as string[];

  const [clients, pipelines] = await Promise.all([
    prisma.client.findMany({
      where: { id: { in: clientIds } },
      select: { id: true, phone: true, unit: true },
    }),
    pipelineIds.length
      ? prisma.pipeline.findMany({
          where: { id: { in: pipelineIds } },
          select: { id: true, unit: true },
        })
      : Promise.resolve([] as Array<{ id: string; unit: string }>),
  ]);

  const conversationUnitsByPhone = new Map<string, Set<string>>();
  const conversationLinks = await prisma.whatsAppConversation.findMany({
    where: {
      instance: {
        unit: { in: PIPELINE_UNITS },
      },
    },
    select: {
      contact: { select: { phone: true } },
      instance: { select: { unit: true } },
    },
    orderBy: { updatedAt: 'desc' },
    take: 10000,
  });
  result.checkedConversations = conversationLinks.length;

  for (const conversation of conversationLinks) {
    const unit = conversation.instance.unit;
    const phoneKey = phoneLookupKey(conversation.contact.phone);
    if (!unit || !PIPELINE_UNITS.includes(unit) || !phoneKey) continue;

    const units = conversationUnitsByPhone.get(phoneKey) || new Set<string>();
    units.add(unit);
    conversationUnitsByPhone.set(phoneKey, units);
  }

  const conversationUnitByPhone = new Map<string, string>();
  for (const [phoneKey, units] of conversationUnitsByPhone.entries()) {
    if (units.size === 1) {
      conversationUnitByPhone.set(phoneKey, [...units][0]);
    }
  }

  const clientById = new Map(clients.map((client) => [client.id, client]));
  const pipelineUnitById = new Map(pipelines.map((pipeline) => [pipeline.id, pipeline.unit]));
  const targetUnits = [
    ...new Set(
      deals
        .map((deal) => {
          const client = clientById.get(deal.clientId);
          const phoneKey = phoneLookupKey(client?.phone || deal.clientName);
          const whatsappUnit = phoneKey ? conversationUnitByPhone.get(phoneKey) : null;
          return whatsappUnit || client?.unit || deal.unit;
        })
        .filter((unit) => !!unit && PIPELINE_UNITS.includes(unit))
        .filter(Boolean),
    ),
  ] as string[];

  const unitPipelines = await prisma.pipeline.findMany({
    where: { unit: { in: targetUnits } },
    include: { stages: { orderBy: { position: 'asc' } } },
    orderBy: { createdAt: 'asc' },
  });

  const pipelineByUnit = new Map<string, (typeof unitPipelines)[number]>();
  for (const pipeline of unitPipelines) {
    if (!pipelineByUnit.has(pipeline.unit)) pipelineByUnit.set(pipeline.unit, pipeline);
  }

  const repairDealPlacement = async (deal: (typeof deals)[number], targetUnit: string) => {
    const client = clientById.get(deal.clientId);
    const currentPipelineUnit = deal.pipelineId ? pipelineUnitById.get(deal.pipelineId) : null;
    const shouldUpdateClientUnit = !!client && client.unit !== targetUnit;
    if (!shouldUpdateClientUnit && deal.unit === targetUnit && currentPipelineUnit === targetUnit) return;

    const targetPipeline = pipelineByUnit.get(targetUnit);
    if (!targetPipeline) {
      if (shouldUpdateClientUnit) {
        await prisma.client.update({
          where: { id: client.id },
          data: { unit: targetUnit },
        });
        result.updatedClients += 1;
      }
      return;
    }

    const targetStage =
      targetPipeline.stages.find((stage) => pipelineStageKeyFromName(stage.name) === (deal.stage || 'novo_lead')) ||
      targetPipeline.stages[0] ||
      null;

    await prisma.$transaction([
      ...(shouldUpdateClientUnit
        ? [
            prisma.client.update({
              where: { id: client.id },
              data: { unit: targetUnit },
            }),
          ]
        : []),
      prisma.salesPipeline.update({
        where: { id: deal.id },
        data: {
          unit: targetUnit,
          pipelineId: targetPipeline.id,
          stageId: targetStage?.id || null,
          stage: targetStage ? pipelineStageKeyFromName(targetStage.name) : (deal.stage || 'novo_lead'),
        },
      }),
    ]);
    if (shouldUpdateClientUnit) result.updatedClients += 1;
    result.updatedDeals += 1;
  };

  const getDealPhoneKey = (deal: (typeof deals)[number]) => {
    const client = clientById.get(deal.clientId);
    return phoneLookupKey(client?.phone || deal.clientName);
  };

  const dealsByPhone = new Map<string, typeof deals>();
  for (const deal of deals) {
    const phoneKey = getDealPhoneKey(deal);
    if (!phoneKey) continue;
    const grouped = dealsByPhone.get(phoneKey) || [];
    grouped.push(deal);
    dealsByPhone.set(phoneKey, grouped);
  }

  const processedDealIds = new Set<string>();
  for (const [phoneKey, groupedDeals] of dealsByPhone.entries()) {
    const distinctUnits = new Set(groupedDeals.map((deal) => deal.unit).filter(Boolean));
    if (groupedDeals.length < 2 || distinctUnits.size < 2) continue;

    const clientUnits = new Set(
      groupedDeals
        .map((deal) => clientById.get(deal.clientId)?.unit)
        .filter((unit): unit is string => !!unit && PIPELINE_UNITS.includes(unit)),
    );
    const whatsappUnit = conversationUnitByPhone.get(phoneKey);
    const targetUnit = whatsappUnit || (clientUnits.size === 1 ? [...clientUnits][0] : null);
    if (!targetUnit || !PIPELINE_UNITS.includes(targetUnit)) continue;

    const orderedDeals = [...groupedDeals].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    const keepDeal =
      orderedDeals.find((deal) => deal.unit === targetUnit && (!deal.pipelineId || pipelineUnitById.get(deal.pipelineId) === targetUnit)) ||
      orderedDeals.find((deal) => deal.unit === targetUnit) ||
      orderedDeals[0];

    await repairDealPlacement(keepDeal, targetUnit);
    processedDealIds.add(keepDeal.id);

    for (const duplicate of orderedDeals) {
      if (duplicate.id === keepDeal.id) continue;

      const duplicatePipelineUnit = duplicate.pipelineId ? pipelineUnitById.get(duplicate.pipelineId) : null;
      const isOutsideTargetUnit = duplicate.unit !== targetUnit || duplicatePipelineUnit !== targetUnit;
      if (!isOutsideTargetUnit) continue;

      await prisma.salesPipeline.delete({ where: { id: duplicate.id } });
      result.deletedDuplicates += 1;
      processedDealIds.add(duplicate.id);
    }
  }

  for (const deal of deals) {
    if (processedDealIds.has(deal.id)) continue;

    const client = clientById.get(deal.clientId);
    const phoneKey = getDealPhoneKey(deal);
    const whatsappUnit = phoneKey ? conversationUnitByPhone.get(phoneKey) : null;
    const targetUnit = whatsappUnit || client?.unit || deal.unit;
    if (!targetUnit || !PIPELINE_UNITS.includes(targetUnit)) continue;

    await repairDealPlacement(deal, targetUnit);
  }

  return result;
}

export async function syncServiceDealsFromClientStage(params: {
  pipelineId?: string | null;
  unit?: string;
}): Promise<PipelineServiceStageSyncResult> {
  const { pipelineId, unit } = params;
  if (!pipelineId || !unit) {
    return { skipped: true, checkedDeals: 0, updatedDeals: 0, reason: 'missing_scope' };
  }

  const stages = await prisma.pipelineStage.findMany({
    where: { pipelineId },
    orderBy: { position: 'asc' },
    take: 2,
  });
  const firstStage = stages[0];
  const serviceStage = stages[1];
  if (!firstStage || !serviceStage) {
    return { skipped: true, checkedDeals: 0, updatedDeals: 0, reason: 'missing_stages' };
  }

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
  if (!candidateDeals.length) {
    return { skipped: false, checkedDeals: 0, updatedDeals: 0 };
  }

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
  if (!dealIds.length) {
    return { skipped: false, checkedDeals: candidateDeals.length, updatedDeals: 0 };
  }

  const updateResult = await prisma.salesPipeline.updateMany({
    where: { id: { in: dealIds } },
    data: {
      stageId: serviceStage.id,
      stage: pipelineStageKeyFromName(serviceStage.name),
    },
  });

  return {
    skipped: false,
    checkedDeals: candidateDeals.length,
    updatedDeals: updateResult.count,
  };
}
