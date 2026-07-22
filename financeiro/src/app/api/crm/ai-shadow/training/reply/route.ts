import { NextRequest, NextResponse } from "next/server";
import { getUserFromHeaders } from "@/lib/auth";
import { canAccessAiTrainingUnit, canUseAiTraining, generateAiTrainingReply } from "@/lib/ai-training";
import { prisma } from "@/lib/db";

const GENERATION_LOCK_MS = 70_000;

export const maxDuration = 60;

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : undefined;
}

export async function POST(req: NextRequest) {
  let claimed: { conversationId: string; replyVersion: number } | null = null;

  try {
    const user = getUserFromHeaders(req);
    if (!canUseAiTraining(user)) {
      return NextResponse.json({ error: "Sem permissão para usar o treinamento da IA" }, { status: user ? 403 : 401 });
    }

    const body = await req.json().catch(() => ({}));
    const conversationId = text(body.conversationId, 120);
    const requestedVersion = Number(body.replyVersion);
    const retry = body.retry === true;
    const includeExperimentalCaderno = body.includeExperimentalCaderno !== false;
    if (!conversationId || !Number.isInteger(requestedVersion) || requestedVersion < 1) {
      return NextResponse.json({ error: "Chat e versão da resposta são obrigatórios" }, { status: 400 });
    }

    const conversation = await prisma.aiTrainingConversation.findUnique({
      where: { id: conversationId },
      select: {
        id: true,
        unit: true,
        replyDueAt: true,
        replyStatus: true,
        replyVersion: true,
      },
    });
    if (!conversation) return NextResponse.json({ error: "Chat não encontrado" }, { status: 404 });
    if (!canAccessAiTrainingUnit(user!, conversation.unit)) {
      return NextResponse.json({ error: "Sem acesso a esta unidade" }, { status: 403 });
    }
    if (conversation.replyVersion !== requestedVersion) {
      return NextResponse.json({
        status: "superseded",
        replyDueAt: conversation.replyDueAt,
        replyStatus: conversation.replyStatus,
        replyVersion: conversation.replyVersion,
      }, { status: 202 });
    }
    if (conversation.replyStatus === "idle") {
      return NextResponse.json({ status: "idle", replyVersion: conversation.replyVersion });
    }
    if (conversation.replyStatus === "failed" && !retry) {
      return NextResponse.json({ status: "failed", replyVersion: conversation.replyVersion });
    }

    const now = new Date();
    const lockUntil = new Date(now.getTime() + GENERATION_LOCK_MS);
    const claim = await prisma.aiTrainingConversation.updateMany({
      where: {
        id: conversationId,
        replyVersion: requestedVersion,
        OR: [
          { replyStatus: "pending", replyDueAt: { lte: now } },
          { replyStatus: "processing", replyDueAt: { lte: now } },
          ...(retry ? [{ replyStatus: "failed" }] : []),
        ],
      },
      data: { replyStatus: "processing", replyDueAt: lockUntil },
    });
    if (claim.count === 0) {
      const current = await prisma.aiTrainingConversation.findUnique({
        where: { id: conversationId },
        select: { replyDueAt: true, replyStatus: true, replyVersion: true },
      });
      return NextResponse.json({ status: "waiting", ...current }, { status: 202 });
    }
    claimed = { conversationId, replyVersion: requestedVersion };

    const contextMessages = await prisma.aiTrainingMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { role: true, content: true },
    });
    const generated = await generateAiTrainingReply({
      unit: conversation.unit,
      messages: contextMessages.reverse(),
      includeExperimentalCaderno,
    });
    const createdAt = Date.now();

    const saved = await prisma.$transaction(async (tx) => {
      const finalized = await tx.aiTrainingConversation.updateMany({
        where: {
          id: conversationId,
          replyStatus: "processing",
          replyVersion: requestedVersion,
        },
        data: { replyStatus: "idle", replyDueAt: null },
      });
      if (finalized.count === 0) return false;

      await tx.aiTrainingMessage.createMany({
        data: generated.messages.map((content, index) => ({
          conversationId,
          role: "assistant",
          content,
          model: generated.model,
          guardrailFlags: generated.guardrailFlags,
          createdById: user!.userId,
          createdByName: user!.name || user!.email,
          createdAt: new Date(createdAt + index),
        })),
      });
      return true;
    });

    claimed = null;
    if (!saved) {
      return NextResponse.json({ status: "superseded", replyVersion: requestedVersion }, { status: 202 });
    }
    return NextResponse.json({ status: "generated", generation: generated });
  } catch (error: unknown) {
    if (claimed) {
      await prisma.aiTrainingConversation.updateMany({
        where: {
          id: claimed.conversationId,
          replyStatus: "processing",
          replyVersion: claimed.replyVersion,
        },
        data: { replyStatus: "failed", replyDueAt: null },
      }).catch(() => undefined);
    }
    console.error("[POST /api/crm/ai-shadow/training/reply]", error);
    return NextResponse.json({ error: "A IA não conseguiu responder", details: errorMessage(error) }, { status: 500 });
  }
}
