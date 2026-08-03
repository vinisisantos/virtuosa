import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import {
  AI_PUBLIC_TEST_MAX_INPUT_CHARS,
  assertPublicTestSameOrigin,
  findAvailablePublicTestLink,
  findPublicTestSession,
  generatePublicTestReply,
  publicTestTokenFromRequest,
  PublicAiTestError,
  validatePublicExactCorrection,
} from "@/lib/ai-public-test";
import {
  findApprovedCampaignCreative,
  selectRandomApprovedCampaignCreative,
} from "@/lib/ai-campaign-simulation";
import { publicLeadSimulationGreeting } from "@/lib/ai-public-lead-simulation";
import { prisma } from "@/lib/db";

export const maxDuration = 60;

const AI_PUBLIC_TEST_MAX_BATCH_MESSAGES = 5;
const AI_PUBLIC_TEST_MAX_BATCH_CHARS = 4000;

type PublicClientInput = {
  content: string;
  clientMessageId: string;
};

function publicClientBatch(body: Record<string, unknown>) {
  const rawMessages = Array.isArray(body.messages)
    ? body.messages
    : [{ content: body.content, clientMessageId: body.clientMessageId }];
  if (rawMessages.length === 0 || rawMessages.length > AI_PUBLIC_TEST_MAX_BATCH_MESSAGES) {
    throw new PublicAiTestError(
      `Envie entre 1 e ${AI_PUBLIC_TEST_MAX_BATCH_MESSAGES} mensagens por vez.`,
      400,
      "invalid_message_batch",
    );
  }

  const messages: PublicClientInput[] = rawMessages.map((item) => {
    const candidate = item && typeof item === "object" ? item as Record<string, unknown> : {};
    return {
      content: typeof candidate.content === "string"
        ? candidate.content.trim().slice(0, AI_PUBLIC_TEST_MAX_INPUT_CHARS)
        : "",
      clientMessageId: typeof candidate.clientMessageId === "string"
        ? candidate.clientMessageId.trim().slice(0, 80)
        : "",
    };
  });

  if (messages.some((message) => !message.content)) {
    throw new PublicAiTestError("Escreva uma mensagem para continuar.", 400, "empty_message");
  }
  if (messages.some((message) => !/^[A-Za-z0-9_-]{8,80}$/.test(message.clientMessageId))) {
    throw new PublicAiTestError("Identificador da mensagem inválido.", 400, "invalid_message_id");
  }
  if (new Set(messages.map((message) => message.clientMessageId)).size !== messages.length) {
    throw new PublicAiTestError("Existem mensagens repetidas neste envio.", 400, "duplicate_message_id");
  }
  if (messages.reduce((total, message) => total + message.content.length, 0) > AI_PUBLIC_TEST_MAX_BATCH_CHARS) {
    throw new PublicAiTestError("O conjunto de mensagens ficou muito longo.", 413, "message_batch_too_long");
  }
  return messages;
}

function replyToMessageIdsFromAudit(value: Prisma.JsonValue | null) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const candidate = (value as Record<string, Prisma.JsonValue>).replyToMessageIds;
  if (!Array.isArray(candidate)) return [];
  return candidate
    .filter((item): item is string => typeof item === "string")
    .slice(0, AI_PUBLIC_TEST_MAX_BATCH_MESSAGES);
}

type PublicRevisionAudit = {
  version: number;
  mode: "suggestion" | "exact";
  sourceMessageId: string;
  suggestion: string;
  triggerMessageIds: string[];
  acceptedAt: string | null;
};

function jsonRecord(value: Prisma.JsonValue | null): Record<string, Prisma.JsonValue> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, Prisma.JsonValue>
    : null;
}

function publicRevisionFromAudit(value: Prisma.JsonValue | null): PublicRevisionAudit | null {
  const audit = jsonRecord(value);
  const revision = jsonRecord(audit?.publicRevision ?? null);
  if (!revision || typeof revision.sourceMessageId !== "string") return null;
  return {
    version: typeof revision.version === "number" ? revision.version : 1,
    mode: revision.mode === "exact" ? "exact" : "suggestion",
    sourceMessageId: revision.sourceMessageId,
    suggestion: typeof revision.suggestion === "string" ? revision.suggestion : "",
    triggerMessageIds: Array.isArray(revision.triggerMessageIds)
      ? revision.triggerMessageIds.filter((item): item is string => typeof item === "string").slice(0, AI_PUBLIC_TEST_MAX_BATCH_MESSAGES)
      : [],
    acceptedAt: typeof revision.acceptedAt === "string" ? revision.acceptedAt : null,
  };
}

function acceptedStyleExample(messages: Array<{
  role: string;
  content: string;
  feedbackRating: string | null;
  sdrAudit: Prisma.JsonValue | null;
}>) {
  return [...messages].reverse().find((message) => (
    message.role === "assistant"
    && message.feedbackRating === "helpful"
    && !!publicRevisionFromAudit(message.sdrAudit)
  ))?.content || null;
}

async function publicMessages(sessionId: string) {
  const messages = await prisma.aiPublicTestMessage.findMany({
    where: { sessionId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      role: true,
      content: true,
      feedbackRating: true,
      feedbackComment: true,
      sdrAudit: true,
      createdAt: true,
    },
  });
  return messages.map(({ sdrAudit, ...message }) => ({
    ...message,
    replyToMessageIds: message.role === "assistant" ? replyToMessageIdsFromAudit(sdrAudit) : [],
    revisionOfMessageId: message.role === "assistant" ? publicRevisionFromAudit(sdrAudit)?.sourceMessageId || null : null,
    revisionMode: message.role === "assistant" ? publicRevisionFromAudit(sdrAudit)?.mode || null : null,
  }));
}

async function triggerMessagesForAssistant(params: {
  sessionId: string;
  assistant: { createdAt: Date; sdrAudit: Prisma.JsonValue | null };
}) {
  const inheritedTriggerIds = publicRevisionFromAudit(params.assistant.sdrAudit)?.triggerMessageIds || [];
  if (inheritedTriggerIds.length > 0) {
    return prisma.aiPublicTestMessage.findMany({
      where: { id: { in: inheritedTriggerIds }, sessionId: params.sessionId, role: "client" },
      orderBy: { createdAt: "asc" },
      select: { id: true, clientMessageId: true, role: true, content: true, createdAt: true },
    });
  }

  const previousAssistant = await prisma.aiPublicTestMessage.findFirst({
    where: {
      sessionId: params.sessionId,
      role: "assistant",
      createdAt: { lt: params.assistant.createdAt },
    },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  return prisma.aiPublicTestMessage.findMany({
    where: {
      sessionId: params.sessionId,
      role: "client",
      createdAt: {
        ...(previousAssistant ? { gt: previousAssistant.createdAt } : {}),
        lt: params.assistant.createdAt,
      },
    },
    orderBy: { createdAt: "asc" },
    take: AI_PUBLIC_TEST_MAX_BATCH_MESSAGES,
    select: { id: true, clientMessageId: true, role: true, content: true, createdAt: true },
  });
}

async function generationContextForRevision(params: {
  sessionId: string;
  triggerMessages: Array<{
    id: string;
    clientMessageId: string | null;
    role: string;
    content: string;
    createdAt: Date;
  }>;
}) {
  const firstTrigger = params.triggerMessages[0];
  if (!firstTrigger) return [];
  const history = await prisma.aiPublicTestMessage.findMany({
    where: { sessionId: params.sessionId, createdAt: { lt: firstTrigger.createdAt } },
    orderBy: { createdAt: "desc" },
    take: 15,
    select: {
      id: true,
      clientMessageId: true,
      role: true,
      content: true,
      feedbackRating: true,
      sdrAudit: true,
    },
  });
  return [
    ...history.reverse(),
    ...params.triggerMessages.map((message) => ({
      ...message,
      feedbackRating: null,
      sdrAudit: null,
    })),
  ];
}

async function requireSession(req: NextRequest, token: string) {
  const link = await findAvailablePublicTestLink(token, { allowReplyLimitReached: true });
  const session = await findPublicTestSession(req, link.id);
  if (!session) throw new PublicAiTestError("Inicie uma nova sessão de teste.", 401, "session_required");
  return { link, session };
}

function publicCampaign(creative: Awaited<ReturnType<typeof findApprovedCampaignCreative>>) {
  return creative ? {
    name: creative.campaign.name,
    label: creative.label,
  } : null;
}

function responseError(error: unknown) {
  const known = error instanceof PublicAiTestError ? error : null;
  return NextResponse.json({ error: known?.message || "Não foi possível concluir a ação." }, { status: known?.status || 500 });
}

export async function GET(req: NextRequest, context: { params: Promise<{ token: string }> }) {
  try {
    const { token: routeToken } = await context.params;
    const token = publicTestTokenFromRequest(req, routeToken);
    const { link, session } = await requireSession(req, token);
    const [campaign, messages] = await Promise.all([
      findApprovedCampaignCreative(
        link.unit,
        session.campaignCreativeId || link.campaignCreativeId,
      ),
      publicMessages(session.id),
    ]);
    return NextResponse.json({
      messages,
      campaign: publicCampaign(campaign),
      limits: {
        repliesUsed: session.replyCount,
        repliesAllowed: link.maxRepliesPerSession,
      },
      replyStatus: session.replyStatus,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: unknown) {
    return responseError(error);
  }
}

export async function PUT(req: NextRequest, context: { params: Promise<{ token: string }> }) {
  try {
    assertPublicTestSameOrigin(req);
    const { token: routeToken } = await context.params;
    const token = publicTestTokenFromRequest(req, routeToken);
    const { link, session } = await requireSession(req, token);
    const selectedCreative = await selectRandomApprovedCampaignCreative(link.unit);
    if (!selectedCreative) {
      throw new PublicAiTestError(
        `A unidade ${link.unit} ainda não possui uma campanha aprovada e vigente para simular.`,
        409,
        "simulation_campaign_unavailable",
      );
    }
    const greeting = await publicLeadSimulationGreeting(link.unit);

    await prisma.$transaction(async (tx) => {
      const reserved = await tx.aiPublicTestSession.updateMany({
        where: {
          id: session.id,
          status: "active",
          replyStatus: "idle",
        },
        data: { replyStatus: "simulating" },
      });
      if (reserved.count === 0) {
        throw new PublicAiTestError(
          "Aguarde a resposta atual terminar antes de iniciar outra simulação.",
          409,
          "simulation_while_processing",
        );
      }

      await tx.aiPublicTestMessage.deleteMany({ where: { sessionId: session.id } });
      await tx.aiPublicTestMessage.create({
        data: {
          sessionId: session.id,
          role: "assistant",
          content: greeting,
          model: "deterministic:ctwa-welcome-simulation",
          guardrailFlags: ["public_lead_simulation", "ctwa_welcome_without_handoff"],
          campaignPriceSource: "absent",
          sdrAudit: {
            version: 1,
            source: "public_lead_simulation",
            state: {},
            campaignName: selectedCreative.campaign.name,
            styleFindings: [],
            replyToMessageIds: [],
          },
          generationAttempts: 0,
        },
      });
      await tx.aiPublicTestSession.update({
        where: { id: session.id },
        data: {
          campaignCreativeId: selectedCreative.id,
          replyStatus: "idle",
          replyCount: 0,
          lockUntil: null,
          conversationState: Prisma.DbNull,
          lastActiveAt: new Date(),
        },
      });
    });

    return NextResponse.json({
      simulated: true,
      campaign: publicCampaign(selectedCreative),
      messages: await publicMessages(session.id),
      limits: {
        repliesUsed: 0,
        repliesAllowed: link.maxRepliesPerSession,
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: unknown) {
    console.error("[PUT /api/public/ai-test/:token/messages]", error instanceof PublicAiTestError ? error.code : error);
    return responseError(error);
  }
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ token: string }> }) {
  try {
    assertPublicTestSameOrigin(req);
    const { token: routeToken } = await context.params;
    const token = publicTestTokenFromRequest(req, routeToken);
    const { link, session } = await requireSession(req, token);

    await prisma.$transaction(async (tx) => {
      const reserved = await tx.aiPublicTestSession.updateMany({
        where: {
          id: session.id,
          status: "active",
          replyStatus: "idle",
        },
        data: { replyStatus: "resetting" },
      });
      if (reserved.count === 0) {
        throw new PublicAiTestError(
          "Aguarde a resposta atual terminar antes de reiniciar.",
          409,
          "reset_while_processing",
        );
      }

      await tx.aiPublicTestMessage.deleteMany({
        where: { sessionId: session.id },
      });
      await tx.aiPublicTestSession.update({
        where: { id: session.id },
        data: {
          replyStatus: "idle",
          replyCount: 0,
          lockUntil: null,
          conversationState: Prisma.DbNull,
          lastActiveAt: new Date(),
        },
      });
    });

    return NextResponse.json({
      reset: true,
      messages: [],
      limits: {
        repliesUsed: 0,
        repliesAllowed: link.maxRepliesPerSession,
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: unknown) {
    console.error("[DELETE /api/public/ai-test/:token/messages]", error instanceof PublicAiTestError ? error.code : error);
    return responseError(error);
  }
}

export async function POST(req: NextRequest, context: { params: Promise<{ token: string }> }) {
  let reservation: { linkId: string; sessionId: string; clientMessageIds: string[] } | null = null;
  try {
    assertPublicTestSameOrigin(req);
    const { token: routeToken } = await context.params;
    const token = publicTestTokenFromRequest(req, routeToken);
    const { link, session } = await requireSession(req, token);
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const clientMessages = publicClientBatch(body);
    const clientMessageIds = clientMessages.map((message) => message.clientMessageId);

    const duplicate = await prisma.aiPublicTestMessage.findFirst({
      where: { sessionId: session.id, clientMessageId: { in: clientMessageIds } },
      select: { id: true },
    });
    if (duplicate) {
      return NextResponse.json({
        status: session.replyStatus === "processing" ? "processing" : "generated",
        messages: await publicMessages(session.id),
        limits: { repliesUsed: session.replyCount, repliesAllowed: link.maxRepliesPerSession },
      });
    }

    const now = new Date();
    if (session.replyStatus === "processing" && session.lockUntil && session.lockUntil > now) {
      throw new PublicAiTestError("A IA ainda está respondendo à mensagem anterior.", 409, "reply_in_progress");
    }
    if (session.replyStatus === "processing") {
      await prisma.aiPublicTestSession.updateMany({
        where: { id: session.id, lockUntil: { lte: now } },
        data: { replyStatus: "idle", lockUntil: null },
      });
    }

    const lockUntil = new Date(Date.now() + 70_000);
    await prisma.$transaction(async (tx) => {
      const sessionReserved = await tx.aiPublicTestSession.updateMany({
        where: {
          id: session.id,
          status: "active",
          replyStatus: "idle",
          replyCount: { lt: link.maxRepliesPerSession },
        },
        data: {
          replyStatus: "processing",
          lockUntil,
          replyCount: { increment: 1 },
          lastActiveAt: now,
        },
      });
      if (sessionReserved.count === 0) {
        throw new PublicAiTestError("O limite de respostas desta sessão foi atingido.", 429, "session_reply_limit");
      }

      const linkReserved = await tx.aiPublicTestLink.updateMany({
        where: {
          id: link.id,
          status: "active",
          revokedAt: null,
          expiresAt: { gt: now },
          replyCount: { lt: link.maxTotalReplies },
        },
        data: { replyCount: { increment: 1 } },
      });
      if (linkReserved.count === 0) {
        throw new PublicAiTestError("O limite de respostas deste teste foi atingido.", 429, "link_reply_limit");
      }

      await tx.aiPublicTestMessage.createMany({
        data: clientMessages.map((message, index) => ({
          sessionId: session.id,
          clientMessageId: message.clientMessageId,
          role: "client",
          content: message.content,
          createdAt: new Date(now.getTime() + index),
        })),
      });
    });
    reservation = { linkId: link.id, sessionId: session.id, clientMessageIds };

    const contextMessages = await prisma.aiPublicTestMessage.findMany({
      where: { sessionId: session.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        clientMessageId: true,
        role: true,
        content: true,
        feedbackRating: true,
        sdrAudit: true,
      },
    });
    const orderedContextMessages = contextMessages.reverse();
    const generated = await generatePublicTestReply({
      sessionId: session.id,
      unit: link.unit,
      campaignCreativeId: session.campaignCreativeId || link.campaignCreativeId,
      messages: orderedContextMessages,
      includeExperimentalCaderno: link.includeExperimentalCaderno,
      conversationState: session.conversationState,
      acceptedStyleExample: acceptedStyleExample(orderedContextMessages),
    });
    const requestedClientMessageIds = new Set(generated.replyToClientMessageIds);
    const replyToMessageIds = orderedContextMessages
      .filter((message) => (
        message.role === "client"
        && !!message.clientMessageId
        && requestedClientMessageIds.has(message.clientMessageId)
      ))
      .map((message) => message.id)
      .slice(0, AI_PUBLIC_TEST_MAX_BATCH_MESSAGES);
    const createdAt = Date.now();

    await prisma.$transaction(async (tx) => {
      await tx.aiPublicTestMessage.createMany({
        data: generated.messages.map((message, index) => ({
          sessionId: session.id,
          role: "assistant",
          content: message,
          model: generated.model,
          guardrailFlags: generated.guardrailFlags,
          campaignPriceSource: generated.priceAudit.source,
          campaignPriceAudit: generated.priceAudit,
          sdrAudit: {
            ...generated.sdrAudit,
            replyToMessageIds: index === 0 ? replyToMessageIds : [],
          },
          promptTokens: generated.promptTokens,
          completionTokens: generated.completionTokens,
          latencyMs: generated.latencyMs,
          generationAttempts: generated.generationAttempts,
          createdAt: new Date(createdAt + index),
        })),
      });
      await tx.aiPublicTestSession.update({
        where: { id: session.id },
        data: {
          replyStatus: "idle",
          lockUntil: null,
          conversationState: generated.sdrState,
          lastActiveAt: new Date(),
        },
      });
    });
    reservation = null;

    return NextResponse.json({
      status: "generated",
      messages: await publicMessages(session.id),
      limits: { repliesUsed: session.replyCount + 1, repliesAllowed: link.maxRepliesPerSession },
    });
  } catch (error: unknown) {
    if (reservation) {
      await prisma.$transaction([
        prisma.aiPublicTestMessage.deleteMany({
          where: { sessionId: reservation.sessionId, clientMessageId: { in: reservation.clientMessageIds } },
        }),
        prisma.aiPublicTestSession.updateMany({
          where: { id: reservation.sessionId },
          data: { replyStatus: "idle", lockUntil: null, replyCount: { decrement: 1 } },
        }),
        prisma.aiPublicTestLink.updateMany({
          where: { id: reservation.linkId },
          data: { replyCount: { decrement: 1 } },
        }),
      ]).catch(() => undefined);
    }
    console.error("[POST /api/public/ai-test/:token/messages]", error instanceof PublicAiTestError ? error.code : error);
    return responseError(error);
  }
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ token: string }> }) {
  try {
    assertPublicTestSameOrigin(req);
    const { token: routeToken } = await context.params;
    const token = publicTestTokenFromRequest(req, routeToken);
    const { link, session } = await requireSession(req, token);
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const messageId = typeof body.messageId === "string" ? body.messageId : "";
    const action = typeof body.action === "string" ? body.action : "feedback";
    if (!messageId) throw new PublicAiTestError("Resposta não encontrada.", 404, "message_not_found");

    if (action === "revise") {
      const suggestion = typeof body.suggestion === "string" ? body.suggestion.trim().slice(0, 1000) : "";
      const revisionMode = body.mode === "exact" ? "exact" : "suggestion";
      if (suggestion.length < 5) {
        throw new PublicAiTestError("Explique como a resposta deveria ficar.", 400, "revision_suggestion_required");
      }
      if (revisionMode === "exact") {
        const exactCorrectionError = validatePublicExactCorrection(suggestion);
        if (exactCorrectionError) {
          throw new PublicAiTestError(exactCorrectionError, 400, "unsafe_exact_correction");
        }
      }

      const revisionClientMessageId = `revision_${messageId}`;
      const existingRevision = await prisma.aiPublicTestMessage.findFirst({
        where: { sessionId: session.id, clientMessageId: revisionClientMessageId, role: "assistant" },
        select: { id: true },
      });
      if (existingRevision) {
        return NextResponse.json({
          revised: true,
          messages: await publicMessages(session.id),
          limits: { repliesUsed: session.replyCount, repliesAllowed: link.maxRepliesPerSession },
        });
      }

      const sourceMessage = await prisma.aiPublicTestMessage.findFirst({
        where: { id: messageId, sessionId: session.id, role: "assistant" },
        select: { id: true, content: true, createdAt: true, sdrAudit: true },
      });
      if (!sourceMessage) throw new PublicAiTestError("Resposta não encontrada.", 404, "message_not_found");

      const triggerMessages = await triggerMessagesForAssistant({ sessionId: session.id, assistant: sourceMessage });
      if (triggerMessages.length === 0) {
        throw new PublicAiTestError("Não foi possível recuperar a pergunta original.", 409, "revision_trigger_missing");
      }

      const now = new Date();
      if (session.replyStatus === "processing" && session.lockUntil && session.lockUntil > now) {
        throw new PublicAiTestError("A IA ainda está preparando outra resposta.", 409, "reply_in_progress");
      }
      if (session.replyStatus === "processing") {
        await prisma.aiPublicTestSession.updateMany({
          where: { id: session.id, lockUntil: { lte: now } },
          data: { replyStatus: "idle", lockUntil: null },
        });
      }

      let reserved = false;
      try {
        const lockUntil = new Date(Date.now() + 70_000);
        await prisma.$transaction(async (tx) => {
          const sessionReserved = await tx.aiPublicTestSession.updateMany({
            where: {
              id: session.id,
              status: "active",
              replyStatus: "idle",
              replyCount: { lt: link.maxRepliesPerSession },
            },
            data: {
              replyStatus: "processing",
              lockUntil,
              replyCount: { increment: 1 },
              lastActiveAt: now,
            },
          });
          if (sessionReserved.count === 0) {
            throw new PublicAiTestError("O limite de respostas desta sessão foi atingido.", 429, "session_reply_limit");
          }

          const linkReserved = await tx.aiPublicTestLink.updateMany({
            where: {
              id: link.id,
              status: "active",
              revokedAt: null,
              expiresAt: { gt: now },
              replyCount: { lt: link.maxTotalReplies },
            },
            data: { replyCount: { increment: 1 } },
          });
          if (linkReserved.count === 0) {
            throw new PublicAiTestError("O limite de respostas deste teste foi atingido.", 429, "link_reply_limit");
          }

          await tx.aiPublicTestMessage.update({
            where: { id: sourceMessage.id },
            data: { feedbackRating: "not_helpful", feedbackComment: suggestion },
          });
        });
        reserved = true;

        if (revisionMode === "exact") {
          const triggerMessageIds = triggerMessages.map((message) => message.id);
          await prisma.$transaction(async (tx) => {
            await tx.aiPublicTestMessage.create({
              data: {
                sessionId: session.id,
                clientMessageId: revisionClientMessageId,
                role: "assistant",
                content: suggestion,
                model: "manual:public-feedback",
                guardrailFlags: ["public_manual_correction"],
                sdrAudit: {
                  version: 1,
                  source: "manual_correction",
                  state: session.conversationState || {},
                  styleFindings: [],
                  replyToMessageIds: [],
                  publicRevision: {
                    version: 1,
                    mode: revisionMode,
                    sourceMessageId: sourceMessage.id,
                    suggestion,
                    triggerMessageIds,
                    acceptedAt: null,
                  },
                },
                generationAttempts: 0,
              },
            });
            await tx.aiPublicTestSession.update({
              where: { id: session.id },
              data: { replyStatus: "idle", lockUntil: null, lastActiveAt: new Date() },
            });
          });
          reserved = false;
          return NextResponse.json({
            revised: true,
            revisionMode,
            messages: await publicMessages(session.id),
            limits: { repliesUsed: session.replyCount + 1, repliesAllowed: link.maxRepliesPerSession },
          });
        }

        const revisionContext = await generationContextForRevision({
          sessionId: session.id,
          triggerMessages,
        });
        const generated = await generatePublicTestReply({
          sessionId: session.id,
          unit: link.unit,
          campaignCreativeId: session.campaignCreativeId || link.campaignCreativeId,
          messages: revisionContext,
          includeExperimentalCaderno: link.includeExperimentalCaderno,
          conversationState: session.conversationState,
          acceptedStyleExample: acceptedStyleExample(revisionContext),
          revisionRequest: {
            originalAnswer: sourceMessage.content,
            suggestion,
          },
        });
        const requestedClientMessageIds = new Set(generated.replyToClientMessageIds);
        const replyToMessageIds = triggerMessages
          .filter((message) => !!message.clientMessageId && requestedClientMessageIds.has(message.clientMessageId))
          .map((message) => message.id)
          .slice(0, AI_PUBLIC_TEST_MAX_BATCH_MESSAGES);
        const triggerMessageIds = triggerMessages.map((message) => message.id);
        const createdAt = Date.now();

        await prisma.$transaction(async (tx) => {
          await tx.aiPublicTestMessage.createMany({
            data: generated.messages.map((message, index) => ({
              sessionId: session.id,
              clientMessageId: index === 0 ? revisionClientMessageId : null,
              role: "assistant",
              content: message,
              model: generated.model,
              guardrailFlags: generated.guardrailFlags,
              campaignPriceSource: generated.priceAudit.source,
              campaignPriceAudit: generated.priceAudit,
              sdrAudit: {
                ...generated.sdrAudit,
                replyToMessageIds: index === 0 ? replyToMessageIds : [],
                publicRevision: {
                  version: 1,
                  mode: revisionMode,
                  sourceMessageId: sourceMessage.id,
                  suggestion,
                  triggerMessageIds,
                  acceptedAt: null,
                },
              },
              promptTokens: generated.promptTokens,
              completionTokens: generated.completionTokens,
              latencyMs: generated.latencyMs,
              generationAttempts: generated.generationAttempts,
              createdAt: new Date(createdAt + index),
            })),
          });
          await tx.aiPublicTestSession.update({
            where: { id: session.id },
            data: {
              replyStatus: "idle",
              lockUntil: null,
              conversationState: generated.sdrState,
              lastActiveAt: new Date(),
            },
          });
        });
        reserved = false;

        return NextResponse.json({
          revised: true,
          messages: await publicMessages(session.id),
          limits: { repliesUsed: session.replyCount + 1, repliesAllowed: link.maxRepliesPerSession },
        });
      } catch (error) {
        if (reserved) {
          await prisma.$transaction([
            prisma.aiPublicTestSession.updateMany({
              where: { id: session.id },
              data: { replyStatus: "idle", lockUntil: null, replyCount: { decrement: 1 } },
            }),
            prisma.aiPublicTestLink.updateMany({
              where: { id: link.id },
              data: { replyCount: { decrement: 1 } },
            }),
          ]).catch(() => undefined);
        }
        throw error;
      }
    }

    const rating = body.rating === "helpful" ? "helpful" : body.rating === "not_helpful" ? "not_helpful" : "";
    const comment = typeof body.comment === "string" ? body.comment.trim().slice(0, 500) : "";
    if (!rating) throw new PublicAiTestError("Avaliação inválida.", 400, "invalid_feedback");

    const message = await prisma.aiPublicTestMessage.findFirst({
      where: { id: messageId, sessionId: session.id, role: "assistant" },
      select: { id: true, content: true, createdAt: true, sdrAudit: true },
    });
    if (!message) throw new PublicAiTestError("Resposta não encontrada.", 404, "message_not_found");

    const revision = publicRevisionFromAudit(message.sdrAudit);
    if (rating === "helpful" && revision) {
      const triggerMessages = await triggerMessagesForAssistant({ sessionId: session.id, assistant: message });
      const sourceMessage = await prisma.aiPublicTestMessage.findFirst({
        where: { id: revision.sourceMessageId, sessionId: session.id, role: "assistant" },
        select: { content: true },
      });
      const triggerText = triggerMessages.map((item) => item.content).join("\n").trim();
      if (!triggerText || !sourceMessage) {
        throw new PublicAiTestError("Não foi possível registrar esta sugestão.", 409, "revision_audit_incomplete");
      }

      const acceptedAt = new Date();
      const currentAudit = jsonRecord(message.sdrAudit) || {};
      await prisma.$transaction(async (tx) => {
        await tx.aiPublicTestMessage.update({
          where: { id: message.id },
          data: {
            feedbackRating: "helpful",
            feedbackComment: comment || null,
            sdrAudit: {
              ...currentAudit,
              publicRevision: { ...revision, acceptedAt: acceptedAt.toISOString() },
            },
          },
        });
        await tx.aiTrainingMemory.upsert({
          where: { sourceReference: `public-test:${message.id}` },
          update: {
            unit: link.unit,
            triggerText,
            originalAnswer: sourceMessage.content,
            correctedAnswer: message.content,
            createdByName: `Link de teste · ${link.title}`,
          },
          create: {
            unit: link.unit,
            sourceType: "public_link_suggestion",
            sourceReference: `public-test:${message.id}`,
            triggerText,
            originalAnswer: sourceMessage.content,
            correctedAnswer: message.content,
            category: "response_example",
            status: "pending",
            riskFlags: ["public_link_unreviewed"],
            createdByName: `Link de teste · ${link.title}`,
          },
        });
      });
      return NextResponse.json({ saved: true, queuedForReview: true });
    }

    const updated = await prisma.aiPublicTestMessage.updateMany({
      where: { id: messageId, sessionId: session.id, role: "assistant" },
      data: { feedbackRating: rating, feedbackComment: comment || null },
    });
    if (updated.count === 0) throw new PublicAiTestError("Resposta não encontrada.", 404, "message_not_found");
    return NextResponse.json({ saved: true, queuedForReview: false });
  } catch (error: unknown) {
    return responseError(error);
  }
}
