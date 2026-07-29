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
} from "@/lib/ai-public-test";
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
  }));
}

async function requireSession(req: NextRequest, token: string) {
  const link = await findAvailablePublicTestLink(token, { allowReplyLimitReached: true });
  const session = await findPublicTestSession(req, link.id);
  if (!session) throw new PublicAiTestError("Inicie uma nova sessão de teste.", 401, "session_required");
  return { link, session };
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
    return NextResponse.json({
      messages: await publicMessages(session.id),
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
      select: { id: true, clientMessageId: true, role: true, content: true },
    });
    const orderedContextMessages = contextMessages.reverse();
    const generated = await generatePublicTestReply({
      unit: link.unit,
      campaignCreativeId: link.campaignCreativeId,
      messages: orderedContextMessages,
      includeExperimentalCaderno: link.includeExperimentalCaderno,
      conversationState: session.conversationState,
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
    const { session } = await requireSession(req, token);
    const body = await req.json().catch(() => ({}));
    const messageId = typeof body.messageId === "string" ? body.messageId : "";
    const rating = body.rating === "helpful" ? "helpful" : body.rating === "not_helpful" ? "not_helpful" : "";
    const comment = typeof body.comment === "string" ? body.comment.trim().slice(0, 500) : "";
    if (!messageId || !rating) throw new PublicAiTestError("Avaliação inválida.", 400, "invalid_feedback");

    const updated = await prisma.aiPublicTestMessage.updateMany({
      where: { id: messageId, sessionId: session.id, role: "assistant" },
      data: { feedbackRating: rating, feedbackComment: comment || null },
    });
    if (updated.count === 0) throw new PublicAiTestError("Resposta não encontrada.", 404, "message_not_found");
    return NextResponse.json({ saved: true });
  } catch (error: unknown) {
    return responseError(error);
  }
}
