import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requireUnitGuard, UnitAccessDeniedError, unitAccessDeniedResponse } from '@/lib/unit-guard';
import { parseDateTimeRange } from '@/lib/date-filter';
import { phoneLookupKey } from '@/lib/phone';
import {
  findEvaluationScheduleConflict,
  getPipelineEvaluationAppointments,
  upsertPipelineEvaluationAppointment,
} from '@/lib/evaluation-scheduling';
import {
  canAccessPipelineDeal,
  filterDealsByPipelineOwnerScope,
  isDealVisibleViaPipelineHandoff,
  resolvePipelineOwnerScope,
} from '@/lib/pipeline-owner-scope';
import {
  isDiscardPipelineStage as isDiscardStage,
  isScheduledPipelineStage as isScheduledStage,
  pipelineStageKeyFromName as stageKeyFromName,
  pipelineToClientStage,
} from '@/lib/pipeline/stages';
import {
  getPipelineProcedureSelections,
  recordPipelineProcedureAudit,
} from '@/lib/pipeline/procedure-audit';
import { formatProcedureNames, normalizeProcedureNames } from '@/lib/pipeline/procedure-names';
import {
  getPipelineSaleItems,
  normalizeSubmittedSaleItems,
  replacePipelineSaleItems,
  SaleItemValidationError,
} from '@/lib/pipeline/sale-items';
import { canonicalPipelineSource } from '@/lib/lead-source';
import {
  classifySaleItemsForCampaign,
  resolveCampaignOfferForClient,
} from '@/lib/campaign-offer';

type EvaluationScheduleConflict = NonNullable<Awaited<ReturnType<typeof findEvaluationScheduleConflict>>>;

function scheduleConflictResponse(conflict: EvaluationScheduleConflict) {
  return NextResponse.json({
    scheduleConflict: true,
    message: 'Já existe uma avaliação agendada neste horário e nesta unidade.',
    conflict: {
      clientName: conflict.clientName,
      startTime: conflict.startTime,
      endTime: conflict.endTime,
      unit: conflict.unit,
      professionalName: conflict.profissional.name,
    },
  }, { status: 409 });
}

async function getPipelineForUnit(unit: string) {
  return prisma.pipeline.findFirst({
    where: { unit },
    include: { stages: { orderBy: { position: 'asc' } } },
    orderBy: { createdAt: 'asc' },
  });
}

async function resolvePipelinePlacement(params: {
  unit: string;
  pipelineId?: string | null;
  stageId?: string | null;
  stage?: string | null;
}) {
  const { unit, pipelineId, stageId, stage } = params;
  const requestedPipeline = pipelineId
    ? await prisma.pipeline.findUnique({
        where: { id: pipelineId },
        include: { stages: { orderBy: { position: 'asc' } } },
      })
    : null;
  let targetPipeline = requestedPipeline;

  if (!targetPipeline || targetPipeline.unit !== unit) {
    const unitPipeline = await getPipelineForUnit(unit);
    // A instalação atual usa um único funil legado (unidade Barueri) para
    // exibir negócios de todas as unidades. Sem um funil próprio da unidade,
    // preservamos o funil solicitado pela tela e isolamos o negócio por `unit`.
    targetPipeline = unitPipeline || requestedPipeline;
  }

  if (!targetPipeline) {
    return { pipelineId: null, stageId: stageId || null, stage: stage || 'novo_lead' };
  }

  const requestedStage = stageId
    ? targetPipeline.stages.find((pipelineStage) => pipelineStage.id === stageId)
    : null;
  const stageKey = stage ? stageKeyFromName(stage) : null;
  const matchingStage = stageKey
    ? targetPipeline.stages.find((pipelineStage) => stageKeyFromName(pipelineStage.name) === stageKey)
    : null;
  const targetStage = requestedStage || matchingStage || targetPipeline.stages[0] || null;

  return {
    pipelineId: targetPipeline.id,
    stageId: targetStage?.id || null,
    stage: targetStage ? stageKeyFromName(targetStage.name) : (stage || 'novo_lead'),
  };
}

async function filterDealsByPhone<T extends { clientId: string; clientName: string }>(deals: T[], phone?: string | null) {
  const phoneKey = phoneLookupKey(phone);
  if (!deals.length) return deals;
  if (!phoneKey) return [];

  const clientIds = [...new Set(deals.map((deal) => deal.clientId).filter(Boolean))];
  const clients = clientIds.length
    ? await prisma.client.findMany({
        where: { id: { in: clientIds } },
        select: { id: true, phone: true },
      })
    : [];
  const clientPhoneById = new Map(clients.map((client) => [client.id, client.phone]));

  return deals.filter((deal) => {
    const clientPhoneKey = phoneLookupKey(clientPhoneById.get(deal.clientId));
    const dealNamePhoneKey = phoneLookupKey(deal.clientName);
    return clientPhoneKey === phoneKey || dealNamePhoneKey === phoneKey;
  });
}

async function enrichDealsWithClientData<T extends { clientId: string }>(deals: T[]) {
  if (!deals.length) return deals;

  const clientIds = [...new Set(deals.map((deal) => deal.clientId).filter(Boolean))];
  const clients = clientIds.length
    ? await prisma.client.findMany({
        where: { id: { in: clientIds } },
        select: { id: true, phone: true, unit: true, originUnit: true },
      })
    : [];
  const clientById = new Map(clients.map((client) => [client.id, client]));

  return deals.map((deal) => {
    const client = clientById.get(deal.clientId);
    return {
      ...deal,
      clientPhone: client?.phone || null,
      clientUnit: client?.unit || null,
      clientOriginUnit: client?.originUnit || null,
    };
  });
}

async function enrichDealsWithEvaluationData<T extends { id: string }>(deals: T[]) {
  if (!deals.length) return deals;

  const appointmentsByDealId = await getPipelineEvaluationAppointments(deals.map((deal) => deal.id));
  return deals.map((deal) => {
    const appointment = appointmentsByDealId.get(deal.id);
    const assignedUserId = appointment?.notes?.match(/\[assignedUserId:([^\]]+)\]/)?.[1] || null;
    return {
      ...deal,
      evaluationAppointmentId: appointment?.id || null,
      evaluationStartTime: appointment?.startTime?.toISOString() || null,
      evaluationEndTime: appointment?.endTime?.toISOString() || null,
      evaluationStatus: appointment?.status || null,
      evaluationProfessionalId: appointment?.profissionalId || null,
      evaluationProfessionalName: appointment?.profissional?.name || null,
      evaluationAssigneeUserId: assignedUserId,
    };
  });
}

async function projectServiceDealsFromClientStage<T extends {
  clientId: string;
  pipelineId: string | null;
  stage: string | null;
  stageId: string | null;
  unit: string;
}>(deals: T[], params: { pipelineId?: string | null; unit?: string }) {
  const { pipelineId, unit } = params;
  if (!pipelineId || !unit || !deals.length) return deals;

  const stages = await prisma.pipelineStage.findMany({
    where: { pipelineId },
    orderBy: { position: 'asc' },
    take: 2,
  });
  const firstStage = stages[0];
  const serviceStage = stages[1];
  if (!firstStage || !serviceStage) return deals;

  const candidateDeals = deals.filter((deal) => {
    if (!deal.clientId || deal.pipelineId !== pipelineId || deal.unit !== unit) return false;
    return deal.stageId === firstStage.id || ['novo_lead', 'entrada'].includes(deal.stage || '');
  });
  if (!candidateDeals.length) return deals;

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
  if (!serviceClientIds.size) return deals;

  const serviceStageKey = stageKeyFromName(serviceStage.name);
  return deals.map((deal) => {
    if (!serviceClientIds.has(deal.clientId)) return deal;
    if (deal.pipelineId !== pipelineId || deal.unit !== unit) return deal;
    if (deal.stageId !== firstStage.id && !['novo_lead', 'entrada'].includes(deal.stage || '')) return deal;
    return {
      ...deal,
      stageId: serviceStage.id,
      stage: serviceStageKey,
    };
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
  const phone = searchParams.get('phone');
  const ownerScope = await resolvePipelineOwnerScope(req, guard);

  const where: Prisma.SalesPipelineWhereInput = {};
  if (pipelineId) {
    const pipelineStages = await prisma.pipelineStage.findMany({
      where: { pipelineId },
      select: { id: true },
    });
    const pipelineStageIds = pipelineStages.map((stage) => stage.id);
    where.OR = [
      { pipelineId },
      ...(pipelineStageIds.length
        ? [{ pipelineId: null, stageId: { in: pipelineStageIds } }]
        : []),
    ];
  }
  if (stageId) where.stageId = { in: stageId.split(',').map((v) => v.trim()).filter(Boolean) };
  // Fallback for old stage string if needed
  if (searchParams.get('stage')) where.stage = { in: searchParams.get('stage')!.split(',').map((v) => v.trim()).filter(Boolean) };
  if (dateRange) where.createdAt = dateRange;

  // UNIT GUARD: Filter by JWT unit  
  if (guard.unitFilter) where.unit = guard.unitFilter;
  if (assignedTo) where.assignedTo = assignedTo;

  const entries = await prisma.salesPipeline.findMany({
    where,
    orderBy: order === 'oldest' ? { createdAt: 'asc' } : { createdAt: 'desc' },
    ...(phone ? { take: 2000 } : {}),
  });

  const projectedEntries = await projectServiceDealsFromClientStage(entries, { pipelineId, unit: guard.unitFilter });
  const ownerScopedEntries = await filterDealsByPipelineOwnerScope(projectedEntries, ownerScope);
  const filteredEntries = phone ? await filterDealsByPhone(ownerScopedEntries, phone) : ownerScopedEntries;
  const dealIds = filteredEntries.map((entry) => entry.id);
  const [procedureSelections, saleItemsByDealId] = await Promise.all([
    getPipelineProcedureSelections(prisma, dealIds),
    getPipelineSaleItems(prisma, dealIds),
  ]);
  const entriesWithProcedure = filteredEntries.map((entry) => {
    const saleItems = saleItemsByDealId.get(entry.id) || [];
    const procedureNames = saleItems.length > 0
      ? saleItems.map((item) => item.procedureName)
      : procedureSelections.get(entry.id) || [];
    return {
      ...entry,
      saleItems,
      procedureNames,
      procedureName: formatProcedureNames(procedureNames) || null,
    };
  });
  const withClientData = await enrichDealsWithClientData(entriesWithProcedure);
  const enrichedEntries = await enrichDealsWithEvaluationData(withClientData);
  return NextResponse.json(enrichedEntries);
}

// POST — Create pipeline entry manually
export async function POST(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  try {
    const body = await req.json();
    const {
      clientId,
      clientName,
      stage,
      stageId,
      pipelineId,
      value,
      procedureName,
      procedureNames: submittedProcedureNames,
      saleItems: submittedSaleItems,
      source,
      assignedTo,
      assignedName,
      notes,
      leadId,
      unit,
      contactPhone,
      socialSource,
      evaluationStartTime,
      evaluationAssigneeUserId,
      evaluationDurationMinutes,
      closedAt,
      forceDuplicateName,
      forceScheduleConflict,
    } = body;

    const resolvedClientName = typeof clientName === 'string' ? clientName.trim() : '';
    if (!resolvedClientName) {
      return NextResponse.json({ error: 'Informe o nome do negócio' }, { status: 400 });
    }

    const ownerScope = await resolvePipelineOwnerScope(req, guard);
    const ownerAssignedTo = guard.isAdmin ? (assignedTo ?? ownerScope?.ownerUserId ?? null) : guard.userId;
    const ownerAssignedName = guard.isAdmin ? assignedName : guard.userName;
    const targetUnit = guard.createUnit(unit);
    const leadSource = canonicalPipelineSource(source || socialSource);
    const placement = await resolvePipelinePlacement({
      unit: targetUnit,
      pipelineId,
      stageId,
      stage: stage || 'novo_lead',
    });
    const effectiveStage = placement.stage;
    const hasSaleItemSubmission = submittedSaleItems !== undefined;
    let normalizedSale = hasSaleItemSubmission
      ? await normalizeSubmittedSaleItems({ database: prisma, unit: targetUnit, submittedItems: submittedSaleItems })
      : null;
    const hasProcedureSubmission = hasSaleItemSubmission || submittedProcedureNames !== undefined || procedureName !== undefined;
    const normalizedProcedureNames = normalizedSale?.procedureNames
      || normalizeProcedureNames(submittedProcedureNames ?? procedureName);
    const normalizedProcedureName = formatProcedureNames(normalizedProcedureNames);
    const hasValue = value !== undefined && value !== null && value !== '';
    const normalizedValue = normalizedSale ? normalizedSale.totalValue : hasValue ? Number(value) : 0;
    const normalizedClosedAt = effectiveStage === 'fechado'
      ? (closedAt ? new Date(closedAt) : new Date())
      : null;
    if (normalizedClosedAt && Number.isNaN(normalizedClosedAt.getTime())) {
      return NextResponse.json({ error: 'Informe uma data de fechamento válida' }, { status: 400 });
    }
    if (effectiveStage === 'fechado') {
      if (!normalizedProcedureName) {
        return NextResponse.json({ error: 'Informe o procedimento fechado' }, { status: 400 });
      }
      if (!Number.isFinite(normalizedValue) || normalizedValue <= 0) {
        return NextResponse.json({ error: 'Informe um valor fechado válido' }, { status: 400 });
      }
    }
    if (isScheduledStage(effectiveStage) && !evaluationStartTime) {
      return NextResponse.json({ error: 'Informe a data e o horário da avaliação' }, { status: 400 });
    }
    if (isScheduledStage(effectiveStage) && evaluationStartTime && !forceScheduleConflict) {
      const conflict = await findEvaluationScheduleConflict({
        unit: targetUnit,
        startTime: evaluationStartTime,
        durationMinutes: evaluationDurationMinutes,
      });
      if (conflict) {
        return scheduleConflictResponse(conflict);
      }
    }

    const hasFullName = resolvedClientName.split(/\s+/).length >= 2;
    if (!clientId && !forceDuplicateName && hasFullName) {
      const duplicateNameCandidates = await prisma.client.findMany({
        where: {
          unit: targetUnit,
          isActive: true,
          name: { equals: resolvedClientName, mode: 'insensitive' },
        },
        select: { id: true, name: true, phone: true, unit: true },
        orderBy: { updatedAt: 'desc' },
        take: 5,
      });

      if (duplicateNameCandidates.length > 0) {
        return NextResponse.json({
          duplicateName: true,
          message: 'Já existe um registro com este nome completo nesta unidade.',
          candidates: duplicateNameCandidates,
        }, { status: 409 });
      }
    }

    const normalizedPhoneKey = phoneLookupKey(contactPhone || resolvedClientName);
    let resolvedClientId = typeof clientId === 'string' && clientId.trim() ? clientId.trim() : '';

    if (!resolvedClientId) {
      const candidateClients = normalizedPhoneKey
        ? await prisma.client.findMany({
            where: {
              unit: targetUnit,
              isActive: true,
              phone: { contains: normalizedPhoneKey.slice(-8) },
            },
            orderBy: { updatedAt: 'desc' },
            take: 10,
          })
        : [];
      const existingClient = candidateClients.find((client) => phoneLookupKey(client.phone) === normalizedPhoneKey) || null;
      const clientStage = pipelineToClientStage[effectiveStage] || 'entrada';

      if (existingClient) {
        resolvedClientId = existingClient.id;
      } else {
        const createdClient = await prisma.client.create({
          data: {
            name: resolvedClientName,
            phone: contactPhone || null,
            unit: targetUnit,
            originUnit: targetUnit,
            stage: clientStage,
            source: leadSource,
            notes: notes || null,
            arrivedAt: new Date(),
            userId: ownerAssignedTo || guard.userId,
          },
        });
        resolvedClientId = createdClient.id;
      }
    }

    const campaignOffer = normalizedSale
      ? await resolveCampaignOfferForClient({
          database: prisma,
          clientId: resolvedClientId,
          unit: targetUnit,
          source: leadSource,
        })
      : null;
    if (normalizedSale) {
      normalizedSale = {
        ...normalizedSale,
        items: classifySaleItemsForCampaign(normalizedSale.items, campaignOffer),
      };
    }

    const duplicateCandidates = await prisma.salesPipeline.findMany({
      where: {
        unit: targetUnit,
        ...(placement.pipelineId ? { pipelineId: placement.pipelineId } : {}),
        OR: [
          { clientId: resolvedClientId },
          ...(contactPhone ? [] : [{ clientName: resolvedClientName }]),
        ],
        closedAt: null,
        lostReason: null,
      },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    });
    const phoneCandidates = contactPhone
      ? await filterDealsByPhone(
          await prisma.salesPipeline.findMany({
            where: {
              unit: targetUnit,
              ...(placement.pipelineId ? { pipelineId: placement.pipelineId } : {}),
              closedAt: null,
              lostReason: null,
            },
            orderBy: { updatedAt: 'desc' },
            take: 2000,
          }),
          contactPhone
        )
      : [];
    const ownerPhoneCandidates = await filterDealsByPipelineOwnerScope(phoneCandidates, ownerScope);
    const ownerDuplicateCandidates = await filterDealsByPipelineOwnerScope(duplicateCandidates, ownerScope);
    const existingEntry = ownerPhoneCandidates[0] || ownerDuplicateCandidates[0] || null;

    if (existingEntry) {
      const existingProcedureSelections = !hasProcedureSubmission
        ? await getPipelineProcedureSelections(prisma, [existingEntry.id])
        : new Map<string, string[]>();
      const effectiveProcedureNames = hasProcedureSubmission
        ? normalizedProcedureNames
        : existingProcedureSelections.get(existingEntry.id) || [];
      const effectiveProcedureName = formatProcedureNames(effectiveProcedureNames);
      const updated = await prisma.$transaction(async (tx) => {
        const saved = await tx.salesPipeline.update({
          where: { id: existingEntry.id },
          data: {
            clientName: existingEntry.clientName || resolvedClientName,
            stage: effectiveStage,
            stageId: placement.stageId,
            pipelineId: placement.pipelineId,
            value: normalizedSale || hasValue ? normalizedValue : existingEntry.value,
            source: leadSource ?? existingEntry.source,
            assignedTo: ownerAssignedTo ?? existingEntry.assignedTo,
            assignedName: ownerAssignedName ?? existingEntry.assignedName,
            unit: targetUnit,
            notes: notes ?? existingEntry.notes,
            leadId: leadId ?? existingEntry.leadId,
            ...(normalizedClosedAt ? { closedAt: normalizedClosedAt } : {}),
            ...(normalizedSale ? {
              campaignIdSnapshot: campaignOffer?.campaignId || null,
              campaignNameSnapshot: campaignOffer?.campaignName || null,
              campaignAttributionSnapshot: campaignOffer?.attribution || null,
            } : {}),
          },
        });
        if (normalizedSale) await replacePipelineSaleItems(tx, saved.id, normalizedSale.items);
        return saved;
      });

      if (evaluationStartTime) {
        await upsertPipelineEvaluationAppointment({
          deal: {
            id: updated.id,
            clientName: updated.clientName,
            unit: updated.unit,
            notes: updated.notes,
          },
          clientPhone: contactPhone || resolvedClientName,
          startTime: evaluationStartTime,
          assigneeUserId: evaluationAssigneeUserId,
          durationMinutes: evaluationDurationMinutes,
        });
      }

      const clientStage = pipelineToClientStage[effectiveStage];
      if (clientStage) {
        await prisma.client.update({
          where: { id: updated.clientId },
          data: { stage: clientStage, unit: targetUnit },
        }).catch(() => { /* client may not exist */ });
      }

      if (hasProcedureSubmission && normalizedProcedureNames.length > 0) {
        await recordPipelineProcedureAudit(prisma, {
          dealId: updated.id,
          procedureNames: normalizedProcedureNames,
          userName: guard.userName || ownerAssignedName || 'Sistema',
          unit: updated.unit,
          saleValue: normalizedSale || hasValue ? normalizedValue : Number(updated.value || 0),
          stage: effectiveStage,
          clientName: updated.clientName,
          source: 'pipeline-post',
        });
      }

      return NextResponse.json({
        ...updated,
        procedureNames: effectiveProcedureNames,
        procedureName: effectiveProcedureName || null,
      });
    }

    const entry = await prisma.$transaction(async (tx) => {
      const saved = await tx.salesPipeline.create({
        data: {
          clientId: resolvedClientId,
          clientName: resolvedClientName,
          stage: effectiveStage,
          stageId: placement.stageId, pipelineId: placement.pipelineId,
          value: normalizedValue,
          source: leadSource,
          assignedTo: ownerAssignedTo,
          assignedName: ownerAssignedName,
          unit: targetUnit,
          notes, leadId,
          closedAt: normalizedClosedAt,
          campaignIdSnapshot: campaignOffer?.campaignId || null,
          campaignNameSnapshot: campaignOffer?.campaignName || null,
          campaignAttributionSnapshot: campaignOffer?.attribution || null,
        },
      });
      if (normalizedSale) await replacePipelineSaleItems(tx, saved.id, normalizedSale.items);
      return saved;
    });

    if (evaluationStartTime) {
      await upsertPipelineEvaluationAppointment({
        deal: {
          id: entry.id,
          clientName: entry.clientName,
          unit: entry.unit,
          notes: entry.notes,
        },
        clientPhone: contactPhone || resolvedClientName,
        startTime: evaluationStartTime,
        assigneeUserId: evaluationAssigneeUserId,
        durationMinutes: evaluationDurationMinutes,
      });
    }

    const clientStage = pipelineToClientStage[effectiveStage];
    if (clientStage) {
      await prisma.client.update({
        where: { id: resolvedClientId },
        data: { stage: clientStage },
      }).catch(() => { /* client may not exist */ });
    }

    if (normalizedProcedureName) {
      await recordPipelineProcedureAudit(prisma, {
        dealId: entry.id,
        procedureNames: normalizedProcedureNames,
        userName: guard.userName || ownerAssignedName || 'Sistema',
        unit: entry.unit,
        saleValue: normalizedValue,
        stage: effectiveStage,
        clientName: entry.clientName,
        source: 'pipeline-post',
      });
    }

    return NextResponse.json({
      ...entry,
      procedureNames: normalizedProcedureNames,
      procedureName: normalizedProcedureName || null,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof SaleItemValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
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
    const {
      id,
      stage,
      stageId,
      pipelineId,
      assignedTo,
      assignedName,
      value,
      procedureName,
      procedureNames: submittedProcedureNames,
      saleItems: submittedSaleItems,
      notes,
      lostReason,
      closedAt,
      evaluationStartTime,
      evaluationAssigneeUserId,
      evaluationDurationMinutes,
      forceScheduleConflict,
    } = body;
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

    // UNIT GUARD: Validate record belongs to user's unit
    const existing = await prisma.salesPipeline.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
    try { guard.enforceUnit(existing.unit); } catch (e) {
      if (e instanceof UnitAccessDeniedError) return unitAccessDeniedResponse();
      throw e;
    }
    const ownerScope = await resolvePipelineOwnerScope(req, guard);
    const existingClient = existing.clientId
      ? await prisma.client.findUnique({
          where: { id: existing.clientId },
          select: { phone: true },
        })
      : null;
    const existingPhoneKey = phoneLookupKey(existingClient?.phone || existing.clientName);
    const visibleViaHandoff = isDealVisibleViaPipelineHandoff(existing, ownerScope, existingPhoneKey);
    if (!(await canAccessPipelineDeal(existing, ownerScope))) {
      return unitAccessDeniedResponse();
    }

    // Mantém a string `stage` em sincronia com o `stageId`: quando a UI move o
    // lead enviando só o stageId (ex.: seletor do chat), derivamos a etapa pelo
    // nome do PipelineStage. Sem isso, a string `stage` ficava congelada e
    // contagens (deals abertos), Client.stage, closedAt e log saíam errados.
    let effectiveStage: string | undefined = stage;
    let inferredPipelineId: string | null | undefined;
    if (stageId) {
      const ps = await prisma.pipelineStage.findUnique({
        where: { id: stageId },
        select: { name: true, pipelineId: true },
      });
      if (ps?.name && effectiveStage === undefined) effectiveStage = stageKeyFromName(ps.name);
      inferredPipelineId = ps?.pipelineId;
    }
    const isDiscard = isDiscardStage(effectiveStage);
    const isClosing = effectiveStage === 'fechado' || isDiscard;
    const isMovingToScheduled =
      isScheduledStage(effectiveStage) &&
      (existing.stage !== effectiveStage || (stageId !== undefined && existing.stageId !== stageId));
    if (isMovingToScheduled && !evaluationStartTime) {
      return NextResponse.json({ error: 'Informe a data e o horário da avaliação' }, { status: 400 });
    }
    if (evaluationStartTime && !forceScheduleConflict) {
      const conflict = await findEvaluationScheduleConflict({
        unit: existing.unit,
        startTime: evaluationStartTime,
        durationMinutes: evaluationDurationMinutes,
        excludePipelineDealId: existing.id,
      });
      if (conflict) {
        return scheduleConflictResponse(conflict);
      }
    }

    const hasSaleItemSubmission = submittedSaleItems !== undefined;
    let normalizedSale = hasSaleItemSubmission
      ? await normalizeSubmittedSaleItems({ database: prisma, unit: existing.unit, submittedItems: submittedSaleItems })
      : null;
    const campaignOffer = normalizedSale
      ? await resolveCampaignOfferForClient({
          database: prisma,
          clientId: existing.clientId,
          unit: existing.unit,
          source: existing.source,
        })
      : null;
    if (normalizedSale) {
      normalizedSale = {
        ...normalizedSale,
        items: classifySaleItemsForCampaign(normalizedSale.items, campaignOffer),
      };
    }
    const hasProcedureSubmission = hasSaleItemSubmission || submittedProcedureNames !== undefined || procedureName !== undefined;
    const normalizedProcedureNames = normalizedSale?.procedureNames
      || normalizeProcedureNames(submittedProcedureNames ?? procedureName);
    const targetStage = effectiveStage ?? existing.stage;
    const existingProcedureSelections = !hasProcedureSubmission
      ? await getPipelineProcedureSelections(prisma, [existing.id])
      : new Map<string, string[]>();
    const nextProcedureNames = hasProcedureSubmission
      ? normalizedProcedureNames
      : existingProcedureSelections.get(existing.id) || [];
    const nextProcedureName = formatProcedureNames(nextProcedureNames);
    const nextValue = normalizedSale
      ? normalizedSale.totalValue
      : value !== undefined ? Number(value) : Number(existing.value || 0);
    const isClosingAction =
      targetStage === 'fechado' &&
      (effectiveStage === 'fechado' || value !== undefined || hasProcedureSubmission);
    if (isClosingAction && !nextProcedureName) {
      return NextResponse.json({ error: 'Informe o procedimento fechado' }, { status: 400 });
    }
    if (isClosingAction && (!Number.isFinite(nextValue) || nextValue <= 0)) {
      return NextResponse.json({ error: 'Informe um valor fechado válido' }, { status: 400 });
    }

    let scheduledClosingDate: Date | null = null;
    if (isClosing && targetStage === 'fechado' && !closedAt) {
      const appointmentsByDealId = await getPipelineEvaluationAppointments([existing.id]);
      scheduledClosingDate = appointmentsByDealId.get(existing.id)?.startTime || null;
    }

    const data: Record<string, unknown> = {};
    if (effectiveStage !== undefined) {
      data.stage = effectiveStage;
      if (isClosing) data.closedAt = closedAt ? new Date(closedAt) : scheduledClosingDate || new Date();
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
    if (pipelineId !== undefined && pipelineId !== null) data.pipelineId = pipelineId;
    else if (inferredPipelineId) data.pipelineId = inferredPipelineId;
    else if (pipelineId === null) data.pipelineId = null;
    if (guard.isAdmin && assignedTo !== undefined) data.assignedTo = assignedTo;
    if (guard.isAdmin && assignedName !== undefined) data.assignedName = assignedName;
    if (!guard.isAdmin && visibleViaHandoff && effectiveStage && effectiveStage !== existing.stage) {
      data.assignedTo = ownerScope?.ownerUserId || guard.userId;
      data.assignedName = guard.userName;
    }
    if (value !== undefined || normalizedSale) data.value = nextValue;
    if (notes !== undefined) data.notes = notes;
    if (closedAt !== undefined && !isClosing) data.closedAt = closedAt ? new Date(closedAt) : null;
    if (lostReason !== undefined) data.lostReason = lostReason;
    if (normalizedSale) {
      data.campaignIdSnapshot = campaignOffer?.campaignId || null;
      data.campaignNameSnapshot = campaignOffer?.campaignName || null;
      data.campaignAttributionSnapshot = campaignOffer?.attribution || null;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const saved = await tx.salesPipeline.update({ where: { id }, data });
      if (normalizedSale) await replacePipelineSaleItems(tx, saved.id, normalizedSale.items);
      return saved;
    });

    if (evaluationStartTime) {
      await upsertPipelineEvaluationAppointment({
        deal: {
          id: updated.id,
          clientName: updated.clientName,
          unit: updated.unit,
          notes: updated.notes,
        },
        clientPhone: existingClient?.phone || existing.clientName,
        startTime: evaluationStartTime,
        assigneeUserId: evaluationAssigneeUserId,
        durationMinutes: evaluationDurationMinutes,
      });
    }

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

    if (hasProcedureSubmission && normalizedProcedureNames.length > 0) {
      await recordPipelineProcedureAudit(prisma, {
        dealId: updated.id,
        procedureNames: normalizedProcedureNames,
        userName: guard.userName || assignedName || 'Sistema',
        unit: updated.unit,
        saleValue: nextValue,
        stage: targetStage,
        clientName: updated.clientName,
        source: 'pipeline-put',
      });
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

    return NextResponse.json({
      ...updated,
      procedureNames: nextProcedureNames,
      procedureName: nextProcedureName || null,
    });
  } catch (error) {
    if (error instanceof SaleItemValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
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
  const ownerScope = await resolvePipelineOwnerScope(req, guard);
  if (!(await canAccessPipelineDeal(existing, ownerScope))) {
    return unitAccessDeniedResponse();
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
