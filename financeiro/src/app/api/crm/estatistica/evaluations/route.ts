import { NextRequest, NextResponse } from "next/server";

import { canViewCrmStatistics } from "@/lib/crm-statistics";
import { prisma } from "@/lib/db";
import { parseDateTimeRange, saoPauloDayRange } from "@/lib/date-filter";
import { requireUnitGuard } from "@/lib/unit-guard";

export async function GET(req: NextRequest) {
  const requestedUnit = req.nextUrl.searchParams.get("unit");
  const guard = requireUnitGuard(req, { requestedUnit });
  if (guard instanceof NextResponse) return guard;

  if (!canViewCrmStatistics(guard)) {
    return NextResponse.json({ error: "Sem permissão para estatísticas do CRM" }, { status: 403 });
  }

  const requestedRange = parseDateTimeRange(req.nextUrl.searchParams);
  const today = saoPauloDayRange();
  const range = requestedRange || { gte: today.start, lte: new Date(today.end.getTime() - 1) };

  if (range.gte && range.lte && range.gte > range.lte) {
    return NextResponse.json({ error: "Período de avaliações inválido." }, { status: 400 });
  }

  try {
    const scheduledEvaluations = await prisma.agendamento.count({
      where: {
        procedimento: { contains: "Avalia" },
        startTime: range,
        ...(guard.unitFilter ? { unit: guard.unitFilter } : {}),
      },
    });

    return NextResponse.json(
      {
        scheduledEvaluations,
        range: {
          start: range.gte?.toISOString() || null,
          end: range.lte?.toISOString() || null,
        },
        unit: guard.unitFilter || "Todas",
      },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" } },
    );
  } catch (error) {
    console.error("[CRM Estatistica Avaliacoes]", error);
    return NextResponse.json({ error: "Falha ao carregar avaliações agendadas" }, { status: 500 });
  }
}
