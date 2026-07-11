import { NextRequest, NextResponse } from "next/server";

import {
  evaluationAssignedUserMarker,
  getEvaluationAssignedUserIdFromNotes,
  getPipelineDealIdFromEvaluationNotes,
  normalizeEvaluationText,
} from "@/lib/evaluation-scheduling";
import { isEvaluationStatus } from "@/lib/evaluation-status";
import { prisma } from "@/lib/db";
import { requireUnitGuard, UnitAccessDeniedError, unitAccessDeniedResponse } from "@/lib/unit-guard";

const pipelineToClientStage: Record<string, string> = {
  fechado: "venda",
};

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

function stageKeyFromName(name?: string | null) {
  return (name || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, "_");
}

function canManageAllEvaluations(guard: Exclude<ReturnType<typeof requireUnitGuard>, NextResponse>) {
  return (
    guard.isAdmin ||
    guard.permissions?.admin === true ||
    guard.permissions?.multiUnit === true ||
    guard.permissions?.crmEvaluationsAll === true
  );
}

async function enrichEvaluationsWithPipelineData<T extends { notes?: string | null }>(evaluations: T[]) {
  const dealIds = [
    ...new Set(
      evaluations
        .map((evaluation) => getPipelineDealIdFromEvaluationNotes(evaluation.notes))
        .filter((dealId): dealId is string => Boolean(dealId)),
    ),
  ];

  const deals = dealIds.length
    ? await prisma.salesPipeline.findMany({
        where: { id: { in: dealIds } },
        select: {
          id: true,
          value: true,
          stage: true,
          closedAt: true,
          pipelineStage: { select: { name: true } },
        },
      })
    : [];
  const dealById = new Map(deals.map((deal) => [deal.id, deal]));

  return evaluations.map((evaluation) => {
    const pipelineDealId = getPipelineDealIdFromEvaluationNotes(evaluation.notes);
    const pipelineDeal = pipelineDealId ? dealById.get(pipelineDealId) : null;
    return {
      ...evaluation,
      pipelineDealId,
      pipelineValue: pipelineDeal?.value || 0,
      pipelineStage: pipelineDeal?.pipelineStage?.name || pipelineDeal?.stage || null,
      pipelineClosedAt: pipelineDeal?.closedAt || null,
    };
  });
}

async function findPipelineStageByKey(params: {
  unit: string;
  pipelineId?: string | null;
  stageKey: string;
}) {
  const preferredPipeline = params.pipelineId
    ? await prisma.pipeline.findUnique({
        where: { id: params.pipelineId },
        include: { stages: { orderBy: { position: "asc" } } },
      })
    : null;

  const candidatePipelines = [
    ...(preferredPipeline ? [preferredPipeline] : []),
    ...(await prisma.pipeline.findMany({
      where: {
        unit: params.unit,
        ...(preferredPipeline ? { id: { not: preferredPipeline.id } } : {}),
      },
      include: { stages: { orderBy: { position: "asc" } } },
      orderBy: { createdAt: "asc" },
    })),
  ];

  for (const pipeline of candidatePipelines) {
    const stage = pipeline.stages.find((item) => stageKeyFromName(item.name) === params.stageKey) || null;
    if (stage) return { pipeline, stage };
  }

  return null;
}

async function syncPipelineFromEvaluationStatus(params: {
  evaluation: {
    id: string;
    notes?: string | null;
    unit: string;
    clientName: string;
    profissional?: { name: string } | null;
  };
  status: string;
  userId: string;
  userName: string;
  userUnit: string;
}) {
  if (params.status !== "fechou_pacote") return null;

  const pipelineDealId = getPipelineDealIdFromEvaluationNotes(params.evaluation.notes);
  if (!pipelineDealId) return null;

  const deal = await prisma.salesPipeline.findUnique({
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
    },
  });
  if (!deal || deal.unit !== params.evaluation.unit) return null;

  const assignedUserId = getEvaluationAssignedUserIdFromNotes(params.evaluation.notes);
  const assignedUser = assignedUserId
    ? await prisma.user.findFirst({
        where: { id: assignedUserId, isActive: true },
        select: { id: true, name: true },
      })
    : params.evaluation.profissional?.name
      ? await prisma.user.findFirst({
          where: {
            isActive: true,
            name: { equals: params.evaluation.profissional.name, mode: "insensitive" },
          },
          select: { id: true, name: true },
        })
      : null;
  const targetAssignedTo = assignedUser?.id || params.userId;
  const targetAssignedName = assignedUser?.name || params.evaluation.profissional?.name || params.userName;

  const placement = await findPipelineStageByKey({
    unit: deal.unit,
    pipelineId: deal.pipelineId,
    stageKey: "fechado",
  });

  const isAlreadyInClosedStage =
    stageKeyFromName(deal.stage) === "fechado" && (!placement?.stage || deal.stageId === placement.stage.id);
  const isAlreadyAssignedToEvaluationOwner = !targetAssignedTo || deal.assignedTo === targetAssignedTo;

  if (isAlreadyInClosedStage && isAlreadyAssignedToEvaluationOwner) {
    return deal;
  }

  const updatedDeal = await prisma.salesPipeline.update({
    where: { id: deal.id },
    data: {
      ...(isAlreadyInClosedStage
        ? {}
        : {
            stage: "fechado",
            ...(placement?.stage ? { stageId: placement.stage.id, pipelineId: placement.pipeline.id } : {}),
            closedAt: new Date(),
            lostReason: null,
          }),
      ...(targetAssignedTo
        ? {
            assignedTo: targetAssignedTo,
            assignedName: targetAssignedName,
          }
        : {}),
    },
  });

  const clientStage = pipelineToClientStage.fechado;
  if (deal.clientId && clientStage) {
    await prisma.client.update({
      where: { id: deal.clientId },
      data: { stage: clientStage },
    }).catch(() => { /* cliente legado pode não existir */ });
  }

  await prisma.auditLog.create({
    data: {
      userName: params.userName || "Sistema",
      action: "update",
      entity: "pipeline",
      entityId: updatedDeal.id,
      unit: params.userUnit || updatedDeal.unit,
      details: `Oportunidade "${updatedDeal.clientName}" movida automaticamente para Fechado pela avaliação ${params.evaluation.id}`,
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
    return NextResponse.json({ unit: null, evaluations: [], professionals: [] });
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

  const evaluations = await prisma.agendamento.findMany({
    where: {
      unit,
      procedimento: { contains: "Avalia" },
      startTime: { gte: start, lte: end },
      ...(profissionalId ? { profissionalId } : {}),
    },
    include: { profissional: true },
    orderBy: { startTime: "asc" },
  });

  const visibleEvaluations = canViewAll
    ? evaluations
    : evaluations.filter((evaluation) => isOwnEvaluation(evaluation, { id: guard.userId, name: guard.userName }));

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

    const updateData: {
      status?: string;
      startTime?: Date;
      endTime?: Date;
    } = {};

    if (hasStatus) updateData.status = status;
    if (requestedStartTime) {
      const currentDurationMs = evaluation.endTime.getTime() - evaluation.startTime.getTime();
      const durationMs = currentDurationMs > 0 ? currentDurationMs : 60 * 60 * 1000;
      updateData.startTime = requestedStartTime;
      updateData.endTime = new Date(requestedStartTime.getTime() + durationMs);
    }

    const updated = await prisma.agendamento.update({
      where: { id },
      data: updateData,
      include: { profissional: true },
    });

    if (hasStatus && isEvaluationStatus(status)) {
      await syncPipelineFromEvaluationStatus({
        evaluation: updated,
        status,
        userId: guard.userId,
        userName: guard.userName,
        userUnit: guard.userUnit,
      });
    }

    try {
      await prisma.auditLog.create({
        data: {
          userName: guard.userName,
          action: "update",
          entity: "evaluation",
          entityId: updated.id,
          unit: updated.unit,
          details: JSON.stringify({
            ...(hasStatus ? { from: evaluation.status, to: updated.status } : {}),
            ...(requestedStartTime
              ? {
                  startTimeFrom: evaluation.startTime.toISOString(),
                  startTimeTo: updated.startTime.toISOString(),
                  endTimeFrom: evaluation.endTime.toISOString(),
                  endTimeTo: updated.endTime.toISOString(),
                }
              : {}),
            clientName: updated.clientName,
            profissional: updated.profissional?.name,
            updatedBy: guard.userId,
          }),
        },
      });
    } catch (auditError) {
      console.error("[Evaluations] Falha ao registrar auditoria:", auditError);
    }

    const [enriched] = await enrichEvaluationsWithPipelineData([updated]);
    return NextResponse.json({ evaluation: enriched });
  } catch (error) {
    console.error("[Evaluations] Falha ao atualizar avaliação:", error);
    return NextResponse.json({ error: "Erro ao atualizar avaliação." }, { status: 500 });
  }
}
