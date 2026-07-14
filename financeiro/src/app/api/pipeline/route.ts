import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requireUnitGuard, UnitAccessDeniedError, unitAccessDeniedResponse } from '@/lib/unit-guard';
import { parseDateTimeRange } from '@/lib/date-filter';
import { phoneLookupKey } from '@/lib/phone';
import {
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
  let targetPipeline = pipelineId
    ? await prisma.pipeline.findUnique({
        where: { id: pipelineId },
        include: { stages: { orderBy: { position: 'asc' } } },
      })
    : null;

  if (!targetPipeline || targetPipeline.unit !== unit) {
    targetPipeline = await getPipelineForUnit(unit);
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
  const procedureSelections = await getPipelineProcedureSelections(
    prisma,
    filteredEntries.map((entry) => entry.id),
  );
  const entriesWithProcedure = filteredEntries.map((entry) => ({
    ...entry,
    procedureNames: procedureSelections.get(entry.id) || [],
    procedureName: formatProcedureNames(procedureSelections.get(entry.id)) || null,
  }));
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
    } = body;

    const resolvedClientName = typeof clientName === 'string' ? clientName.trim() : '';
    if (!resolvedClientName) {
      return NextResponse.json({ error: 'Informe o nome do negócio' }, { status: 400 });
    }

    const ownerScope = await resolvePipelineOwnerScope(req, guard);
    const ownerAssignedTo = guard.isAdmin ? (assignedTo ?? ownerScope?.ownerUserId ?? null) : guard.userId;
    const ownerAssignedName = guard.isAdmin ? assignedName : guard.userName;
    const targetUnit = guard.createUnit(unit);
    const leadSource = source || socialSource || 'manual';
    const placement = await resolvePipelinePlacement({
      unit: targetUnit,
      pipelineId,
      stageId,
      stage: stage || 'novo_lead',
    });
    const effectiveStage = placement.stage;
    const hasProcedureSubmission = submittedProcedureNames !== undefined || procedureName !== undefined;
    const normalizedProcedureNames = normalizeProcedureNames(submittedProcedureNames ?? procedureName);
    const normalizedProcedureName = formatProcedureNames(normalizedProcedureNames);
    const hasValue = value !== undefined && value !== null && value !== '';
    const normalizedValue = hasValue ? Number(value) : 0;
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
      const updated = await prisma.salesPipeline.update({
        where: { id: existingEntry.id },
        data: {
          clientName: existingEntry.clientName || resolvedClientName,
          stage: effectiveStage,
          stageId: placement.stageId,
          pipelineId: placement.pipelineId,
          value: hasValue ? normalizedValue : existingEntry.value,
          source: leadSource ?? existingEntry.source,
          assignedTo: ownerAssignedTo ?? existingEntry.assignedTo,
          assignedName: ownerAssignedName ?? existingEntry.assignedName,
          unit: targetUnit,
          notes: notes ?? existingEntry.notes,
          leadId: leadId ?? existingEntry.leadId,
        },
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
          saleValue: hasValue ? normalizedValue : Number(updated.value || 0),
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

    const entry = await prisma.salesPipeline.create({
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
      },
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
      notes,
      lostReason,
      closedAt,
      evaluationStartTime,
      evaluationAssigneeUserId,
      evaluationDurationMinutes,
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

    const hasProcedureSubmission = submittedProcedureNames !== undefined || procedureName !== undefined;
    const normalizedProcedureNames = normalizeProcedureNames(submittedProcedureNames ?? procedureName);
    const targetStage = effectiveStage ?? existing.stage;
    const existingProcedureSelections = !hasProcedureSubmission
      ? await getPipelineProcedureSelections(prisma, [existing.id])
      : new Map<string, string[]>();
    const nextProcedureNames = hasProcedureSubmission
      ? normalizedProcedureNames
      : existingProcedureSelections.get(existing.id) || [];
    const nextProcedureName = formatProcedureNames(nextProcedureNames);
    const nextValue = value !== undefined ? Number(value) : Number(existing.value || 0);
    const isClosingAction =
      targetStage === 'fechado' &&
      (effectiveStage === 'fechado' || value !== undefined || hasProcedureSubmission);
    if (isClosingAction && !nextProcedureName) {
      return NextResponse.json({ error: 'Informe o procedimento fechado' }, { status: 400 });
    }
    if (isClosingAction && (!Number.isFinite(nextValue) || nextValue <= 0)) {
      return NextResponse.json({ error: 'Informe um valor fechado válido' }, { status: 400 });
    }

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
    if (pipelineId !== undefined && pipelineId !== null) data.pipelineId = pipelineId;
    else if (inferredPipelineId) data.pipelineId = inferredPipelineId;
    else if (pipelineId === null) data.pipelineId = null;
    if (guard.isAdmin && assignedTo !== undefined) data.assignedTo = assignedTo;
    if (guard.isAdmin && assignedName !== undefined) data.assignedName = assignedName;
    if (!guard.isAdmin && visibleViaHandoff && effectiveStage && effectiveStage !== existing.stage) {
      data.assignedTo = ownerScope?.ownerUserId || guard.userId;
      data.assignedName = guard.userName;
    }
    if (value !== undefined) data.value = nextValue;
    if (notes !== undefined) data.notes = notes;
    if (closedAt !== undefined && !isClosing) data.closedAt = closedAt ? new Date(closedAt) : null;
    if (lostReason !== undefined) data.lostReason = lostReason;

    const updated = await prisma.salesPipeline.update({ where: { id }, data });

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
