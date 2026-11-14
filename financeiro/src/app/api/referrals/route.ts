import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUnitGuard, UnitAccessDeniedError, unitAccessDeniedResponse } from "@/lib/unit-guard";
import { canAccessPipelineDeal, resolvePipelineOwnerScope } from "@/lib/pipeline-owner-scope";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const guard = requireUnitGuard(req, { requestedUnit: url.searchParams.get("unit") });
  if (guard instanceof NextResponse) return guard;

  const salesPipelineId = url.searchParams.get("salesPipelineId")?.trim();
  if (salesPipelineId) {
    const sale = await prisma.salesPipeline.findUnique({ where: { id: salesPipelineId } });
    if (!sale) return NextResponse.json({ referral: null });
    try {
      guard.enforceUnit(sale.unit);
    } catch (error) {
      if (error instanceof UnitAccessDeniedError) return unitAccessDeniedResponse();
      throw error;
    }
    const ownerScope = await resolvePipelineOwnerScope(req, guard);
    if (!(await canAccessPipelineDeal(sale, ownerScope))) return unitAccessDeniedResponse();
    const referral = await prisma.clientReferral.findUnique({
      where: { salesPipelineId },
      select: { id: true, referrerClientId: true, referrerName: true, unit: true, createdAt: true },
    });
    return NextResponse.json({ referral });
  }

  const referrerClientId = url.searchParams.get("referrerClientId")?.trim();
  if (!referrerClientId) return NextResponse.json({ error: "Indicador obrigatório" }, { status: 400 });

  try {
    const referrer = await prisma.client.findFirst({
      where: { id: referrerClientId, ...(guard.unitFilter ? { unit: guard.unitFilter } : {}) },
      select: { id: true, unit: true },
    });
    if (!referrer) return NextResponse.json({ error: "Indicador não encontrado" }, { status: 404 });
    try {
      guard.enforceUnit(referrer.unit);
    } catch (error) {
      if (error instanceof UnitAccessDeniedError) return unitAccessDeniedResponse();
      throw error;
    }

    const parsedPage = Number.parseInt(url.searchParams.get("page") || "1", 10);
    const parsedLimit = Number.parseInt(url.searchParams.get("limit") || "20", 10);
    const page = Number.isFinite(parsedPage) ? Math.max(1, parsedPage) : 1;
    const limit = Number.isFinite(parsedLimit) ? Math.min(50, Math.max(1, parsedLimit)) : 20;
    const where = { referrerClientId, unit: referrer.unit };

    const [referrals, summaries] = await Promise.all([
      prisma.clientReferral.findMany({
        where,
        select: {
          id: true,
          createdAt: true,
          unit: true,
          referrerName: true,
          referredClient: { select: { id: true, name: true } },
          salesPipeline: { select: { id: true, value: true, closedAt: true, stage: true } },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.$queryRaw<Array<{ referralCount: number; closedCount: number; closedValue: number }>>(Prisma.sql`
        SELECT COUNT(referral.id)::int AS "referralCount",
          COUNT(sale.id) FILTER (WHERE sale."closedAt" IS NOT NULL)::int AS "closedCount",
          COALESCE(SUM(sale.value) FILTER (WHERE sale."closedAt" IS NOT NULL), 0)::float8 AS "closedValue"
        FROM "ClientReferral" referral
        LEFT JOIN "SalesPipeline" sale
          ON sale.id = referral."salesPipelineId" AND sale.unit = referral.unit
        WHERE referral."referrerClientId" = ${referrerClientId} AND referral.unit = ${referrer.unit}
      `),
    ]);

    return NextResponse.json({
      referrals,
      summary: summaries[0] || { referralCount: 0, closedCount: 0, closedValue: 0 },
      page,
      limit,
    });
  } catch (error) {
    console.error("[GET /api/referrals]", error);
    return NextResponse.json({ error: "Não foi possível carregar as indicações" }, { status: 500 });
  }
}
