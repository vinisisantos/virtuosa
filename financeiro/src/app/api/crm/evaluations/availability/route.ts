import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import {
  buildEvaluationAvailabilitySlots,
  evaluationAvailabilityRange,
  type EvaluationAvailabilityPeriod,
} from "@/lib/evaluation-availability";
import {
  EvaluationSchedulingError,
  resolveEvaluationAssignee,
} from "@/lib/evaluation-scheduling";
import {
  requireUnitGuard,
  UnitAccessDeniedError,
  unitAccessDeniedResponse,
} from "@/lib/unit-guard";

const ACTIVE_UNITS = new Set(["Osasco", "SBC", "SCS"]);
const AVAILABILITY_PERIODS = new Set<EvaluationAvailabilityPeriod>([
  "all",
  "morning",
  "afternoon",
  "evening",
]);

export async function GET(req: NextRequest) {
  const searchParams = new URL(req.url).searchParams;
  const requestedUnit = searchParams.get("unit")?.trim() || "";
  const assigneeUserId = searchParams.get("assigneeUserId")?.trim() || "";
  const startDate = searchParams.get("start")?.trim() || "";
  const endDate = searchParams.get("end")?.trim() || "";
  const requestedPeriod = searchParams.get("period") as EvaluationAvailabilityPeriod | null;
  const period = requestedPeriod && AVAILABILITY_PERIODS.has(requestedPeriod)
    ? requestedPeriod
    : "all";

  if (!ACTIVE_UNITS.has(requestedUnit)) {
    return NextResponse.json({ error: "Selecione uma unidade válida" }, { status: 400 });
  }
  if (!assigneeUserId) {
    return NextResponse.json({ error: "Selecione a responsável pela avaliação" }, { status: 400 });
  }

  const guard = requireUnitGuard(req, { requestedUnit });
  if (guard instanceof NextResponse) return guard;

  try {
    guard.enforceUnit(requestedUnit);
    const range = evaluationAvailabilityRange(startDate, endDate);
    const [assignee, appointments] = await Promise.all([
      resolveEvaluationAssignee(requestedUnit, assigneeUserId),
      prisma.agendamento.findMany({
        where: {
          unit: requestedUnit,
          procedimento: { contains: "Avalia", mode: "insensitive" },
          status: { notIn: ["cancelado", "falta"] },
          startTime: { gte: range.start, lt: range.endExclusive },
        },
        select: { startTime: true },
      }),
    ]);
    const slots = buildEvaluationAvailabilitySlots({
      startDate,
      endDate,
      period,
      occupiedStartTimes: appointments.map((appointment) => appointment.startTime),
    });

    return NextResponse.json({
      unit: requestedUnit,
      assignee: { id: assignee.id, name: assignee.name },
      slots,
    });
  } catch (error) {
    if (error instanceof UnitAccessDeniedError) return unitAccessDeniedResponse();
    if (error instanceof EvaluationSchedulingError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof Error && (
      error.message.includes("disponibilidade") ||
      error.message.includes("data final") ||
      error.message.includes("no máximo")
    )) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Erro ao consultar disponibilidade de avaliações:", error);
    return NextResponse.json({ error: "Não foi possível consultar os horários" }, { status: 500 });
  }
}
