import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getUserFromHeaders } from "@/lib/auth";
import { canAccessAiTrainingUnit, canUseAiTraining } from "@/lib/ai-training";
import {
  AI_TRAINING_DIAGRAM_V6_RUNTIME,
  advanceAiTrainingDiagramV6FollowUp,
  aiTrainingDiagramV6MessageAudit,
  isAiTrainingDiagramV6State,
} from "@/lib/ai-training-diagram-v6";
import {
  AI_TRAINING_DIAGRAM_V7_RUNTIME,
  advanceAiTrainingDiagramV7FollowUp,
  aiTrainingDiagramV7MessageAudit,
  isAiTrainingDiagramV7State,
} from "@/lib/ai-training-diagram-v7";
import { prisma } from "@/lib/db";
import { AI_TRAINING_BARRIGA_LEARNED_RUNTIME } from "@/lib/ai-training-barriga-learned";

const MAX_TRAINING_MESSAGES_PER_USER_DAY = 200;
const MAX_BARRIGA_LEARNED_MESSAGES_PER_USER_DAY = 50;
const AI_TRAINING_REPLY_DELAY_MS = 10_000;

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
    const action = text(body.action, 60);
    if (!conversationId || (!content && action !== "advance_follow_up")) {
      return NextResponse.json({ error: "Chat e mensagem são obrigatórios" }, { status: 400 });
    }

    const conversation = await prisma.aiTrainingConversation.findUnique({
      where: { id: conversationId },
      select: {
        id: true,
        unit: true,
        title: true,
        runtimeVersion: true,
        conversationState: true,
        replyStatus: true,
        replyVersion: true,
      },
    });
    if (!conversation) return NextResponse.json({ error: "Chat não encontrado" }, { status: 404 });
    if (!canAccessAiTrainingUnit(user!, conversation.unit)) {
      return NextResponse.json({ error: "Sem acesso a esta unidade" }, { status: 403 });
    }

    if (action === "advance_follow_up") {
      const diagramV6State = conversation.runtimeVersion === AI_TRAINING_DIAGRAM_V6_RUNTIME && isAiTrainingDiagramV6State(conversation.conversationState)
        ? conversation.conversationState
        : null;
      const diagramV7State = conversation.runtimeVersion === AI_TRAINING_DIAGRAM_V7_RUNTIME && isAiTrainingDiagramV7State(conversation.conversationState)
        ? conversation.conversationState
        : null;
      if (!diagramV6State && !diagramV7State) {
        return NextResponse.json({ error: "Follow-up manual disponível somente nos runtimes isolados" }, { status: 409 });
      }
      if (["pending", "processing"].includes(conversation.replyStatus)) {
        return NextResponse.json({ error: "Aguarde a resposta atual antes de avançar o follow-up" }, { status: 409 });
      }
      const advanced = diagramV7State
        ? advanceAiTrainingDiagramV7FollowUp(diagramV7State)
        : advanceAiTrainingDiagramV6FollowUp(diagramV6State!);
      const isV7 = diagramV7State !== null;
      const createdAt = Date.now();
      const result = await prisma.$transaction(async (tx) => {
        const claimed = await tx.aiTrainingConversation.updateMany({
          where: { id: conversationId, replyVersion: conversation.replyVersion },
          data: {
            conversationState: advanced.state as unknown as Prisma.InputJsonValue,
            replyVersion: { increment: 1 },
          },
        });
        if (claimed.count === 0) return null;
        await tx.aiTrainingMessage.createMany({
          data: advanced.messages.map((message, index) => ({
            conversationId,
            role: "assistant",
            content: message.content,
            model: isV7 ? "deterministic:diagram-v7-follow-up" : "deterministic:diagram-v6-follow-up",
            guardrailFlags: advanced.guardrailFlags,
            sdrAudit: (isV7
              ? aiTrainingDiagramV7MessageAudit({ state: advanced.state as ReturnType<typeof advanceAiTrainingDiagramV7FollowUp>["state"], mediaKey: "mediaKey" in message ? message.mediaKey : undefined })
              : aiTrainingDiagramV6MessageAudit({ state: advanced.state as ReturnType<typeof advanceAiTrainingDiagramV6FollowUp>["state"], mediaKey: "mediaKey" in message ? message.mediaKey : undefined })) as Prisma.InputJsonValue,
            createdById: user!.userId,
            createdByName: user!.name || user!.email,
            createdAt: new Date(createdAt + index),
          })),
        });
        return advanced;
      });
      if (!result) {
        return NextResponse.json({ error: "O follow-up já foi avançado em outra atualização" }, { status: 409 });
      }
      return NextResponse.json({ status: "advanced", followUp: result });
    }

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const isBarrigaLearned = conversation.runtimeVersion === AI_TRAINING_BARRIGA_LEARNED_RUNTIME;
    const dailyLimit = isBarrigaLearned ? MAX_BARRIGA_LEARNED_MESSAGES_PER_USER_DAY : MAX_TRAINING_MESSAGES_PER_USER_DAY;
    const messagesToday = await prisma.aiTrainingMessage.count({
      where: {
        role: "client",
        createdById: user!.userId,
        createdAt: { gte: startOfDay },
        conversation: isBarrigaLearned
          ? { runtimeVersion: AI_TRAINING_BARRIGA_LEARNED_RUNTIME }
          : { runtimeVersion: { not: AI_TRAINING_BARRIGA_LEARNED_RUNTIME } },
      },
    });
    if (messagesToday >= dailyLimit) {
      return NextResponse.json({ error: `Limite diário de ${dailyLimit} testes atingido` }, { status: 429 });
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
        conversation: { select: { unit: true, runtimeVersion: true } },
      },
    });
    if (!message) return NextResponse.json({ error: "Mensagem não encontrada" }, { status: 404 });
    if (message.role !== "assistant") return NextResponse.json({ error: "Somente respostas da IA podem ser corrigidas" }, { status: 400 });
    if (!canAccessAiTrainingUnit(user!, message.conversation.unit)) {
      return NextResponse.json({ error: "Sem acesso a esta unidade" }, { status: 403 });
    }
    if ([AI_TRAINING_DIAGRAM_V6_RUNTIME, AI_TRAINING_DIAGRAM_V7_RUNTIME, AI_TRAINING_BARRIGA_LEARNED_RUNTIME].includes(message.conversation.runtimeVersion)) {
      return NextResponse.json({ error: "As falas dos runtimes isolados não podem ser editadas como memória da IA atual" }, { status: 409 });
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
      await tx.aiTrainingConversation.update({
        where: { id: message.conversationId },
        data: { conversationState: Prisma.DbNull },
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
