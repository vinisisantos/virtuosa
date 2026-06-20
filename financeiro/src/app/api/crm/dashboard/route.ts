import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);

    // Run all queries in parallel
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
      // 1. Active conversations (status = open)
      prisma.whatsAppConversation.count({ where: { status: "open" } }),

      // 2. Conversations opened yesterday (for delta)
      prisma.whatsAppConversation.count({
        where: {
          status: "open",
          createdAt: { gte: yesterdayStart, lt: todayStart },
        },
      }),

      // 3. New contacts today
      prisma.whatsAppContact.count({
        where: { createdAt: { gte: todayStart } },
      }),

      // 4. New contacts yesterday
      prisma.whatsAppContact.count({
        where: {
          createdAt: { gte: yesterdayStart, lt: todayStart },
        },
      }),

      // 5. Open deals (pipeline not fechado/perdido)
      prisma.salesPipeline.aggregate({
        where: {
          stage: { notIn: ["fechado", "perdido"] },
        },
        _sum: { value: true },
        _count: true,
      }),

      // 6. Messages sent today (fromMe = true)
      prisma.whatsAppMessage.count({
        where: {
          fromMe: true,
          createdAt: { gte: todayStart },
        },
      }),

      // 7. Messages sent yesterday
      prisma.whatsAppMessage.count({
        where: {
          fromMe: true,
          createdAt: { gte: yesterdayStart, lt: todayStart },
        },
      }),

      // 8. Pipeline by stage
      prisma.salesPipeline.groupBy({
        by: ["stage"],
        _count: true,
        _sum: { value: true },
      }),

      // 9. Recent activity (last 20)
      prisma.activityLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          userName: true,
          action: true,
          entityType: true,
          description: true,
          createdAt: true,
        },
      }),

      // 10. Conversation series (last 30 days)
      getConversationSeries(30),
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
        activeConversations: {
          current: activeConversations,
          previous: yesterdayConversations,
        },
        newContactsToday: {
          current: newContactsToday,
          previous: newContactsYesterday,
        },
        openDealsValue: openDeals._sum.value || 0,
        openDealsCount: openDeals._count || 0,
        messagesSentToday: {
          current: messagesToday,
          previous: messagesYesterday,
        },
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
    return NextResponse.json(
      { error: "Failed to load dashboard data" },
      { status: 500 }
    );
  }
}

async function getConversationSeries(days: number) {
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - days);

  const messages = await prisma.whatsAppMessage.findMany({
    where: { createdAt: { gte: start } },
    select: { fromMe: true, createdAt: true },
  });

  // Group by date
  const dateMap: Record<string, { incoming: number; outgoing: number }> = {};
  for (let d = 0; d < days; d++) {
    const date = new Date(start);
    date.setDate(date.getDate() + d);
    const key = date.toISOString().split("T")[0];
    dateMap[key] = { incoming: 0, outgoing: 0 };
  }

  for (const msg of messages) {
    const key = new Date(msg.createdAt).toISOString().split("T")[0];
    if (dateMap[key]) {
      if (msg.fromMe) {
        dateMap[key].outgoing++;
      } else {
        dateMap[key].incoming++;
      }
    }
  }

  return Object.entries(dateMap).map(([date, counts]) => ({
    date,
    incoming: counts.incoming,
    outgoing: counts.outgoing,
  }));
}
