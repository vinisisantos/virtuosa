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

function buildHumanRepliesForRuns(
  runs: Array<{ id: string; conversationId: string; incomingMessageId: string | null }>,
  messagesByConversation: Map<string, Array<{
    id: string;
    conversationId: string;
    body: string | null;
    type: string;
    fromMe: boolean;
    timestamp: Date;
    respondedByName: string | null;
  }>>
) {
  const repliesByRun = new Map<string, any>();
  for (const run of runs) {
    if (!run.incomingMessageId) continue;
    const messages = messagesByConversation.get(run.conversationId) || [];
    const incomingIndex = messages.findIndex((message) => message.id === run.incomingMessageId);
    if (incomingIndex < 0) continue;

    const nextLeadIndex = messages.findIndex((message, index) => index > incomingIndex && !message.fromMe);
    const searchWindow = nextLeadIndex > incomingIndex
      ? messages.slice(incomingIndex + 1, nextLeadIndex)
      : messages.slice(incomingIndex + 1);
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
    const unit = searchParams.get("unit") || "Osasco";
    const conversationLimit = Math.max(1, Math.min(50, Number(searchParams.get("limit") || 30)));

    const [readyRuns, counts, phaseCounts, reviewed, severeErrors] = await Promise.all([
      prisma.aiShadowRun.findMany({
        where: { unit, status: "ready" },
        select: { conversationId: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: conversationLimit * 20,
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

    const conversationIds: string[] = [];
    for (const run of readyRuns) {
      if (conversationIds.includes(run.conversationId)) continue;
      conversationIds.push(run.conversationId);
      if (conversationIds.length >= conversationLimit) break;
    }

    if (conversationIds.length === 0) {
      return NextResponse.json({
        summary: {
          counts: counts.map((item) => ({ status: item.status, count: item._count._all })),
          phaseCounts: phaseCounts.map((item) => ({ phase: item.conversationPhase, count: item._count._all })),
          reviewed,
          severeErrors,
        },
        conversations: [],
      });
    }

    const [conversations, runs] = await Promise.all([
      prisma.whatsAppConversation.findMany({
        where: { id: { in: conversationIds } },
        select: {
          id: true,
          status: true,
          assignedToName: true,
          createdAt: true,
          lastMessageAt: true,
          contact: { select: { name: true, phone: true } },
          instance: { select: { name: true, phoneNumber: true, unit: true } },
          messages: {
            orderBy: { timestamp: "asc" },
            select: {
              id: true,
              body: true,
              type: true,
              fromMe: true,
              timestamp: true,
              respondedByName: true,
            },
          },
        },
      }),
      prisma.aiShadowRun.findMany({
        where: {
          unit,
          conversationId: { in: conversationIds },
          status: { in: ["ready", "reviewed"] },
        },
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
        orderBy: { createdAt: "asc" },
      }),
    ]);

    const conversationById = new Map(conversations.map((conversation) => [conversation.id, conversation]));
    const runsByConversation = new Map<string, typeof runs>();
    for (const run of runs) {
      const list = runsByConversation.get(run.conversationId) || [];
      list.push(run);
      runsByConversation.set(run.conversationId, list);
    }

    const messagesByConversation = new Map(
      conversations.map((conversation) => [
        conversation.id,
        conversation.messages.map((message) => ({ ...message, conversationId: conversation.id })),
      ])
    );
    const humanReplies = buildHumanRepliesForRuns(runs, messagesByConversation);
    const order = new Map(conversationIds.map((id, index) => [id, index]));

    const payload = conversations
      .map((conversation) => {
        const conversationRuns = runsByConversation.get(conversation.id) || [];
        const pendingCount = conversationRuns.filter((run) => run.status === "ready").length;
        const reviewedCount = conversationRuns.filter((run) => run.status === "reviewed").length;
        const firstRun = conversationRuns[0];
        const latestRun = [...conversationRuns].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] || firstRun;

        return {
          id: conversation.id,
          status: conversation.status,
          assignedToName: conversation.assignedToName,
          contactName: conversation.contact.name || firstRun?.contactName || null,
          contactPhone: conversation.contact.phone || firstRun?.contactPhone || null,
          instanceName: conversation.instance.name,
          instancePhone: conversation.instance.phoneNumber,
          unit: conversation.instance.unit,
          campaignName: latestRun?.campaignName || null,
          outcome: latestRun?.outcome || null,
          sourceMode: latestRun?.sourceMode || null,
          createdAt: conversation.createdAt,
          lastMessageAt: conversation.lastMessageAt,
          pendingCount,
          reviewedCount,
          totalEvaluations: pendingCount + reviewedCount,
          messages: conversation.messages,
          runs: conversationRuns.map((run) => ({
            id: run.id,
            status: run.status,
            unit: run.unit,
            conversationId: run.conversationId,
            incomingMessageId: run.incomingMessageId,
            contactName: run.contactName,
            contactPhone: run.contactPhone,
            sourceMode: run.sourceMode,
            outcome: run.outcome,
            campaignName: run.campaignName,
            campaignId: run.campaignId,
            conversationPhase: run.conversationPhase,
            triggerReason: run.triggerReason,
            createdAt: run.createdAt,
            processedAt: run.processedAt,
            context: safeContext(run.context),
            humanReply: humanReplies.get(run.id) || null,
            drafts: run.drafts,
            review: run.reviews[0] || null,
          })),
        };
      })
      .sort((a, b) => (order.get(a.id) ?? 9999) - (order.get(b.id) ?? 9999));

    return NextResponse.json({
      summary: {
        counts: counts.map((item) => ({ status: item.status, count: item._count._all })),
        phaseCounts: phaseCounts.map((item) => ({ phase: item.conversationPhase, count: item._count._all })),
        reviewed,
        severeErrors,
      },
      conversations: payload.filter((conversation) => conversationById.has(conversation.id)),
    });
  } catch (error: any) {
    console.error("[GET /api/crm/ai-shadow/conversations]", error);
    return NextResponse.json({ error: "Falha ao carregar conversas para avaliação", details: error?.message }, { status: 500 });
  }
}
