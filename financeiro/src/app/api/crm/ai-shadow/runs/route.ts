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

function isHumanReply(message: { fromMe: boolean; body: string | null; respondedByName: string | null }) {
  return message.fromMe && !!message.body?.trim() && message.respondedByName !== "Automação";
}

async function loadHumanRepliesForRuns(runs: Array<{ id: string; conversationId: string; incomingMessageId: string | null }>) {
  const runsWithIncoming = runs.filter((run) => run.incomingMessageId);
  if (runsWithIncoming.length === 0) return new Map<string, any>();

  const incomingMessages = await prisma.whatsAppMessage.findMany({
    where: { id: { in: runsWithIncoming.map((run) => run.incomingMessageId!) } },
    select: { id: true, conversationId: true, timestamp: true },
  });
  const incomingById = new Map(incomingMessages.map((message) => [message.id, message]));
  const minTimestampByConversation = new Map<string, Date>();

  for (const message of incomingMessages) {
    const current = minTimestampByConversation.get(message.conversationId);
    if (!current || message.timestamp < current) minTimestampByConversation.set(message.conversationId, message.timestamp);
  }

  const conversationWindows = [...minTimestampByConversation.entries()].map(([conversationId, timestamp]) => ({
    conversationId,
    timestamp: { gte: timestamp },
  }));
  if (conversationWindows.length === 0) return new Map<string, any>();

  const messages = await prisma.whatsAppMessage.findMany({
    where: { OR: conversationWindows },
    orderBy: [{ conversationId: "asc" }, { timestamp: "asc" }],
    select: {
      id: true,
      conversationId: true,
      body: true,
      type: true,
      fromMe: true,
      timestamp: true,
      respondedByName: true,
    },
  });

  const messagesByConversation = new Map<string, typeof messages>();
  for (const message of messages) {
    const list = messagesByConversation.get(message.conversationId) || [];
    list.push(message);
    messagesByConversation.set(message.conversationId, list);
  }

  const repliesByRun = new Map<string, any>();
  for (const run of runsWithIncoming) {
    const incoming = incomingById.get(run.incomingMessageId!);
    if (!incoming) continue;
    const conversationMessages = messagesByConversation.get(run.conversationId) || [];
    const incomingIndex = conversationMessages.findIndex((message) => message.id === incoming.id);
    if (incomingIndex < 0) continue;

    const nextLeadIndex = conversationMessages.findIndex((message, index) => index > incomingIndex && !message.fromMe);
    const searchWindow = nextLeadIndex > incomingIndex
      ? conversationMessages.slice(incomingIndex + 1, nextLeadIndex)
      : conversationMessages.slice(incomingIndex + 1);
    const humanReply = searchWindow.find(isHumanReply);
    if (!humanReply) continue;

    repliesByRun.set(run.id, {
      body: humanReply.body,
      type: humanReply.type,
      timestamp: humanReply.timestamp,
      respondedByName: humanReply.respondedByName || "Consultora",
    });
  }

  return repliesByRun;
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

    const [runs, counts, phaseCounts, reviewed, severeErrors] = await Promise.all([
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
      prisma.aiShadowRun.groupBy({
        by: ["conversationPhase"],
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
    const humanReplies = await loadHumanRepliesForRuns(runs);

    return NextResponse.json({
      summary: {
        counts: counts.map((item) => ({ status: item.status, count: item._count._all })),
        phaseCounts: phaseCounts.map((item) => ({ phase: item.conversationPhase, count: item._count._all })),
        reviewed,
        severeErrors,
      },
      runs: runs.map((run) => ({
        id: run.id,
        status: run.status,
        unit: run.unit,
        contactName: run.contactName,
        contactPhone: run.contactPhone,
        conversationPhase: run.conversationPhase,
        triggerReason: run.triggerReason,
        createdAt: run.createdAt,
        processedAt: run.processedAt,
        context: safeContext(run.context),
        humanReply: humanReplies.get(run.id) || null,
        drafts: run.drafts,
        review: run.reviews[0] || null,
      })),
    });
  } catch (error: any) {
    console.error("[GET /api/crm/ai-shadow/runs]", error);
    return NextResponse.json({ error: "Falha ao carregar avaliações", details: error?.message }, { status: 500 });
  }
}
