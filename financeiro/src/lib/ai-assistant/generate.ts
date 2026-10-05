import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { reserveAiAssistantOperation, failAiAssistantOperation, finishAiAssistantOperation } from "@/lib/ai-assistant/budget";
import { loadAliceSuggestionContext } from "@/lib/ai-assistant/context";
import { buildAliceKnowledgeContext } from "@/lib/ai-assistant/alice-knowledge";
import { routeAliceHandoff } from "@/lib/ai-assistant/handoff";
import { requireAliceLiveRuntime } from "@/lib/ai-assistant/runtime";
import { aliceLocalHandoffReply, classifyAliceHandoff } from "@/lib/ai-assistant/safety";
import { generateAiAssistantReply } from "@/lib/ai-assistant/provider";
import { personalizeAiAssistantResponse } from "@/lib/ai-assistant/privacy";
import {
  AI_ASSISTANT_MODEL,
  AI_ASSISTANT_RESERVED_MICRO_USD,
  type AliceUnit,
  AiAssistantError,
} from "@/lib/ai-assistant/policy";

function needsHumanFrom(value: unknown) {
  return Boolean(value && typeof value === "object" && (value as Record<string, unknown>).needsHuman === true);
}

async function routeForDraft(params: {
  conversationId: string;
  instanceId: string;
  sourceMessageId: string;
  unit: AliceUnit;
  required: boolean;
  reason: "clinical_safety" | "unsupported_procedure" | "model_requested" | null;
}) {
  if (!params.required) return null;
  return routeAliceHandoff({
    conversationId: params.conversationId,
    instanceId: params.instanceId,
    sourceMessageId: params.sourceMessageId,
    unit: params.unit,
    reason: params.reason || "model_requested",
  });
}

export async function generateConversationSuggestion(params: {
  req: Request;
  conversationId: string;
  userId: string;
  campaignName?: string | null;
  targetMessageId?: string | null;
  force?: boolean;
}) {
  const context = await loadAliceSuggestionContext(params);
  if (context.conversation.aiMode !== "suggestions") {
    throw new AiAssistantError("Ative o modo Sugestões nesta conversa", 409);
  }
  const current = await prisma.aiAssistantDraft.findUnique({ where: { conversationId: params.conversationId } });
  const usageRecord = current?.usage && typeof current.usage === "object" && !Array.isArray(current.usage)
    ? current.usage as Record<string, unknown>
    : {};
  const isCurrentAliceDraft = current?.model === AI_ASSISTANT_MODEL && current.unit === context.unit;
  if (
    !params.force
    && isCurrentAliceDraft
    && current
    && current.sourceFingerprint === context.sourceFingerprint
    && ["active", "inserted"].includes(current.status)
  ) {
    const handoff = await routeForDraft({
      conversationId: params.conversationId,
      instanceId: context.conversation.instanceId,
      sourceMessageId: context.latestMessageId,
      unit: context.unit,
      required: needsHumanFrom(usageRecord),
      reason: typeof usageRecord.handoffReason === "string"
        ? usageRecord.handoffReason as "clinical_safety" | "unsupported_procedure" | "model_requested"
        : null,
    });
    return {
      draft: { ...current, content: personalizeAiAssistantResponse(current.content, context.contactName) },
      cached: true,
      handoff,
    };
  }

  const operation = await reserveAiAssistantOperation({
    conversationId: params.conversationId,
    unit: context.unit,
    kind: "suggestion",
    reservedMicroUsd: AI_ASSISTANT_RESERVED_MICRO_USD,
    dailyLimit: context.config.dailyBudgetMicroUsd,
  });
  const usage = { input: 0, output: 0 };
  try {
    const result = context.handoffReason
      ? {
        response: aliceLocalHandoffReply(context.handoffReason),
        confidence: "high" as const,
        needsHuman: true,
        usedKnowledge: [`safety:${context.handoffReason}`],
      }
      : await generateAiAssistantReply(context.prompt, usage);
    const personalizedResponse = personalizeAiAssistantResponse(result.response, context.contactName);
    if (!personalizedResponse) throw new AiAssistantError("A Alice devolveu uma sugestão vazia", 502);

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
    if (!latest || latest.id !== context.latestMessageId) {
      throw new AiAssistantError("A conversa mudou durante a geração. Gere uma nova sugestão.", 409);
    }
    if (context.targetMessageId) {
      const targetStillAvailable = await prisma.whatsAppMessage.findFirst({
        where: {
          id: context.targetMessageId,
          conversationId: params.conversationId,
          fromMe: false,
          type: "text",
          status: { not: "deleted" },
          body: { not: "" },
        },
        select: { id: true },
      });
      if (!targetStillAvailable) throw new AiAssistantError("A mensagem selecionada mudou durante a geração.", 409);
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
    const usedKnowledge = "prompt" in context && context.prompt
      ? ((context.prompt.BASE_ALICE as { documents?: { source: string }[] } | null)?.documents || []).map((document) => document.source)
      : [];
    const handoffReason = context.handoffReason || (result.needsHuman ? "model_requested" : null);
    const draftUsage = {
      input: usage.input,
      output: usage.output,
      confidence: result.confidence,
      needsHuman: result.needsHuman,
      usedKnowledge: context.handoffReason ? result.usedKnowledge : usedKnowledge,
      aliceRevision: "prompt" in context && context.prompt
        ? (context.prompt.BASE_ALICE as { revision?: string } | null)?.revision || null
        : null,
      targetMessageId: context.targetMessageId,
      handoffReason,
    };
    const draft = await prisma.aiAssistantDraft.upsert({
      where: { conversationId: params.conversationId },
      create: {
        conversationId: params.conversationId,
        unit: context.unit,
        sourceFingerprint: context.sourceFingerprint,
        sourceMessageId: context.latestMessageId,
        content: personalizedResponse,
        status: "active",
        model: AI_ASSISTANT_MODEL,
        generatedBy: params.userId,
        usage: draftUsage,
      },
      update: {
        unit: context.unit,
        sourceFingerprint: context.sourceFingerprint,
        sourceMessageId: context.latestMessageId,
        content: personalizedResponse,
        status: "active",
        version: { increment: 1 },
        model: AI_ASSISTANT_MODEL,
        generatedBy: params.userId,
        usedBy: null,
        usedAt: null,
        sentMessageId: null,
        usage: draftUsage,
        history: history as Prisma.InputJsonValue,
      },
    });
    await prisma.aiAssistantOperation.updateMany({
      where: {
        unit: context.unit,
        kind: "suggestion",
        draftId: draft.id,
        draftVersion: { lt: draft.version },
        draftOutcome: { in: ["pending", "inserted"] },
      },
      data: { draftOutcome: "superseded" },
    });
    await finishAiAssistantOperation(operation.id, usage, { id: draft.id, version: draft.version });
    const handoff = await routeForDraft({
      conversationId: params.conversationId,
      instanceId: context.conversation.instanceId,
      sourceMessageId: context.latestMessageId,
      unit: context.unit,
      required: result.needsHuman,
      reason: handoffReason,
    });
    return { draft, cached: false, handoff };
  } catch (error) {
    await failAiAssistantOperation(operation.id).catch(() => {});
    throw error;
  }
}

export async function generateAiAssistantTest(params: { input: string; userId: string }) {
  const { loadAiAssistantConfig } = await import("@/lib/ai-assistant/config");
  const config = await loadAiAssistantConfig();
  const safetyReason = classifyAliceHandoff({ unit: "SBC", incomingMessages: [params.input] });
  if (safetyReason) {
    return { response: aliceLocalHandoffReply(safetyReason), confidence: "high", needsHuman: true, usedKnowledge: [`safety:${safetyReason}`] };
  }

  requireAliceLiveRuntime();
  const base = buildAliceKnowledgeContext({ unit: "SBC", campaignName: "", messageText: params.input });
  if (!base) throw new AiAssistantError("A base privada da Alice não está disponível neste momento", 503);
  const operation = await reserveAiAssistantOperation({
    unit: "SBC",
    kind: "test",
    reservedMicroUsd: AI_ASSISTANT_RESERVED_MICRO_USD,
    dailyLimit: config.dailyBudgetMicroUsd,
  });
  const usage = { input: 0, output: 0 };
  try {
    const result = await generateAiAssistantReply({
      BASE_ALICE: base,
      UNIDADE: "SBC",
      CAMPANHA: "Teste isolado",
      CONTATO: { nomeSalvoDisponivel: false },
      MENSAGEM_ALVO: { text: params.input },
      MENSAGENS_RECENTES_SEM_RESPOSTA: [{ text: params.input }],
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
