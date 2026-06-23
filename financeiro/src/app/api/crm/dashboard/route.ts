import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUnitGuard } from "@/lib/unit-guard";

export async function GET(req: NextRequest) {
  const urlUnit = req.nextUrl.searchParams.get("unit");
  const guard = requireUnitGuard(req, { requestedUnit: urlUnit });
  if (guard instanceof NextResponse) return guard;

  const queryUserId = req.nextUrl.searchParams.get("userId");
  const targetUserId = guard.isAdmin && queryUserId ? queryUserId : guard.userId;
  const isUserFiltered = !guard.isAdmin || !!queryUserId;

  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);

    // Resolve WhatsApp instances for target user
    let instanceIds: string[] | undefined;
    if (isUserFiltered) {
      const instances = await prisma.whatsAppInstance.findMany({
        where: { userId: targetUserId },
        select: { id: true },
      });
      instanceIds = instances.map((i) => i.id);
    }

    const noMatch = { id: "__no_match__" };
    const convWhere: any =
      instanceIds !== undefined
        ? instanceIds.length > 0
          ? { instanceId: { in: instanceIds } }
          : noMatch
        : {};
    const msgJoinWhere: any =
      instanceIds !== undefined
        ? instanceIds.length > 0
          ? { conversation: { instanceId: { in: instanceIds } } }
          : noMatch
        : {};
    const contactJoinWhere: any =
      instanceIds !== undefined
        ? instanceIds.length > 0
          ? { conversations: { some: { instanceId: { in: instanceIds } } } }
          : noMatch
        : {};

    const unitWhere: any = guard.unitFilter ? { unit: guard.unitFilter } : {};
    const pipelineWhere: any = {
      ...unitWhere,
      ...(isUserFiltered ? { assignedTo: targetUserId } : {}),
    };
    const activityWhere: any = {
      ...(guard.unitFilter ? { unit: guard.unitFilter } : {}),
      ...(isUserFiltered ? { userId: targetUserId } : {}),
    };

    const [
      activeConversations,
      yesterdayConversations,
      newContactsToday,
      newContactsYesterday,
      openDeals,
      messagesToday,
      messagesYesterday,
      pipelineByStage,
      recentActivity,
      conversationSeries,
    ] = await Promise.all([
      prisma.whatsAppConversation.count({ where: { ...convWhere, status: "open" } }),
      prisma.whatsAppConversation.count({
        where: { ...convWhere, status: "open", createdAt: { gte: yesterdayStart, lt: todayStart } },
      }),
      prisma.whatsAppContact.count({ where: { ...contactJoinWhere, createdAt: { gte: todayStart } } }),
      prisma.whatsAppContact.count({
        where: { ...contactJoinWhere, createdAt: { gte: yesterdayStart, lt: todayStart } },
      }),
      prisma.salesPipeline.aggregate({
        where: { ...pipelineWhere, stage: { notIn: ["fechado", "perdido"] } },
        _sum: { value: true },
        _count: true,
      }),
      prisma.whatsAppMessage.count({
        where: { fromMe: true, createdAt: { gte: todayStart }, ...msgJoinWhere },
      }),
      prisma.whatsAppMessage.count({
        where: { fromMe: true, createdAt: { gte: yesterdayStart, lt: todayStart }, ...msgJoinWhere },
      }),
      prisma.salesPipeline.groupBy({
        by: ["stage"],
        where: pipelineWhere,
        _count: true,
        _sum: { value: true },
      }),
      prisma.activityLog.findMany({
        where: activityWhere,
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { id: true, userName: true, action: true, entityType: true, description: true, createdAt: true },
      }),
      getConversationSeries(30, instanceIds),
    ]);

    const stageLabels: Record<string, string> = {
      novo_lead: "Novo Lead",
      em_atendimento: "Em Atendimento",
      em_negociacao: "Em Negociação",
      fechado: "Fechado",
      perdido: "Perdido",
    };
    const stageColors: Record<string, string> = {
      novo_lead: "#8b5cf6",
      em_atendimento: "#3b82f6",
      em_negociacao: "#f59e0b",
      fechado: "#22c55e",
      perdido: "#ef4444",
    };

    return NextResponse.json({
      metrics: {
        activeConversations: { current: activeConversations, previous: yesterdayConversations },
        newContactsToday: { current: newContactsToday, previous: newContactsYesterday },
        openDealsValue: openDeals._sum.value || 0,
        openDealsCount: openDeals._count || 0,
        messagesSentToday: { current: messagesToday, previous: messagesYesterday },
      },
      pipeline: pipelineByStage.map((s) => ({
        stage: s.stage,
        label: stageLabels[s.stage] || s.stage,
        count: s._count,
        value: s._sum.value || 0,
        color: stageColors[s.stage] || "#6b7280",
      })),
      activity: recentActivity,
      conversationSeries,
    });
  } catch (error) {
    console.error("[CRM Dashboard API]", error);
    return NextResponse.json({ error: "Failed to load dashboard data" }, { status: 500 });
  }
}

async function getConversationSeries(days: number, instanceIds?: string[]) {
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - days);

  if (instanceIds !== undefined && instanceIds.length === 0) {
    return Array.from({ length: days }, (_, d) => {
      const date = new Date(start);
      date.setDate(date.getDate() + d);
      return { date: date.toISOString().split("T")[0], incoming: 0, outgoing: 0 };
    });
  }

  const msgFilter: any = { createdAt: { gte: start } };
  if (instanceIds && instanceIds.length > 0) {
    msgFilter.conversation = { instanceId: { in: instanceIds } };
  }

  const messages = await prisma.whatsAppMessage.findMany({
    where: msgFilter,
    select: { fromMe: true, createdAt: true },
  });

  const dateMap: Record<string, { incoming: number; outgoing: number }> = {};
  for (let d = 0; d < days; d++) {
    const date = new Date(start);
    date.setDate(date.getDate() + d);
    dateMap[date.toISOString().split("T")[0]] = { incoming: 0, outgoing: 0 };
  }
  for (const msg of messages) {
    const key = new Date(msg.createdAt).toISOString().split("T")[0];
    if (dateMap[key]) {
      if (msg.fromMe) dateMap[key].outgoing++;
      else dateMap[key].incoming++;
    }
  }
  return Object.entries(dateMap).map(([date, counts]) => ({ date, ...counts }));
}
