import { NextRequest, NextResponse } from "next/server";
import { getUserFromHeaders } from "@/lib/auth";
import { canAccessAiTrainingUnit, canUseAiTraining } from "@/lib/ai-training";
import { prisma } from "@/lib/db";

const MAX_TRAINING_MESSAGES_PER_USER_DAY = 200;
const AI_TRAINING_REPLY_DELAY_MS = 20_000;

export const maxDuration = 60;

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : undefined;
}

export async function POST(req: NextRequest) {
  try {
    const user = getUserFromHeaders(req);
    if (!canUseAiTraining(user)) return NextResponse.json({ error: "Sem permissão para usar o treinamento da IA" }, { status: user ? 403 : 401 });
    const body = await req.json().catch(() => ({}));
    const conversationId = text(body.conversationId, 120);
    const content = text(body.content, 4000);
    if (!conversationId || !content) return NextResponse.json({ error: "Chat e mensagem são obrigatórios" }, { status: 400 });

    const conversation = await prisma.aiTrainingConversation.findUnique({
      where: { id: conversationId },
      select: { id: true, unit: true, title: true },
    });
    if (!conversation) return NextResponse.json({ error: "Chat não encontrado" }, { status: 404 });
    if (!canAccessAiTrainingUnit(user!, conversation.unit)) {
      return NextResponse.json({ error: "Sem acesso a esta unidade" }, { status: 403 });
    }

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const messagesToday = await prisma.aiTrainingMessage.count({
      where: {
        role: "client",
        createdById: user!.userId,
        createdAt: { gte: startOfDay },
      },
    });
    if (messagesToday >= MAX_TRAINING_MESSAGES_PER_USER_DAY) {
      return NextResponse.json({ error: `Limite diário de ${MAX_TRAINING_MESSAGES_PER_USER_DAY} testes atingido` }, { status: 429 });
    }

    const replyDueAt = new Date(Date.now() + AI_TRAINING_REPLY_DELAY_MS);
    const result = await prisma.$transaction(async (tx) => {
      const scheduledConversation = await tx.aiTrainingConversation.update({
        where: { id: conversationId },
        data: {
          title: !conversation.title || conversation.title === "Nova simulação" ? content.slice(0, 70) : conversation.title,
          replyDueAt,
          replyStatus: "pending",
          replyVersion: { increment: 1 },
        },
        select: { replyDueAt: true, replyStatus: true, replyVersion: true },
      });
      const userMessage = await tx.aiTrainingMessage.create({
        data: {
          conversationId,
          role: "client",
          content,
          createdById: user!.userId,
          createdByName: user!.name || user!.email,
        },
      });
      return { userMessage, reply: scheduledConversation };
    });

    return NextResponse.json(result, { status: 202 });
  } catch (error: unknown) {
    console.error("[POST /api/crm/ai-shadow/training/messages]", error);
    return NextResponse.json({ error: "Falha ao registrar mensagem", details: errorMessage(error) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = getUserFromHeaders(req);
    if (!canUseAiTraining(user)) return NextResponse.json({ error: "Sem permissão para treinar a IA" }, { status: user ? 403 : 401 });
    const body = await req.json().catch(() => ({}));
    const messageId = text(body.messageId, 120);
    const content = text(body.content, 4000);
    if (!messageId || !content) return NextResponse.json({ error: "Mensagem e correção são obrigatórias" }, { status: 400 });

    const message = await prisma.aiTrainingMessage.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        role: true,
        content: true,
        originalContent: true,
        conversationId: true,
        createdAt: true,
        conversation: { select: { unit: true } },
      },
    });
    if (!message) return NextResponse.json({ error: "Mensagem não encontrada" }, { status: 404 });
    if (message.role !== "assistant") return NextResponse.json({ error: "Somente respostas da IA podem ser corrigidas" }, { status: 400 });
    if (!canAccessAiTrainingUnit(user!, message.conversation.unit)) {
      return NextResponse.json({ error: "Sem acesso a esta unidade" }, { status: 403 });
    }

    const latestClientTrigger = await prisma.aiTrainingMessage.findFirst({
      where: {
        conversationId: message.conversationId,
        role: "client",
        createdAt: { lte: message.createdAt },
      },
      orderBy: { createdAt: "desc" },
      select: { content: true, createdAt: true },
    });
    if (!latestClientTrigger) return NextResponse.json({ error: "Não foi encontrada a pergunta que originou esta resposta" }, { status: 409 });

    const previousAssistant = await prisma.aiTrainingMessage.findFirst({
      where: {
        conversationId: message.conversationId,
        role: "assistant",
        createdAt: { lt: latestClientTrigger.createdAt },
      },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    const triggerMessages = await prisma.aiTrainingMessage.findMany({
      where: {
        conversationId: message.conversationId,
        role: "client",
        createdAt: {
          ...(previousAssistant ? { gt: previousAssistant.createdAt } : {}),
          lte: latestClientTrigger.createdAt,
        },
      },
      orderBy: { createdAt: "asc" },
      take: 8,
      select: { content: true },
    });
    const triggerText = triggerMessages.map((item) => item.content).join("\n");

    const result = await prisma.$transaction(async (tx) => {
      const updatedMessage = await tx.aiTrainingMessage.update({
        where: { id: message.id },
        data: {
          content,
          originalContent: message.originalContent || message.content,
          editedById: user!.userId,
          editedByName: user!.name || user!.email,
          editedAt: new Date(),
        },
      });
      const memory = await tx.aiTrainingMemory.upsert({
        where: { sourceReference: `chat:${message.id}` },
        update: {
          triggerText,
          originalAnswer: message.originalContent || message.content,
          correctedAnswer: content,
          status: "pending",
          reviewedById: null,
          reviewedByName: null,
          reviewedAt: null,
          createdById: user!.userId,
          createdByName: user!.name || user!.email,
        },
        create: {
          unit: message.conversation.unit,
          sourceType: "chat_correction",
          sourceReference: `chat:${message.id}`,
          sourceConversationId: message.conversationId,
          triggerText,
          originalAnswer: message.originalContent || message.content,
          correctedAnswer: content,
          category: "response_example",
          status: "pending",
          riskFlags: [],
          createdById: user!.userId,
          createdByName: user!.name || user!.email,
        },
      });
      return { updatedMessage, memory };
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error("[PATCH /api/crm/ai-shadow/training/messages]", error);
    return NextResponse.json({ error: "Falha ao salvar correção", details: errorMessage(error) }, { status: 500 });
  }
}
