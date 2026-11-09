import { Prisma } from "@prisma/client";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { reserveAiAssistantOperation, failAiAssistantOperation, finishAiAssistantOperation } from "@/lib/ai-assistant/budget";
import { loadAliceSuggestionContext } from "@/lib/ai-assistant/context";
import { buildAliceKnowledgeContext } from "@/lib/ai-assistant/alice-knowledge";
import { routeAliceHandoff } from "@/lib/ai-assistant/handoff";
import { requireAliceLiveRuntime } from "@/lib/ai-assistant/runtime";
import { aliceLocalHandoffReply, classifyAliceHandoff } from "@/lib/ai-assistant/safety";
import { generateAiAssistantReply, normalizeAiAssistantMessageLayout } from "@/lib/ai-assistant/provider";
import { generateClaudeReply } from "@/lib/ai-assistant/claude-provider";
import { reserveClaudeMonthlyBudget } from "@/lib/ai-assistant/claude-budget";
import { saveAliceDraft } from "@/lib/ai-assistant/save-draft";
import { personalizeAiAssistantResponse } from "@/lib/ai-assistant/privacy";
import { isSbcOpeningSequenceContext } from "@/lib/ai-assistant/message-sequence";
import { looksLikeSchedulingExchange, tryAliceAutoSchedule, type AliceAutoScheduleResult } from "@/lib/ai-assistant/auto-schedule";
import { isSchedulingSuggestionExpired, schedulingSuggestionExpiry } from "@/lib/ai-assistant/sbc-scheduling-policy";
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
  req: NextRequest;
  conversationId: string;
  userId: string;
  campaignName?: string | null;
  targetMessageId?: string | null;
  force?: boolean;
  compare?: boolean;
}) {
  requireAliceLiveRuntime();
  let context = await loadAliceSuggestionContext(params);
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
    && !(context.unit === "SBC" && looksLikeSchedulingExchange(context.recentMessages))
    && !isSchedulingSuggestionExpired(usageRecord)
    && isCurrentAliceDraft
    && current
    && current.sourceFingerprint === context.sourceFingerprint
    && (!params.compare || Boolean(usageRecord.comparison))
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
  const allowSeparateMessages = isSbcOpeningSequenceContext(context.unit, context.prompt);
  let booking: AliceAutoScheduleResult = { status: "not_applicable" };
  try {
    let comparison: Prisma.InputJsonObject | null = null;
    const localResult = context.handoffReason
      ? {
        response: aliceLocalHandoffReply(context.handoffReason),
        messages: [aliceLocalHandoffReply(context.handoffReason)],
        confidence: "high" as const,
        needsHuman: true,
        usedKnowledge: [`safety:${context.handoffReason}`],
      }
      : null;
    let result;
    let suggestionTexts: string[] = [];
    if (localResult) {
      result = localResult;
    } else if (params.compare) {
      const claudeUsage = { input: 0, output: 0 };
      const [codex, claude] = await Promise.allSettled([
        generateAiAssistantReply(context.prompt, usage).then((value) => normalizeAiAssistantMessageLayout(value, allowSeparateMessages, context.prompt)),
        (async () => {
          if (!process.env.ANTHROPIC_API_KEY?.trim()) throw new AiAssistantError("Claude não configurado", 503);
          await reserveClaudeMonthlyBudget(context.prompt);
          return normalizeAiAssistantMessageLayout(await generateClaudeReply(context.prompt, claudeUsage), allowSeparateMessages, context.prompt);
        })(),
      ]);
      if (codex.status === "rejected" && claude.status === "rejected") {
        throw new AiAssistantError("Não foi possível gerar sugestões agora. Tente novamente mais tarde.", 502);
      }
      const codexResult = codex.status === "fulfilled" ? codex.value : null;
      const claudeResult = claude.status === "fulfilled" ? claude.value : null;
      suggestionTexts = [...(codexResult?.messages || []), ...(claudeResult?.messages || [])];
      result = { ...(codexResult || claudeResult!), needsHuman: Boolean(codexResult?.needsHuman || claudeResult?.needsHuman) };
      comparison = {
        codex: codexResult ? { ...codexResult, response: personalizeAiAssistantResponse(codexResult.response, context.contactName), messages: codexResult.messages.map((message) => personalizeAiAssistantResponse(message, context.contactName)) } : null,
        claude: claudeResult ? { ...claudeResult, response: personalizeAiAssistantResponse(claudeResult.response, context.contactName), messages: claudeResult.messages.map((message) => personalizeAiAssistantResponse(message, context.contactName)) } : null,
        codexError: codexResult ? null : "Codex indisponível neste momento.",
        claudeError: claudeResult ? null : claude.status === "rejected" && claude.reason instanceof AiAssistantError && claude.reason.status === 429
          ? "Limite mensal do Claude atingido." : "Claude indisponível neste momento.",
        claudeUsage,
        selected: codexResult ? "codex" : "claude",
      };
    } else {
      result = normalizeAiAssistantMessageLayout(await generateAiAssistantReply(context.prompt, usage), allowSeparateMessages, context.prompt);
      suggestionTexts = result.messages;
    }
    if (!personalizeAiAssistantResponse(result.response, context.contactName)) throw new AiAssistantError("A Alice devolveu uma sugestão vazia", 502);

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

    try {
      booking = await tryAliceAutoSchedule({
        req: params.req, unit: context.unit, conversationId: params.conversationId,
        instanceId: context.conversation.instanceId, instanceUnit: context.conversation.instance.unit,
        contactUnit: context.conversation.contact.unit, phone: context.conversation.contact.phone,
        targetMessageId: context.targetMessageId, messages: context.recentMessages,
        safetyHold: Boolean(context.handoffReason || result.needsHuman),
      });
    } catch (error) {
      console.error("[Alice] Não foi possível verificar o agendamento:", error);
      booking = { status: "review", reason: "Não foi possível concluir a verificação. Confira a agenda antes de tentar novamente." };
    }
    if (booking.status === "booked") {
      try { context = await loadAliceSuggestionContext(params); }
      catch { throw new AiAssistantError("A avaliação foi salva, mas a conversa não pôde ser atualizada. Confira a agenda e a confirmação antes de tentar novamente.", 409); }
      const response = "Se precisar de alguma informação até o dia da avaliação, pode me chamar 😊";
      result = { response, messages: [response], confidence: "high", needsHuman: false, usedKnowledge: ["system:appointment"] };
      comparison = null;
      suggestionTexts = result.messages;
    } else if (booking.status === "review") {
      const response = "Vou verificar os detalhes do agendamento e já retorno para você.";
      result = { response, messages: [response], confidence: "medium", needsHuman: false, usedKnowledge: ["system:appointment_review"] };
      comparison = null;
      suggestionTexts = result.messages;
    }
    const personalizedResponse = personalizeAiAssistantResponse(result.response, context.contactName);

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
      schedulingValidUntil: context.unit === "SBC" ? schedulingSuggestionExpiry(suggestionTexts) : null,
      ...(booking.status !== "not_applicable" ? { booking } : {}),
      sequenceAllowed: isSbcOpeningSequenceContext(context.unit, context.prompt),
      ...(comparison ? { comparison } : {}),
    };
    const draft = await saveAliceDraft({
      current,
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
    if (booking.status === "booked") {
      throw new AiAssistantError("A avaliação foi salva, mas não foi possível atualizar a sugestão. Confira a agenda e a confirmação antes de tentar novamente.", 409);
    }
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
