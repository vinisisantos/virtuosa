import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { reserveAiAssistantOperation, failAiAssistantOperation, finishAiAssistantOperation } from "@/lib/ai-assistant/budget";
import { loadAiAssistantSuggestionContext } from "@/lib/ai-assistant/context";
import { generateAiAssistantReply } from "@/lib/ai-assistant/provider";
import {
  AI_ASSISTANT_MODEL,
  AI_ASSISTANT_RESERVED_MICRO_USD,
  AiAssistantError,
} from "@/lib/ai-assistant/policy";

export async function generateConversationSuggestion(params: {
  req: Request;
  conversationId: string;
  userId: string;
  campaignName?: string | null;
  force?: boolean;
}) {
  const context = await loadAiAssistantSuggestionContext(params);
  if (context.conversation.aiMode !== "suggestions") {
    throw new AiAssistantError("Ative o modo Sugestões nesta conversa", 409);
  }
  const current = await prisma.aiAssistantDraft.findUnique({
    where: { conversationId: params.conversationId },
  });
  if (
    !params.force
    && current
    && current.sourceFingerprint === context.sourceFingerprint
    && ["active", "inserted"].includes(current.status)
  ) {
    return { draft: current, cached: true };
  }

  const operation = await reserveAiAssistantOperation({
    conversationId: params.conversationId,
    kind: "suggestion",
    reservedMicroUsd: AI_ASSISTANT_RESERVED_MICRO_USD,
    dailyLimit: context.config.dailyBudgetMicroUsd,
  });
  const usage = { input: 0, output: 0 };
  try {
    const result = await generateAiAssistantReply(context.prompt, usage);
    const latest = await prisma.whatsAppMessage.findFirst({
      where: {
        conversationId: params.conversationId,
        type: "text",
        status: { not: "deleted" },
        body: { not: "" },
      },
      select: { id: true, fromMe: true },
      orderBy: [{ timestamp: "desc" }, { id: "desc" }],
    });
    if (!latest || latest.id !== context.latestMessageId || latest.fromMe) {
      throw new AiAssistantError("A conversa mudou durante a geração. Gere uma nova sugestão.", 409);
    }
    const previousHistory = Array.isArray(current?.history) ? current.history : [];
    const history = current ? [
      ...previousHistory,
      {
        version: current.version,
        content: current.content,
        status: current.status,
        sourceFingerprint: current.sourceFingerprint,
        at: current.updatedAt.toISOString(),
      },
    ].slice(-20) : [];
    const draft = await prisma.aiAssistantDraft.upsert({
      where: { conversationId: params.conversationId },
      create: {
        conversationId: params.conversationId,
        unit: "SBC",
        sourceFingerprint: context.sourceFingerprint,
        sourceMessageId: context.latestMessageId,
        content: result.response,
        status: "active",
        model: AI_ASSISTANT_MODEL,
        generatedBy: params.userId,
        usage: { ...usage, confidence: result.confidence, needsHuman: result.needsHuman, usedKnowledge: result.usedKnowledge },
      },
      update: {
        sourceFingerprint: context.sourceFingerprint,
        sourceMessageId: context.latestMessageId,
        content: result.response,
        status: "active",
        version: { increment: 1 },
        model: AI_ASSISTANT_MODEL,
        generatedBy: params.userId,
        usedBy: null,
        usedAt: null,
        sentMessageId: null,
        usage: { ...usage, confidence: result.confidence, needsHuman: result.needsHuman, usedKnowledge: result.usedKnowledge },
        history: history as Prisma.InputJsonValue,
      },
    });
    await finishAiAssistantOperation(operation.id, usage);
    return { draft, cached: false };
  } catch (error) {
    await failAiAssistantOperation(operation.id).catch(() => {});
    throw error;
  }
}
export async function generateAiAssistantTest(params: { input: string; userId: string }) {
  const config = await import("@/lib/ai-assistant/config").then(({ loadAiAssistantConfig }) => loadAiAssistantConfig());
  const operation = await reserveAiAssistantOperation({
    kind: "test",
    reservedMicroUsd: AI_ASSISTANT_RESERVED_MICRO_USD,
    dailyLimit: config.dailyBudgetMicroUsd,
  });
  const usage = { input: 0, output: 0 };
  try {
    const result = await generateAiAssistantReply({
      DADOS_DA_EMPRESA: (await import("@/lib/ai-assistant/policy")).aiAssistantPublicConfig(config),
      REGRAS: config,
      CATALOGO_APROVADO: [],
      CONHECIMENTO_APROVADO: [],
      RESPOSTAS_DE_EXEMPLO: [],
      CONVERSA: [{ role: "cliente", text: params.input }],
      TESTE_ISOLADO: true,
    }, usage);
    await finishAiAssistantOperation(operation.id, usage);
    return result;
  } catch (error) {
    await failAiAssistantOperation(operation.id).catch(() => {});
    throw error;
  }
}
