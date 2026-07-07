import { NextRequest, NextResponse } from "next/server";

import {
  evaluationAssignedUserMarker,
  getPipelineDealIdFromEvaluationNotes,
  normalizeEvaluationText,
} from "@/lib/evaluation-scheduling";
import { isEvaluationStatus } from "@/lib/evaluation-status";
import { prisma } from "@/lib/db";
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
