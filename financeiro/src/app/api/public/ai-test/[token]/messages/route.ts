import { NextRequest, NextResponse } from "next/server";
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

function publicMessages(sessionId: string) {
  return prisma.aiPublicTestMessage.findMany({
    where: { sessionId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      role: true,
      content: true,
      feedbackRating: true,
      feedbackComment: true,
      createdAt: true,
    },
  });
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

export async function POST(req: NextRequest, context: { params: Promise<{ token: string }> }) {
  let reservation: { linkId: string; sessionId: string; clientMessageId: string } | null = null;
  try {
    assertPublicTestSameOrigin(req);
    const { token: routeToken } = await context.params;
    const token = publicTestTokenFromRequest(req, routeToken);
    const { link, session } = await requireSession(req, token);
    const body = await req.json().catch(() => ({}));
    const content = typeof body.content === "string" ? body.content.trim().slice(0, AI_PUBLIC_TEST_MAX_INPUT_CHARS) : "";
    const clientMessageId = typeof body.clientMessageId === "string" ? body.clientMessageId.trim().slice(0, 80) : "";
    if (!content) throw new PublicAiTestError("Escreva uma mensagem para continuar.", 400, "empty_message");
    if (!/^[A-Za-z0-9_-]{8,80}$/.test(clientMessageId)) {
      throw new PublicAiTestError("Identificador da mensagem inválido.", 400, "invalid_message_id");
    }

    const duplicate = await prisma.aiPublicTestMessage.findFirst({
      where: { sessionId: session.id, clientMessageId },
      select: { id: true },
    });
    if (duplicate) {
      return NextResponse.json({
        status: session.replyStatus === "processing" ? "processing" : "generated",
        messages: await publicMessages(session.id),
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

      await tx.aiPublicTestMessage.create({
        data: { sessionId: session.id, clientMessageId, role: "client", content },
      });
    });
    reservation = { linkId: link.id, sessionId: session.id, clientMessageId };

    const contextMessages = await prisma.aiPublicTestMessage.findMany({
      where: { sessionId: session.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { role: true, content: true },
    });
    const generated = await generatePublicTestReply({
      unit: link.unit,
      messages: contextMessages.reverse(),
      includeExperimentalCaderno: link.includeExperimentalCaderno,
    });
    const createdAt = Date.now();

    await prisma.$transaction(async (tx) => {
      await tx.aiPublicTestMessage.createMany({
        data: generated.messages.map((message, index) => ({
          sessionId: session.id,
          role: "assistant",
          content: message,
          model: generated.model,
          guardrailFlags: generated.guardrailFlags,
          createdAt: new Date(createdAt + index),
        })),
      });
      await tx.aiPublicTestSession.update({
        where: { id: session.id },
        data: { replyStatus: "idle", lockUntil: null, lastActiveAt: new Date() },
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
          where: { sessionId: reservation.sessionId, clientMessageId: reservation.clientMessageId },
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
