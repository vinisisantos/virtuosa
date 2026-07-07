import { NextRequest, NextResponse } from "next/server";

import {
  evaluationAssignedUserMarker,
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
  const pipeline = params.pipelineId
    ? await prisma.pipeline.findUnique({
        where: { id: params.pipelineId },
        include: { stages: { orderBy: { position: "asc" } } },
      })
    : await prisma.pipeline.findFirst({
        where: { unit: params.unit },
        include: { stages: { orderBy: { position: "asc" } } },
        orderBy: { createdAt: "asc" },
      });

  if (!pipeline || pipeline.unit !== params.unit) return null;

  const stage = pipeline.stages.find((item) => stageKeyFromName(item.name) === params.stageKey) || null;
  return { pipeline, stage };
}

async function syncPipelineFromEvaluationStatus(params: {
  evaluation: { id: string; notes?: string | null; unit: string; clientName: string };
  status: string;
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
    },
  });
  if (!deal || deal.unit !== params.evaluation.unit) return null;

  const placement = await findPipelineStageByKey({
    unit: deal.unit,
    pipelineId: deal.pipelineId,
    stageKey: "fechado",
  });
  if (!placement?.stage) {
    throw new Error('Coluna "Fechado" não encontrada no Pipeline desta unidade.');
  }

  if (stageKeyFromName(deal.stage) === "fechado" && deal.stageId === placement.stage.id) {
    return deal;
  }

  const updatedDeal = await prisma.salesPipeline.update({
    where: { id: deal.id },
    data: {
      stage: "fechado",
      stageId: placement.stage.id,
      pipelineId: placement.pipeline.id,
      closedAt: new Date(),
      lostReason: null,
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
    const status = typeof body.status === "string" ? body.status : "";

    if (!id) {
      return NextResponse.json({ error: "Informe a avaliação." }, { status: 400 });
    }

    if (!isEvaluationStatus(status)) {
      return NextResponse.json({ error: "Status de avaliação inválido." }, { status: 400 });
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

    const updated = await prisma.agendamento.update({
      where: { id },
      data: { status },
      include: { profissional: true },
    });

    await syncPipelineFromEvaluationStatus({
      evaluation: updated,
      status,
      userName: guard.userName,
      userUnit: guard.userUnit,
    });

    try {
      await prisma.auditLog.create({
        data: {
          userName: guard.userName,
          action: "update",
          entity: "evaluation",
          entityId: updated.id,
          unit: updated.unit,
          details: JSON.stringify({
            from: evaluation.status,
            to: updated.status,
            clientName: updated.clientName,
            profissional: updated.profissional?.name,
            updatedBy: guard.userId,
          }),
        },
      });
    } catch (auditError) {
      console.error("[Evaluations] Falha ao registrar auditoria de status:", auditError);
    }

    const [enriched] = await enrichEvaluationsWithPipelineData([updated]);
    return NextResponse.json({ evaluation: enriched });
  } catch (error) {
    console.error("[Evaluations] Falha ao atualizar status:", error);
    return NextResponse.json({ error: "Erro ao atualizar avaliação." }, { status: 500 });
  }
}
