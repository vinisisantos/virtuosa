import { NextRequest, NextResponse } from "next/server";
import { getUserFromHeaders } from "@/lib/auth";
import { prisma } from "@/lib/db";

function canUseAiShadow(req: NextRequest) {
  const user = getUserFromHeaders(req);
  if (!user) return { allowed: false, response: NextResponse.json({ error: "Não autorizado" }, { status: 401 }) };
  if (user.isAdmin || user.permissions?.crmSilentAnalysis === true) return { allowed: true, user };
  return { allowed: false, response: NextResponse.json({ error: "Sem permissão para avaliar IA" }, { status: 403 }) };
}

function safeContext(context: any) {
  return {
    conversation: context?.conversation || null,
    messages: Array.isArray(context?.messages) ? context.messages : [],
  };
}

export async function GET(req: NextRequest) {
  try {
    const auth = canUseAiShadow(req);
    if (!auth.allowed) return auth.response;

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || "ready";
    const unit = searchParams.get("unit") || "Osasco";
    const take = Math.max(1, Math.min(100, Number(searchParams.get("limit") || 30)));
    const where: any = { unit };
    if (status !== "all") where.status = status;

    const [runs, counts, reviewed, severeErrors] = await Promise.all([
      prisma.aiShadowRun.findMany({
        where,
        include: {
          drafts: {
            orderBy: { blindLabel: "asc" },
            select: {
              id: true,
              modelKey: true,
              blindLabel: true,
              status: true,
              decision: true,
              messages: true,
              handoffReason: true,
              confidence: true,
              guardrailFlags: true,
              error: true,
              latencyMs: true,
            },
          },
          reviews: {
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
        orderBy: { createdAt: "desc" },
        take,
      }),
      prisma.aiShadowRun.groupBy({
        by: ["status"],
        where: { unit },
        _count: { _all: true },
      }),
      prisma.aiShadowReview.count({
        where: { run: { unit } },
      }),
      prisma.aiShadowReview.count({
        where: {
          run: { unit },
          OR: [{ severeErrorA: true }, { severeErrorB: true }],
        },
      }),
    ]);

    return NextResponse.json({
      summary: {
        counts: counts.map((item) => ({ status: item.status, count: item._count._all })),
        reviewed,
        severeErrors,
      },
      runs: runs.map((run) => ({
        id: run.id,
        status: run.status,
        unit: run.unit,
        contactName: run.contactName,
        contactPhone: run.contactPhone,
        triggerReason: run.triggerReason,
        createdAt: run.createdAt,
        processedAt: run.processedAt,
        context: safeContext(run.context),
        drafts: run.drafts,
        review: run.reviews[0] || null,
      })),
    });
  } catch (error: any) {
    console.error("[GET /api/crm/ai-shadow/runs]", error);
    return NextResponse.json({ error: "Falha ao carregar avaliações", details: error?.message }, { status: 500 });
  }
}

