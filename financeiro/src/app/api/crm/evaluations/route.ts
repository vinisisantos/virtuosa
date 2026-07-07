import { NextRequest, NextResponse } from "next/server";

import {
  evaluationAssignedUserMarker,
  normalizeEvaluationText,
  userCanUseEvaluationUnit,
} from "@/lib/evaluation-scheduling";
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
  const canViewAll =
    guard.isAdmin ||
    guard.permissions?.admin === true ||
    guard.permissions?.multiUnit === true ||
    guard.permissions?.crmEvaluationsAll === true;

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

  return NextResponse.json({
    unit,
    canViewAll,
    professionals: visibleProfessionals,
    evaluations: visibleEvaluations,
  });
}
