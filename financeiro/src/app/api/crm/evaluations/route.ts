import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import {
  evaluationAssignedUserMarker,
  getEvaluationAssignedUserIdFromNotes,
  getPipelineDealIdFromEvaluationNotes,
  normalizeEvaluationText,
} from "@/lib/evaluation-scheduling";
import { isEvaluationStatus, type EvaluationStatus } from "@/lib/evaluation-status";
import { prisma } from "@/lib/db";
import { saoPauloDayRange } from "@/lib/date-filter";
import {
  getPipelineProcedureSelections,
  recordPipelineProcedureAudit,
} from "@/lib/pipeline/procedure-audit";
import { formatProcedureNames, normalizeProcedureNames } from "@/lib/pipeline/procedure-names";
import {
  getPipelineSaleItems,
  normalizeSubmittedSaleItems,
  replacePipelineSaleItems,
  SaleItemValidationError,
} from "@/lib/pipeline/sale-items";
import type { SaleItemDraft } from "@/lib/pipeline/sale-item-types";
import {
  classifySaleItemsForCampaign,
  resolveCampaignOfferForClient,
} from "@/lib/campaign-offer";
import { pipelineStageKeyFromName, pipelineToClientStage } from "@/lib/pipeline/stages";
import { requireUnitGuard, UnitAccessDeniedError, unitAccessDeniedResponse } from "@/lib/unit-guard";

function monthRange(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

function dateFromParam(value: string | null, fallback: Date) {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

function isOwnEvaluation(
  agendamento: { notes?: string | null; profissional?: { name: string } | null },
  user: { id: string; name: string },
) {
  if (agendamento.notes?.includes(evaluationAssignedUserMarker(user.id))) return true;

  const userName = normalizeEvaluationText(user.name);
  const professionalName = normalizeEvaluationText(agendamento.profissional?.name);
  if (!userName || !professionalName) return false;

  const userTokens = userName.split(/\s+/).filter((token) => token.length >= 3);
  return userTokens.some((token) => professionalName.includes(token));
}

function canManageAllEvaluations(guard: Exclude<ReturnType<typeof requireUnitGuard>, NextResponse>) {
  return (
    guard.isAdmin ||
    guard.permissions?.admin === true ||
    guard.permissions?.multiUnit === true ||
    guard.permissions?.crmEvaluationsAll === true
  );
}

type EvaluationAuditDetails = {
  requestedStatus?: string;
  reason?: string;
  saleValue?: number;
  procedureName?: string;
  procedureNames?: string[];
};

function parseEvaluationAuditDetails(details: string): EvaluationAuditDetails | null {
  try {
    const parsed = JSON.parse(details);
    return parsed && typeof parsed === "object" ? parsed as EvaluationAuditDetails : null;
  } catch {
    return null;
  }
}

async function enrichEvaluationsWithPipelineData<
  T extends { id: string; status: string; notes?: string | null },
>(evaluations: T[]) {
  const evaluationIds = evaluations.map((evaluation) => evaluation.id);
  const dealIds = [
    ...new Set(
      evaluations
        .map((evaluation) => getPipelineDealIdFromEvaluationNotes(evaluation.notes))
        .filter((dealId): dealId is string => Boolean(dealId)),
    ),
  ];

  const [deals, evaluationAuditLogs, procedureSelections, saleItemsByDealId] = await Promise.all([
    dealIds.length
      ? prisma.salesPipeline.findMany({
          where: { id: { in: dealIds } },
          select: {
            id: true,
            value: true,
            stage: true,
            closedAt: true,
            pipelineStage: { select: { name: true } },
          },
        })
      : [],
    evaluationIds.length
      ? prisma.auditLog.findMany({
          where: {
            action: "update",
            entity: "evaluation",
            entityId: { in: evaluationIds },
          },
          select: { entityId: true, details: true },
          orderBy: { createdAt: "desc" },
        })
      : [],
    getPipelineProcedureSelections(prisma, dealIds),
    getPipelineSaleItems(prisma, dealIds),
  ]);
  const dealById = new Map(deals.map((deal) => [deal.id, deal]));
  const latestOutcomeByEvaluation = new Map<string, EvaluationAuditDetails>();

  for (const log of evaluationAuditLogs) {
    if (latestOutcomeByEvaluation.has(log.entityId)) continue;
    const details = parseEvaluationAuditDetails(log.details);
    if (details?.requestedStatus) latestOutcomeByEvaluation.set(log.entityId, details);
  }

  return evaluations.map((evaluation) => {
    const pipelineDealId = getPipelineDealIdFromEvaluationNotes(evaluation.notes);
    const pipelineDeal = pipelineDealId ? dealById.get(pipelineDealId) : null;
    const pipelineSaleItems = pipelineDealId ? saleItemsByDealId.get(pipelineDealId) || [] : [];
    const outcomeAudit = latestOutcomeByEvaluation.get(evaluation.id);
    const outcomeReason = evaluation.status === "nao_fechou" || evaluation.status === "nao_compareceu"
      ? outcomeAudit?.reason || null
      : null;
    const procedureNames = pipelineSaleItems.length > 0
      ? pipelineSaleItems.map((item) => item.procedureName)
      : normalizeProcedureNames(
          outcomeAudit?.procedureNames ??
            outcomeAudit?.procedureName ??
            (pipelineDealId ? procedureSelections.get(pipelineDealId) : []),
        );
    return {
      ...evaluation,
      outcomeReason,
      pipelineDealId,
      pipelineValue: pipelineDeal?.value || outcomeAudit?.saleValue || 0,
      pipelineProcedureNames: procedureNames,
      pipelineProcedureName: formatProcedureNames(procedureNames) || null,
      pipelineSaleItems,
      pipelineStage: pipelineDeal?.pipelineStage?.name || pipelineDeal?.stage || null,
      pipelineClosedAt: pipelineDeal?.closedAt || null,
    };
  });
}

async function findPipelineStageByKey(params: {
  db: Prisma.TransactionClient;
  unit: string;
  pipelineId?: string | null;
  stageKey: string;
}) {
  const preferredPipeline = params.pipelineId
    ? await params.db.pipeline.findUnique({
        where: { id: params.pipelineId },
        include: { stages: { orderBy: { position: "asc" } } },
      })
    : null;

  const candidatePipelines = [
    ...(preferredPipeline ? [preferredPipeline] : []),
    ...(await params.db.pipeline.findMany({
      where: {
        unit: params.unit,
        ...(preferredPipeline ? { id: { not: preferredPipeline.id } } : {}),
      },
      include: { stages: { orderBy: { position: "asc" } } },
      orderBy: { createdAt: "asc" },
    })),
  ];

  for (const pipeline of candidatePipelines) {
    const stage = pipeline.stages.find((item) => pipelineStageKeyFromName(item.name) === params.stageKey) || null;
    if (stage) return { pipeline, stage };
  }

  return null;
}

async function syncPipelineFromEvaluationStatus(params: {
  db: Prisma.TransactionClient;
  evaluation: {
    id: string;
    notes?: string | null;
    unit: string;
    clientName: string;
    startTime: Date;
    profissional?: { name: string } | null;
  };
  status: EvaluationStatus;
  reason?: string | null;
  saleValue?: number | null;
  procedureName?: string | null;
  procedureNames?: string[];
  saleItems?: SaleItemDraft[];
  userId: string;
  userName: string;
  userUnit: string;
}) {
  if (params.status !== "fechou_pacote" && params.status !== "nao_fechou") return null;

  const pipelineDealId = getPipelineDealIdFromEvaluationNotes(params.evaluation.notes);
  if (!pipelineDealId) return null;

  const deal = await params.db.salesPipeline.findUnique({
    where: { id: pipelineDealId },
    select: {
      id: true,
      clientId: true,
      clientName: true,
      stage: true,
      stageId: true,
      pipelineId: true,
      unit: true,
      assignedTo: true,
      assignedName: true,
      value: true,
      source: true,
    },
  });
  if (!deal || deal.unit !== params.evaluation.unit) return null;

  const assignedUserId = getEvaluationAssignedUserIdFromNotes(params.evaluation.notes);
  const assignedUser = assignedUserId
    ? await params.db.user.findFirst({
        where: { id: assignedUserId, isActive: true },
        select: { id: true, name: true },
      })
    : params.evaluation.profissional?.name
      ? await params.db.user.findFirst({
          where: {
            isActive: true,
            name: { equals: params.evaluation.profissional.name, mode: "insensitive" },
          },
          select: { id: true, name: true },
        })
      : null;
  const targetAssignedTo = assignedUser?.id || params.userId;
  const targetAssignedName = assignedUser?.name || params.evaluation.profissional?.name || params.userName;

  const targetStage = params.status === "fechou_pacote" ? "fechado" : "perdido";
  const placement = await findPipelineStageByKey({
    db: params.db,
    unit: deal.unit,
    pipelineId: deal.pipelineId,
    stageKey: targetStage,
  });
  const campaignOffer = params.status === "fechou_pacote" && params.saleItems
    ? await resolveCampaignOfferForClient({
        database: params.db,
        clientId: deal.clientId,
        unit: deal.unit,
        source: deal.source,
      })
    : null;
  const classifiedSaleItems = params.saleItems
    ? classifySaleItemsForCampaign(params.saleItems, campaignOffer)
    : undefined;

  const updatedDeal = await params.db.salesPipeline.update({
    where: { id: deal.id },
    data: {
      stage: targetStage,
      stageId: placement?.stage.id ?? null,
      ...(placement?.stage ? { pipelineId: placement.pipeline.id } : {}),
      closedAt: params.evaluation.startTime,
      lostReason: params.status === "nao_fechou" ? params.reason || "Não informado" : null,
      ...(params.status === "fechou_pacote" && params.saleValue != null
        ? {
            value: params.saleValue,
            campaignIdSnapshot: campaignOffer?.campaignId || null,
            campaignNameSnapshot: campaignOffer?.campaignName || null,
            campaignAttributionSnapshot: campaignOffer?.attribution || null,
          }
        : {}),
      ...(targetAssignedTo
        ? {
            assignedTo: targetAssignedTo,
            assignedName: targetAssignedName,
          }
        : {}),
    },
  });

  if (params.status === "fechou_pacote" && classifiedSaleItems) {
    await replacePipelineSaleItems(params.db, updatedDeal.id, classifiedSaleItems);
  }

  if (params.status === "fechou_pacote" && params.procedureNames?.length) {
    await recordPipelineProcedureAudit(params.db, {
      dealId: updatedDeal.id,
      procedureNames: params.procedureNames,
      userName: params.userName,
      unit: updatedDeal.unit,
      saleValue: params.saleValue,
      stage: targetStage,
      clientName: updatedDeal.clientName,
      source: "evaluation",
    });
  }

  const clientStage = pipelineToClientStage[targetStage];
  if (deal.clientId && clientStage) {
    await params.db.client.updateMany({
      where: { id: deal.clientId },
      data: { stage: clientStage },
    });
  }

  await params.db.auditLog.create({
    data: {
      userName: params.userName || "Sistema",
      action: "update",
      entity: "pipeline",
      entityId: updatedDeal.id,
      unit: params.userUnit || updatedDeal.unit,
      details: `Oportunidade "${updatedDeal.clientName}" movida automaticamente para ${targetStage === "fechado" ? "Fechado" : "Perdido"} pela avaliação ${params.evaluation.id}`,
    },
  });

  return updatedDeal;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const requestedUnit = searchParams.get("unit");
  const guard = requireUnitGuard(req, { requestedUnit });
  if (guard instanceof NextResponse) return guard;

  const unit = guard.unitFilter || requestedUnit || guard.userUnit;
  if (!unit) {
    return NextResponse.json({ unit: null, evaluations: [], professionals: [], newEvaluationsToday: 0 });
  }

  try {
    guard.enforceUnit(unit);
  } catch (error) {
    if (error instanceof UnitAccessDeniedError) return unitAccessDeniedResponse();
    throw error;
  }

  const defaults = monthRange();
  const start = dateFromParam(searchParams.get("start"), defaults.start);
  const end = dateFromParam(searchParams.get("end"), defaults.end);
  const profissionalId = searchParams.get("profissionalId");
  const canViewAll = canManageAllEvaluations(guard);

  const professionals = await prisma.profissional.findMany({
    where: { unit, isActive: true },
    orderBy: { name: "asc" },
  });

  if (profissionalId) {
    const professional = professionals.find((item) => item.id === profissionalId);
    if (!professional) return unitAccessDeniedResponse();
  }

  const today = saoPauloDayRange();
  const [evaluations, evaluationsCreatedToday] = await Promise.all([
    prisma.agendamento.findMany({
      where: {
        unit,
        procedimento: { contains: "Avalia" },
        startTime: { gte: start, lte: end },
        ...(profissionalId ? { profissionalId } : {}),
      },
      include: { profissional: true },
      orderBy: { startTime: "asc" },
    }),
    prisma.agendamento.findMany({
      where: {
        unit,
        procedimento: { contains: "Avalia" },
        createdAt: { gte: today.start, lt: today.end },
        ...(profissionalId ? { profissionalId } : {}),
      },
      select: {
        notes: true,
        profissional: { select: { name: true } },
      },
    }),
  ]);

  const visibleEvaluations = canViewAll
    ? evaluations
    : evaluations.filter((evaluation) => isOwnEvaluation(evaluation, { id: guard.userId, name: guard.userName }));
  const visibleEvaluationsCreatedToday = canViewAll
    ? evaluationsCreatedToday
    : evaluationsCreatedToday.filter((evaluation) =>
        isOwnEvaluation(evaluation, { id: guard.userId, name: guard.userName }),
      );

  const visibleProfessionalIds = new Set(visibleEvaluations.map((evaluation) => evaluation.profissionalId));
  const visibleProfessionals = canViewAll
    ? professionals
    : professionals.filter(
        (professional) =>
          visibleProfessionalIds.has(professional.id) ||
          isOwnEvaluation({ profissional: professional }, { id: guard.userId, name: guard.userName }),
      );

  const enrichedEvaluations = await enrichEvaluationsWithPipelineData(visibleEvaluations);

  return NextResponse.json({
    unit,
    canViewAll,
    professionals: visibleProfessionals,
    evaluations: enrichedEvaluations,
    newEvaluationsToday: visibleEvaluationsCreatedToday.length,
  });
}

export async function PATCH(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  try {
    const body = await req.json();
    const id = typeof body.id === "string" ? body.id : "";
    const hasStatus = typeof body.status === "string";
    const status = hasStatus ? body.status : "";
    const hasStartTime = typeof body.startTime === "string";
    const requestedStartTime = hasStartTime ? new Date(body.startTime) : null;
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    let saleValue = typeof body.saleValue === "number" ? body.saleValue : null;
    let procedureNames = normalizeProcedureNames(body.procedureNames ?? body.procedureName);
    let procedureName = formatProcedureNames(procedureNames);
    const submittedSaleItems = body.saleItems;
    const rescheduled = body.rescheduled === true;

    if (!id) {
      return NextResponse.json({ error: "Informe a avaliação." }, { status: 400 });
    }

    if (!hasStatus && !hasStartTime) {
      return NextResponse.json(
        { error: "Informe o status ou a nova data da avaliação." },
        { status: 400 },
      );
    }

    if (hasStatus && !isEvaluationStatus(status)) {
      return NextResponse.json({ error: "Status de avaliação inválido." }, { status: 400 });
    }

    if (hasStartTime && (!requestedStartTime || Number.isNaN(requestedStartTime.getTime()))) {
      return NextResponse.json({ error: "Data da avaliação inválida." }, { status: 400 });
    }

    if (rescheduled && status !== "nao_compareceu") {
      return NextResponse.json({ error: "Reagendamento só pode ser informado para uma ausência." }, { status: 400 });
    }

    if (status === "nao_fechou" && !reason) {
      return NextResponse.json({ error: "Informe o motivo do não fechamento." }, { status: 400 });
    }

    if (status === "nao_compareceu" && rescheduled && !requestedStartTime) {
      return NextResponse.json({ error: "Informe a nova data e o novo horário." }, { status: 400 });
    }

    if (status === "nao_compareceu" && !rescheduled && !reason) {
      return NextResponse.json({ error: "Informe o motivo da ausência." }, { status: 400 });
    }

    const evaluation = await prisma.agendamento.findUnique({
      where: { id },
      include: { profissional: true },
    });

    if (!evaluation) {
      return NextResponse.json({ error: "Avaliação não encontrada." }, { status: 404 });
    }

    try {
      guard.enforceUnit(evaluation.unit);
    } catch (error) {
      if (error instanceof UnitAccessDeniedError) return unitAccessDeniedResponse();
      throw error;
    }

    if (!canManageAllEvaluations(guard) && !isOwnEvaluation(evaluation, { id: guard.userId, name: guard.userName })) {
      return NextResponse.json(
        { error: "Você só pode atualizar avaliações atribuídas a você." },
        { status: 403 },
      );
    }

    const normalizedSale = status === "fechou_pacote" && submittedSaleItems !== undefined
      ? await normalizeSubmittedSaleItems({
          database: prisma,
          unit: evaluation.unit,
          submittedItems: submittedSaleItems,
        })
      : null;
    if (normalizedSale) {
      saleValue = normalizedSale.totalValue;
      procedureNames = normalizedSale.procedureNames;
      procedureName = formatProcedureNames(procedureNames);
    }

    if (status === "fechou_pacote" && !procedureName) {
      return NextResponse.json({ error: "Informe o procedimento fechado." }, { status: 400 });
    }

    if (status === "fechou_pacote" && (!saleValue || !Number.isFinite(saleValue) || saleValue <= 0)) {
      return NextResponse.json({ error: "Informe o valor fechado do pacote." }, { status: 400 });
    }

    const persistedStatus = rescheduled ? "pendente" : status;
    const updateData: Prisma.AgendamentoUpdateInput = {};

    if (hasStatus) {
      updateData.status = persistedStatus;
    }
    if (requestedStartTime) {
      const currentDurationMs = evaluation.endTime.getTime() - evaluation.startTime.getTime();
      const durationMs = currentDurationMs > 0 ? currentDurationMs : 60 * 60 * 1000;
      updateData.startTime = requestedStartTime;
      updateData.endTime = new Date(requestedStartTime.getTime() + durationMs);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const savedEvaluation = await tx.agendamento.update({
        where: { id },
        data: updateData,
        include: { profissional: true },
      });

      if (hasStatus && isEvaluationStatus(status) && !rescheduled) {
        await syncPipelineFromEvaluationStatus({
          db: tx,
          evaluation: savedEvaluation,
          status,
          reason,
          saleValue,
          procedureName,
          procedureNames,
          saleItems: normalizedSale?.items,
          userId: guard.userId,
          userName: guard.userName,
          userUnit: guard.userUnit,
        });
      }

      const eventType = rescheduled
        ? "no_show_rescheduled"
        : status === "fechou_pacote"
          ? "closed_package"
          : status === "nao_fechou"
            ? "not_closed"
            : status === "nao_compareceu"
              ? "no_show"
              : hasStatus
                ? "status_changed"
                : "rescheduled";

      await tx.auditLog.create({
        data: {
          userName: guard.userName,
          action: "update",
          entity: "evaluation",
          entityId: savedEvaluation.id,
          unit: savedEvaluation.unit,
          details: JSON.stringify({
            eventType,
            ...(hasStatus ? { from: evaluation.status, to: savedEvaluation.status, requestedStatus: status } : {}),
            ...(reason ? { reason } : {}),
            ...(saleValue != null ? { saleValue } : {}),
            ...(procedureName ? { procedureName, procedureNames } : {}),
            ...(normalizedSale ? { saleItems: normalizedSale.items } : {}),
            ...(rescheduled ? { rescheduled: true } : {}),
            ...(requestedStartTime
              ? {
                  startTimeFrom: evaluation.startTime.toISOString(),
                  startTimeTo: savedEvaluation.startTime.toISOString(),
                  endTimeFrom: evaluation.endTime.toISOString(),
                  endTimeTo: savedEvaluation.endTime.toISOString(),
                }
              : {}),
            clientName: savedEvaluation.clientName,
            profissional: savedEvaluation.profissional?.name,
            updatedBy: guard.userId,
          }),
        },
      });

      return savedEvaluation;
    });

    const [enriched] = await enrichEvaluationsWithPipelineData([updated]);
    return NextResponse.json({ evaluation: enriched });
  } catch (error) {
    if (error instanceof SaleItemValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("[Evaluations] Falha ao atualizar avaliação:", error);
    return NextResponse.json({ error: "Erro ao atualizar avaliação." }, { status: 500 });
  }
}
