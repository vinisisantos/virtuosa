import { NextRequest, NextResponse } from "next/server";
import { getUserFromHeaders } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { analyzeConversationSilently, ensureSilentAnalysisSchema } from "@/lib/crm-silent-analysis";

function canUseSilentAnalysis(req: NextRequest) {
  const user = getUserFromHeaders(req);
  if (!user) return { allowed: false, response: NextResponse.json({ error: "Não autorizado" }, { status: 401 }) };
  if (user.isAdmin || user.permissions?.crmSilentAnalysis === true) return { allowed: true, user };
  return { allowed: false, response: NextResponse.json({ error: "Sem permissão para análise silenciosa" }, { status: 403 }) };
}

export async function GET(req: NextRequest) {
  try {
    const auth = canUseSilentAnalysis(req);
    if (!auth.allowed) return auth.response;

    await ensureSilentAnalysisSchema();

    const { searchParams } = new URL(req.url);
    const unit = searchParams.get("unit");
    const where = unit && unit !== "Todas" ? { unit } : {};

    const [total, byUnit, byCampaign, recent] = await Promise.all([
      prisma.crmConversationInsight.count({ where }),
      prisma.crmConversationInsight.groupBy({
        by: ["unit"],
        where,
        _count: { _all: true },
      }),
      prisma.crmConversationInsight.groupBy({
        by: ["campaignName"],
        where,
        _count: { _all: true },
      }),
      prisma.crmConversationInsight.findMany({
        where,
        orderBy: { lastAnalyzedAt: "desc" },
        take: 20,
      }),
    ]);

    return NextResponse.json({
      total,
      byUnit: byUnit
        .map((item) => ({ unit: item.unit || "Sem unidade", count: item._count._all }))
        .sort((a, b) => b.count - a.count),
      byCampaign: byCampaign
        .map((item) => ({ campaignName: item.campaignName || "Sem campanha", count: item._count._all }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8),
      recent,
    });
  } catch (error: any) {
    console.error("[Silent Analysis Insights GET]", error);
    return NextResponse.json({ error: "Falha ao carregar aprendizados da análise silenciosa", details: error?.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = canUseSilentAnalysis(req);
    if (!auth.allowed) return auth.response;

    await ensureSilentAnalysisSchema();

    const body = await req.json().catch(() => ({}));
    const unit = typeof body.unit === "string" && body.unit !== "Todas" ? body.unit : null;
    const limit = Math.min(Math.max(Number(body.limit || 100), 1), 500);

    const conversations = await prisma.whatsAppConversation.findMany({
      where: unit ? { instance: { unit } } : {},
      select: { id: true },
      orderBy: { lastMessageAt: "desc" },
      take: limit,
    });

    let processed = 0;
    for (const conversation of conversations) {
      const insight = await analyzeConversationSilently(conversation.id);
      if (insight) processed += 1;
    }

    return NextResponse.json({ processed, scanned: conversations.length });
  } catch (error: any) {
    console.error("[Silent Analysis Insights POST]", error);
    return NextResponse.json({ error: "Falha ao reprocessar histórico da análise silenciosa", details: error?.message }, { status: 500 });
  }
}
