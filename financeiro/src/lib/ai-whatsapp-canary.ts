import { Prisma } from "@prisma/client";

import { AI_CURRENT_MODEL_SPEC } from "@/lib/ai-model-config";
import { generateAiTrainingReply } from "@/lib/ai-training";
import {
  AI_WHATSAPP_CANARY_RESPONDER,
  aiWhatsAppCanaryActivityBlockReason,
  matchesAiWhatsAppCanaryTarget,
  readAiWhatsAppCanaryConfig,
} from "@/lib/ai-whatsapp-canary-policy";
import { prisma } from "@/lib/db";
import {
  extractWahaMessageId,
  getInstanceProvider,
  sendWahaText,
  toWahaChatId,
} from "@/lib/whatsapp/provider";

const SOURCE_MODE = "whatsapp_canary";
const MODEL_KEY = "currentTerra";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function jsonRecord(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Prisma.JsonObject
    : null;
}

async function recordCanaryLog(
  eventType: string,
  status: string,
  details: Record<string, unknown>,
  error?: unknown,
) {
  await prisma.webhookLog.create({
    data: {
      source: "ai_whatsapp_canary",
      eventType,
      status,
      payload: JSON.stringify(details).slice(0, 3_000),
      errorMessage: error ? errorMessage(error).slice(0, 1_000) : null,
      processedAt: new Date(),
    },
  }).catch(() => {});
}

async function conversationActivityAfter(conversationId: string, createdAt: Date, triggerMessageId: string) {
  const messages = await prisma.whatsAppMessage.findMany({
    where: {
      conversationId,
      id: { not: triggerMessageId },
      createdAt: { gt: createdAt },
    },
    select: { fromMe: true, respondedByName: true },
    orderBy: { createdAt: "asc" },
    take: 20,
  });
  return aiWhatsAppCanaryActivityBlockReason(messages);
}

async function loadAuthorizedConversation(conversationId: string) {
  const config = readAiWhatsAppCanaryConfig();
  const conversation = await prisma.whatsAppConversation.findUnique({
    where: { id: conversationId },
    select: {
      id: true,
      lastKnownJid: true,
      contact: { select: { phone: true } },
      instance: {
        select: {
          id: true,
          name: true,
          provider: true,
          status: true,
        },
      },
    },
  });
  if (!conversation) return null;
  if (!matchesAiWhatsAppCanaryTarget(config, {
    instanceId: conversation.instance.id,
    contactPhone: conversation.contact.phone,
    lastKnownJid: conversation.lastKnownJid,
  })) return null;
  if (conversation.instance.status !== "connected") return null;
  return { config, conversation };
}

async function sendCanaryText(params: {
  conversationId: string;
  instance: { name: string; provider: string | null };
  phone: string;
  jid: string | null;
  message: string;
}) {
  const provider = getInstanceProvider(params.instance);
  let sendData: any = {};

  if (provider === "waha") {
    const send = await sendWahaText({
      sessionName: params.instance.name,
      chatId: toWahaChatId(params.phone),
      text: params.message,
    });
    sendData = send.data;
    if (!send.res.ok) {
      throw new Error(`WAHA recusou a mensagem do canário: ${JSON.stringify(sendData).slice(0, 300)}`);
    }
  } else {
    const url = (process.env.EVOLUTION_API_URL || "http://localhost:8080").replace(/\/+$/, "");
    const apiKey = process.env.EVOLUTION_API_KEY || "";
    const recipients = Array.from(new Set([params.jid, params.phone].filter(Boolean))) as string[];
    let sent = false;
    let lastFailure = "";

    for (const number of recipients) {
      const response = await fetch(`${url}/message/sendText/${params.instance.name}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: apiKey },
        body: JSON.stringify({ number, text: params.message }),
        signal: AbortSignal.timeout(15_000),
      });
      sendData = await response.json().catch(() => ({}));
      if (response.ok) {
        sent = true;
        break;
      }
      lastFailure = JSON.stringify(sendData).slice(0, 300);
    }
    if (!sent) throw new Error(`Evolution recusou a mensagem do canário: ${lastFailure}`);
  }

  const messageId = provider === "waha"
    ? extractWahaMessageId(sendData) || `ai_canary_waha_${Date.now()}`
    : sendData?.key?.id || sendData?.id || `ai_canary_${Date.now()}`;
  const sentAt = new Date();

  await prisma.$transaction([
    prisma.whatsAppMessage.upsert({
      where: {
        conversationId_messageId: {
          conversationId: params.conversationId,
          messageId,
        },
      },
      update: {
        body: params.message,
        fromMe: true,
        status: "sent",
        respondedByName: AI_WHATSAPP_CANARY_RESPONDER,
      },
      create: {
        conversationId: params.conversationId,
        messageId,
        body: params.message,
        type: "text",
        fromMe: true,
        status: "sent",
        timestamp: sentAt,
        respondedByName: AI_WHATSAPP_CANARY_RESPONDER,
      },
    }),
    prisma.whatsAppConversation.update({
      where: { id: params.conversationId },
      data: {
        lastMessage: params.message,
        lastMessageAt: sentAt,
        lastOutboundAt: sentAt,
      },
    }),
  ]);
}

export async function processAiWhatsAppCanaryIncoming(params: {
  conversationId: string;
  incomingMessageId: string;
}) {
  let runId: string | null = null;

  try {
    const trigger = await prisma.whatsAppMessage.findUnique({
      where: { id: params.incomingMessageId },
      select: {
        id: true,
        conversationId: true,
        body: true,
        type: true,
        fromMe: true,
        createdAt: true,
      },
    });
    if (
      !trigger
      || trigger.conversationId !== params.conversationId
      || trigger.fromMe
      || trigger.type !== "text"
      || !trigger.body.trim()
    ) return { processed: false, reason: "invalid_trigger" };

    const authorized = await loadAuthorizedConversation(params.conversationId);
    if (!authorized) return { processed: false, reason: "not_authorized" };

    const run = await prisma.aiShadowRun.upsert({
      where: { incomingMessageId: trigger.id },
      update: {},
      create: {
        conversationId: params.conversationId,
        incomingMessageId: trigger.id,
        unit: authorized.config.knowledgeUnit,
        instanceId: authorized.conversation.instance.id,
        contactPhone: authorized.conversation.contact.phone,
        sourceMode: SOURCE_MODE,
        status: "queued_canary",
        triggerReason: "authorized_private_whatsapp_inbound",
        promptVersion: "current-terra-canary-v1",
        knowledgeVersion: "approved-plus-optional-caderno",
        context: { conversationState: null },
      },
    });
    runId = run.id;
    if (run.sourceMode !== SOURCE_MODE) return { processed: false, reason: "owned_by_other_runtime" };

    const claimed = await prisma.aiShadowRun.updateMany({
      where: { id: run.id, status: "queued_canary" },
      data: { status: "processing", error: null },
    });
    if (claimed.count !== 1) return { processed: false, reason: "already_claimed" };

    const [, model] = AI_CURRENT_MODEL_SPEC.split(":", 2);
    await prisma.aiShadowDraft.upsert({
      where: { runId_modelKey: { runId: run.id, modelKey: MODEL_KEY } },
      update: { status: "processing", error: null },
      create: {
        runId: run.id,
        modelKey: MODEL_KEY,
        provider: "openai",
        model,
        status: "processing",
      },
    });

    await sleep(authorized.config.debounceMs);
    const activityBlock = await conversationActivityAfter(
      params.conversationId,
      trigger.createdAt,
      trigger.id,
    );
    if (activityBlock) {
      await prisma.aiShadowRun.update({
        where: { id: run.id },
        data: { status: activityBlock, processedAt: new Date() },
      });
      await prisma.aiShadowDraft.update({
        where: { runId_modelKey: { runId: run.id, modelKey: MODEL_KEY } },
        data: { status: activityBlock },
      });
      return { processed: false, reason: activityBlock };
    }

    const [history, previousRun] = await Promise.all([
      prisma.whatsAppMessage.findMany({
        where: { conversationId: params.conversationId },
        orderBy: [{ timestamp: "desc" }, { createdAt: "desc" }],
        take: 20,
        select: { body: true, fromMe: true },
      }),
      prisma.aiShadowRun.findFirst({
        where: {
          conversationId: params.conversationId,
          sourceMode: SOURCE_MODE,
          status: "sent",
          id: { not: run.id },
        },
        orderBy: { createdAt: "desc" },
        select: { context: true },
      }),
    ]);
    const previousContext = jsonRecord(previousRun?.context);
    const generated = await generateAiTrainingReply({
      unit: authorized.config.knowledgeUnit,
      messages: history.reverse().map((message) => ({
        role: message.fromMe ? "assistant" : "client",
        content: message.body,
      })),
      includeExperimentalCaderno: authorized.config.includeExperimentalCaderno,
      conversationState: previousContext?.conversationState,
      channel: "whatsapp_canary",
    });

    await prisma.aiShadowDraft.update({
      where: { runId_modelKey: { runId: run.id, modelKey: MODEL_KEY } },
      data: {
        status: "ready",
        decision: generated.decision,
        messages: generated.messages,
        handoffReason: generated.handoffReason,
        confidence: generated.confidence,
        guardrailFlags: generated.guardrailFlags,
        latencyMs: generated.latencyMs,
        promptTokens: generated.promptTokens,
        completionTokens: generated.completionTokens,
      },
    });

    if (generated.decision === "no_reply" || generated.messages.length === 0) {
      await prisma.aiShadowRun.update({
        where: { id: run.id },
        data: {
          status: "no_reply",
          context: { conversationState: generated.sdrState },
          processedAt: new Date(),
        },
      });
      return { processed: true, reason: "no_reply" };
    }

    for (const message of generated.messages) {
      const currentAuthorization = await loadAuthorizedConversation(params.conversationId);
      if (!currentAuthorization) throw new Error("Autorização do canário foi revogada antes do envio");
      const currentBlock = await conversationActivityAfter(
        params.conversationId,
        trigger.createdAt,
        trigger.id,
      );
      if (currentBlock) {
        await prisma.aiShadowRun.update({
          where: { id: run.id },
          data: { status: currentBlock, processedAt: new Date() },
        });
        await prisma.aiShadowDraft.update({
          where: { runId_modelKey: { runId: run.id, modelKey: MODEL_KEY } },
          data: { status: currentBlock },
        });
        return { processed: false, reason: currentBlock };
      }

      await sendCanaryText({
        conversationId: params.conversationId,
        instance: currentAuthorization.conversation.instance,
        phone: currentAuthorization.config.phone,
        jid: currentAuthorization.config.jid,
        message,
      });
    }

    await prisma.aiShadowRun.update({
      where: { id: run.id },
      data: {
        status: "sent",
        context: {
          conversationState: generated.sdrState,
          decision: generated.decision,
          model: generated.model,
        },
        processedAt: new Date(),
      },
    });
    await prisma.aiShadowDraft.update({
      where: { runId_modelKey: { runId: run.id, modelKey: MODEL_KEY } },
      data: { status: "sent" },
    });
    await recordCanaryLog("reply_sent", "sent", {
      runId: run.id,
      conversationId: params.conversationId,
      messageCount: generated.messages.length,
      model: generated.model,
      latencyMs: generated.latencyMs,
    });
    return { processed: true, reason: "sent" };
  } catch (error) {
    if (runId) {
      await prisma.aiShadowRun.update({
        where: { id: runId },
        data: { status: "failed", error: errorMessage(error).slice(0, 2_000), processedAt: new Date() },
      }).catch(() => {});
      await prisma.aiShadowDraft.updateMany({
        where: { runId, modelKey: MODEL_KEY },
        data: { status: "failed", error: errorMessage(error).slice(0, 2_000) },
      }).catch(() => {});
    }
    await recordCanaryLog("reply_failed", "error", {
      runId,
      conversationId: params.conversationId,
    }, error);
    throw error;
  }
}
