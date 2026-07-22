import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import {
  extractLeadName,
  isInsideLeadNameReplyWindow,
} from "@/lib/whatsapp/lead-name";
import { syncLeadNameAcrossCrm } from "@/lib/whatsapp/lead-name-sync";
import {
  resolveContactNameFromMessage,
  shouldUpdateContactName,
} from "@/lib/whatsapp/contact-name";
import { extractAdIdFromSourceUrl, resolveCampaignFromAdId } from "@/lib/lead-processor";
import { inferCampaignByKeywords, inferManagedCampaignName } from "@/lib/campaign-attribution";
import { campaignNameFromAccountTrackId } from "@/lib/campaign-account-origin";
import {
  isGenericCampaignName,
  isViaLinkCampaignName,
  normalizeCampaignNameForWrite,
  VIA_LINK_CAMPAIGN_LABEL,
} from "@/lib/campaign-labels";
import { analyzeConversationSilently } from "@/lib/crm-silent-analysis";
import { enqueueAiShadowEvaluation } from "@/lib/ai-shadow";
import { ensureCallRejectApplied } from "@/lib/whatsapp-call-block-sync";
import {
  extractWahaMessageId,
  getInstanceProvider,
  normalizeWahaAckStatus,
  normalizeWahaStatus,
  sendWahaText,
  toWahaChatId,
} from "@/lib/whatsapp/provider";
import { extractWhatsAppMessageBody } from "@/lib/whatsapp/message-content";

const getEvolutionConfig = () => ({
  url: process.env.EVOLUTION_API_URL || 'http://localhost:8080',
  apiKey: process.env.EVOLUTION_API_KEY || '',
});

const CTWA_WELCOME_TRIGGER = "ctwa_welcome";
const COMMERCIAL_LEAD_UNITS = ["Osasco", "SBC", "SCS"] as const;
const CALL_BLOCK_SETTINGS_KEY = "whatsapp_call_block_settings";
const DEFAULT_CALL_BLOCK_MESSAGE =
  "Este número não recebe ligações. Por favor, envie sua mensagem por aqui para darmos continuidade ao atendimento.";
const CALL_BLOCK_UNITS = ["Osasco", "SBC", "SCS", "Todas"];
const LEGACY_CALL_BLOCK_UNITS = ["Osasco", "SBC", "SCS"];

type CallBlockSettings = {
  enabled: boolean;
  message: string;
  cooldownMinutes: number;
  units: string[];
};

function commercialLeadUnit(unit?: string | null): string | null {
  return unit && COMMERCIAL_LEAD_UNITS.includes(unit as typeof COMMERCIAL_LEAD_UNITS[number])
    ? unit
    : null;
}

type WebhookInstance = {
  id: string;
  token?: string | null;
  name: string;
  provider?: string | null;
  status?: string | null;
  userId?: string | null;
  unit?: string | null;
  capturesLeads?: boolean | null;
  user?: { name?: string | null } | null;
};

function normalizeEvolutionWebhookEvent(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function isPrismaUniqueConstraintError(error: unknown) {
  return !!error && typeof error === "object" && (error as any).code === "P2002";
}

function mapEvolutionMessageStatus(status: unknown, fallback: string) {
  if (status === undefined || status === null) return fallback;

  const statusMap: Record<number, string> = {
    0: "error",
    1: "pending",
    2: "sent",
    3: "delivered",
    4: "read",
    5: "played",
  };

  return typeof status === "number"
    ? (statusMap[status] || fallback)
    : (String(status) || fallback);
}

function cleanMediaFileName(value: unknown) {
  const clean = typeof value === "string" ? value.trim() : "";
  return clean ? clean.slice(0, 255) : null;
}

function cleanMediaMimeType(value: unknown) {
  const clean = typeof value === "string" ? value.trim() : "";
  return clean ? clean.slice(0, 120) : null;
}

function parseMediaSizeBytes(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : null;
  }
  if (typeof value === "object") {
    const candidate = (value as any).low ?? (value as any).value ?? (value as any).toNumber?.();
    return parseMediaSizeBytes(candidate);
  }
  return null;
}

async function logWebhookStatusChange(params: {
  source: string;
  eventType: string;
  dbInstance: WebhookInstance;
  previousStatus?: string | null;
  nextStatus: string;
  rawEvent?: unknown;
  payload?: unknown;
}) {
  await prisma.webhookLog.create({
    data: {
      source: params.source,
      eventType: params.eventType,
      status: params.nextStatus === "disconnected" ? "warning" : "received",
      payload: JSON.stringify({
        instanceId: params.dbInstance.id,
        instanceName: params.dbInstance.name,
        provider: params.dbInstance.provider || null,
        userId: params.dbInstance.userId || null,
        unit: params.dbInstance.unit || null,
        previousStatus: params.previousStatus || null,
        nextStatus: params.nextStatus,
        rawEvent: params.rawEvent || null,
        payload: params.payload || null,
      }).slice(0, 3000),
      errorMessage: params.nextStatus === "disconnected"
        ? "Webhook informou desconexão da instância"
        : null,
    },
  }).catch(() => {});
}

function privateConversationAssignment(dbInstance: WebhookInstance) {
  if (!dbInstance.userId) return null;
  if (dbInstance.capturesLeads !== false && dbInstance.unit !== "Todas") return null;

  return {
    assignedTo: dbInstance.userId,
    assignedToName: dbInstance.user?.name || "Titular da instancia",
  };
}

function phoneDigits(value?: string | null) {
  return (value || "").replace(/\D/g, "");
}

function compactAdReply(adReply?: Record<string, unknown> | null) {
  if (!adReply) return null;
  const trim = (value: unknown) =>
    typeof value === "string" && value.length > 240 ? `${value.slice(0, 240)}...[trunc]` : value || null;
  return {
    title: trim(adReply.title),
    body: trim(adReply.body),
    description: trim(adReply.description),
    sourceId: trim(adReply.sourceId || adReply.source_id),
    sourceUrl: trim(adReply.sourceUrl || adReply.source_url),
    mediaType: adReply.mediaType || null,
  };
}

function pickBestClientCandidate<T extends {
  phone: string | null;
  unit: string;
  source: string | null;
  campaignName: string | null;
  campaignId?: string | null;
  fbclid?: string | null;
  updatedAt: Date;
}>(candidates: T[], params: { contactPhone: string; leadUnit: string; hasCampaignSignal: boolean }) {
  const contactDigits = phoneDigits(params.contactPhone);
  return candidates
    .map((client, index) => {
      const digits = phoneDigits(client.phone);
      let score = 0;
      if (digits && digits === contactDigits) score += 120;
      else if (digits && contactDigits && digits.slice(-8) === contactDigits.slice(-8)) score += 40;
      if (client.unit === params.leadUnit) score += 40;
      if (params.hasCampaignSignal) {
        if (client.campaignName && !isGenericCampaignName(client.campaignName)) score += 35;
        else if (isGenericCampaignName(client.campaignName)) score += 5;
        if (client.fbclid && /^https?:\/\//i.test(client.fbclid)) score += 20;
        if ("campaignId" in client && client.campaignId) score += 15;
        if (client.source === "facebook_ad") score += 10;
      }
      return { client, index, score };
    })
    .sort((a, b) => b.score - a.score || b.client.updatedAt.getTime() - a.client.updatedAt.getTime() || a.index - b.index)[0]?.client || null;
}

function ctwaUnresolvedReason(params: {
  hasCampaignSignal: boolean;
  hasAdReply: boolean;
  adId: string | null;
  adSourceUrl: string | null;
  graphStatus: string;
  managedCampaignName: string | null;
  keywordCampaignName: string | null;
  fallbackCampaignName: string | null;
}) {
  if (!params.hasCampaignSignal) return "no_campaign_signal";
  if (!params.hasAdReply && !params.adId && !params.adSourceUrl) return "no_ad_metadata";
  if (params.adId && params.graphStatus === "no_token") return "graph_no_token";
  if (params.adId && params.graphStatus === "graph_error") return "graph_error";
  if (params.hasAdReply && !params.adId) return "ad_reply_without_source_id";
  if (!params.managedCampaignName && !params.keywordCampaignName && !params.fallbackCampaignName) return "no_matching_campaign_signal";
  return "generic_or_unresolved_label";
}

function getStepMessage(steps: any, index: number, fallback: string) {
  if (!Array.isArray(steps)) return fallback;
  const step = steps.filter((item) => item?.type === "send_message")[index];
  return typeof step?.config?.message === "string" && step.config.message.trim()
    ? step.config.message
    : fallback;
}

function normalizeMessagePhoneCandidate(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const raw = String(value).trim();
  if (!raw || raw.includes("@g.us")) return null;
  const digits = raw
    .replace(/@s\.whatsapp\.net|@c\.us|@broadcast|@call|@lid/gi, "")
    .replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

function normalizeLidContactIdentifier(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const raw = String(value).trim();
  if (!raw.toLowerCase().includes("@lid")) return null;
  const digits = raw.replace(/@lid/gi, "").replace(/\D/g, "");
  return digits ? `lid:${digits.slice(-18)}` : null;
}

function resolveInboundContactIdentifier(msg: any, remoteJid: string) {
  const candidates = [
    remoteJid,
    msg.key?.participant,
    msg.participant,
    msg.sender,
    msg.senderPn,
    msg.participantPn,
    msg.userJid,
    msg.chatid,
    msg.from,
    msg.number,
    msg.owner,
    msg.contact?.phone,
    msg.contact?.number,
  ];

  for (const candidate of candidates) {
    const phone = normalizeMessagePhoneCandidate(candidate);
    if (phone) return { contactPhone: phone, isSendablePhone: true };
  }

  const lid = candidates.map(normalizeLidContactIdentifier).find(Boolean);
  return lid ? { contactPhone: lid, isSendablePhone: false } : null;
}

async function sendAutomationText(params: {
  dbInstance: { name: string; provider?: string | null };
  conversationId: string;
  contactPhone: string;
  message: string;
}) {
  const provider = getInstanceProvider(params.dbInstance);
  let sendData: any = {};

  if (provider === "waha") {
    const send = await sendWahaText({
      sessionName: params.dbInstance.name,
      chatId: toWahaChatId(params.contactPhone),
      text: params.message,
    });
    sendData = send.data;
    if (!send.res.ok) {
      throw new Error(`Erro ao enviar automação pela WAHA: ${JSON.stringify(sendData).slice(0, 300)}`);
    }
  } else {
    const { url, apiKey } = getEvolutionConfig();
    const sendRes = await fetch(`${url}/message/sendText/${params.dbInstance.name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: JSON.stringify({ number: params.contactPhone, text: params.message }),
    });
    sendData = await sendRes.json().catch(() => ({}));
    if (!sendRes.ok) {
      throw new Error(`Erro ao enviar automação: ${JSON.stringify(sendData).slice(0, 300)}`);
    }
  }

  const messageId =
    provider === "waha"
      ? (extractWahaMessageId(sendData) || `auto_waha_${params.conversationId}_${Date.now()}`)
      : (sendData?.key?.id || sendData?.id || `auto_${params.conversationId}_${Date.now()}`);
  await prisma.whatsAppMessage.create({
    data: {
      conversationId: params.conversationId,
      messageId,
      body: params.message,
      type: "text",
      fromMe: true,
      status: "sent",
      timestamp: new Date(),
      respondedByName: "Automação",
    },
  });

  await prisma.whatsAppConversation.update({
    where: { id: params.conversationId },
    data: { lastMessage: params.message, lastMessageAt: new Date() },
  });
}

async function findCtwaWelcomeAutomation(unit?: string | null) {
  return prisma.automation.findFirst({
    where: {
      triggerType: CTWA_WELCOME_TRIGGER,
      isActive: true,
      OR: [{ unit: null }, ...(unit ? [{ unit }] : [])],
    },
    orderBy: { updatedAt: "desc" },
  });
}

async function cancelWaitingLeadNameLog(params: {
  logId: string;
  triggerData: unknown;
  reason: "conversation_assigned" | "human_reply" | "reply_not_name";
}) {
  const triggerData = params.triggerData && typeof params.triggerData === "object"
    ? params.triggerData as Record<string, unknown>
    : {};

  await prisma.automationLog.update({
    where: { id: params.logId },
    data: {
      result: "cancelled",
      triggerData: {
        ...triggerData,
        nameCaptureCancelledAt: new Date().toISOString(),
        nameCaptureCancellationReason: params.reason,
      },
    },
  });
}

function normalizeCallBlockSettings(value?: string | null): CallBlockSettings {
  if (!value) {
    return {
      enabled: false,
      message: DEFAULT_CALL_BLOCK_MESSAGE,
      cooldownMinutes: 30,
      units: CALL_BLOCK_UNITS,
    };
  }

  try {
    const parsed = JSON.parse(value);
    let units = Array.isArray(parsed?.units)
      ? parsed.units.filter((unit: string) => CALL_BLOCK_UNITS.includes(unit))
      : CALL_BLOCK_UNITS;
    const wasLegacyDefault =
      units.length === LEGACY_CALL_BLOCK_UNITS.length &&
      LEGACY_CALL_BLOCK_UNITS.every((unit) => units.includes(unit));
    if (wasLegacyDefault) units = CALL_BLOCK_UNITS;

    return {
      enabled: parsed?.enabled === true,
      message:
        typeof parsed?.message === "string" && parsed.message.trim()
          ? parsed.message.trim()
          : DEFAULT_CALL_BLOCK_MESSAGE,
      cooldownMinutes:
        typeof parsed?.cooldownMinutes === "number" && Number.isFinite(parsed.cooldownMinutes)
          ? Math.min(Math.max(Math.round(parsed.cooldownMinutes), 1), 1440)
          : 30,
      units: units.length ? units : CALL_BLOCK_UNITS,
    };
  } catch {
    return {
      enabled: false,
      message: DEFAULT_CALL_BLOCK_MESSAGE,
      cooldownMinutes: 30,
      units: CALL_BLOCK_UNITS,
    };
  }
}

async function getCallBlockSettings() {
  const setting = await prisma.appSetting.findUnique({
    where: { key: CALL_BLOCK_SETTINGS_KEY },
    select: { value: true },
  });
  return normalizeCallBlockSettings(setting?.value);
}

function isCallWebhookEvent(event?: string | null, payload?: any) {
  const normalized = (event || "").toLowerCase().replace(/[_\s-]+/g, ".");
  if (normalized.includes("call")) return true;
  return !!(payload?.call || payload?.data?.call || payload?.data?.calls);
}

function firstCallData(payload: any) {
  const data = payload?.data?.call || payload?.data?.calls || payload?.data || payload?.call || payload;
  return Array.isArray(data) ? data[0] : data;
}

function normalizeCallPhoneCandidate(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const raw = String(value);
  if (!raw) return null;

  const digits = raw
    .replace(/@s\.whatsapp\.net|@c\.us|@lid|@broadcast|@call/gi, "")
    .replace(/\D/g, "");

  // IDs de chamadas/LID costumam vir muito longos. Para envio de aviso, só
  // aceitamos formatos plausíveis de telefone.
  if (digits.length < 10 || digits.length > 14) return null;
  return digits;
}

function collectCallPhoneCandidates(value: any, candidates: string[] = [], depth = 0) {
  if (!value || depth > 4) return candidates;

  if (typeof value === "string" || typeof value === "number") {
    const phone = normalizeCallPhoneCandidate(value);
    if (phone) candidates.push(phone);
    return candidates;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectCallPhoneCandidates(item, candidates, depth + 1);
    return candidates;
  }

  if (typeof value !== "object") return candidates;

  for (const [key, item] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase();
    if (
      normalizedKey.includes("jid") ||
      normalizedKey.includes("phone") ||
      normalizedKey.includes("number") ||
      normalizedKey.includes("sender") ||
      normalizedKey.includes("participant") ||
      normalizedKey.includes("from") ||
      normalizedKey.includes("remote")
    ) {
      collectCallPhoneCandidates(item, candidates, depth + 1);
    }
  }

  return candidates;
}

function chooseCallPhone(payload: any, call: any) {
  const priorityCandidates = [
    call.remoteJid,
    call.key?.remoteJid,
    call.chatId,
    call.peerJid,
    call.participant,
    call.sender,
    call.senderId,
    call.fromNumber,
    call.fromMe ? null : call.from,
    payload?.remoteJid,
    payload?.sender,
    payload?.fromNumber,
  ];

  const candidates = [
    ...priorityCandidates.map(normalizeCallPhoneCandidate).filter(Boolean),
    ...collectCallPhoneCandidates(call),
    ...collectCallPhoneCandidates(payload?.data),
  ] as string[];

  const unique = Array.from(new Set(candidates));
  return (
    unique.find((candidate) => candidate.startsWith("55") && candidate.length >= 12) ||
    unique.find((candidate) => candidate.length === 11 || candidate.length === 10) ||
    unique[0] ||
    ""
  );
}

function extractCallInfo(payload: any) {
  const call = firstCallData(payload) || {};
  const remoteJid =
    call.remoteJid ||
    call.key?.remoteJid ||
    call.chatId ||
    call.peerJid ||
    call.participant ||
    call.sender ||
    call.from ||
    payload?.from ||
    payload?.sender ||
    payload?.remoteJid ||
    "";
  const phone = chooseCallPhone(payload, call);
  const callId = call.id || call.callId || call.call_id || call.key?.id || payload?.id || payload?.callId || null;
  const status = String(call.status || call.state || call.type || payload?.status || payload?.state || "").toLowerCase();
  const fromMe = call.fromMe === true || call.key?.fromMe === true || payload?.fromMe === true;
  const isGroup = String(remoteJid).includes("@g.us");
  const finished = /(reject|declin|accept|answer|timeout|terminate|end|close|miss)/i.test(status);

  return {
    callId: callId ? String(callId) : null,
    phone,
    remoteJid: String(remoteJid),
    fromMe,
    isGroup,
    finished,
    candidateCount: collectCallPhoneCandidates(payload).length,
  };
}

async function callEvolutionCandidates(candidates: Array<{ method: string; path: string; body: unknown }>) {
  const { url, apiKey } = getEvolutionConfig();
  let lastError: unknown = null;

  for (const candidate of candidates) {
    try {
      const res = await fetch(`${url}${candidate.path}`, {
        method: candidate.method,
        headers: { "Content-Type": "application/json", apikey: apiKey },
        body: JSON.stringify(candidate.body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) return { ok: true, data, path: candidate.path };
      lastError = { status: res.status, data, path: candidate.path };
    } catch (error) {
      lastError = error;
    }
  }

  console.warn("[WhatsApp Call Block] Evolution não confirmou recusa da chamada:", lastError);
  return { ok: false, error: lastError };
}

async function rejectIncomingCall(instanceName: string, callId: string | null, phone: string) {
  const remoteJid = `${phone}@s.whatsapp.net`;
  const body = { callId, id: callId, from: phone, number: phone, remoteJid, jid: remoteJid };
  return callEvolutionCandidates([
    { method: "POST", path: `/call/reject/${instanceName}`, body },
    { method: "POST", path: `/call/rejectCall/${instanceName}`, body },
    { method: "POST", path: `/call/decline/${instanceName}`, body },
    { method: "POST", path: `/call/end/${instanceName}`, body },
  ]);
}

async function sendCallBlockNotice(params: {
  dbInstance: WebhookInstance;
  phone: string;
  remoteJid?: string | null;
  message: string;
}) {
  const provider = getInstanceProvider(params.dbInstance);

  if (provider === "waha") {
    const recipients = [
      ...(params.remoteJid ? [params.remoteJid] : []),
      params.phone,
    ];
    let sendData: any = {};
    let sent = false;
    let lastError = "";
    for (const chatId of recipients) {
      const send = await sendWahaText({
        sessionName: params.dbInstance.name,
        chatId: toWahaChatId(chatId),
        text: params.message,
      });
      sendData = send.data;
      if (send.res.ok) {
        sent = true;
        break;
      }
      lastError = JSON.stringify(sendData).slice(0, 300);
    }
    if (!sent) {
      throw new Error(`Erro ao enviar aviso de ligação pela WAHA: ${lastError}`);
    }

    const contact = await prisma.whatsAppContact.upsert({
      where: { phone: params.phone },
      update: {},
      create: {
        phone: params.phone,
        name: params.phone,
        unit: params.dbInstance.unit || null,
      },
    });

    const privateAssignment = privateConversationAssignment(params.dbInstance);
    const conversation = await prisma.whatsAppConversation.upsert({
      where: {
        contactId_instanceId: {
          contactId: contact.id,
          instanceId: params.dbInstance.id,
        },
      },
      update: {
        status: "open",
        lastMessage: params.message,
        lastMessageAt: new Date(),
        ...(privateAssignment || {}),
      },
      create: {
        contactId: contact.id,
        instanceId: params.dbInstance.id,
        status: "open",
        lastMessage: params.message,
        lastMessageAt: new Date(),
        ...(privateAssignment || {}),
      },
    });

    await prisma.whatsAppMessage.create({
      data: {
        conversationId: conversation.id,
        messageId: extractWahaMessageId(sendData) || `call_block_waha_${conversation.id}_${Date.now()}`,
        body: params.message,
        type: "text",
        fromMe: true,
        status: "sent",
        timestamp: new Date(),
        respondedByName: "Automação",
      },
    });
    return;
  }

  const { url, apiKey } = getEvolutionConfig();

  // Contatos conhecidos só por LID (id de privacidade) não recebem quando o
  // envio é endereçado pelo telefone — tenta primeiro o JID exato da chamada.
  const jid = (params.remoteJid || "").trim();
  const recipients = [
    ...(jid && jid.includes("@") && !jid.includes("@g.us") ? [jid] : []),
    params.phone,
  ];

  let sendData: any = {};
  let sent = false;
  let lastError = "";
  for (const number of recipients) {
    const sendRes = await fetch(`${url}/message/sendText/${params.dbInstance.name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: JSON.stringify({ number, text: params.message }),
    });
    sendData = await sendRes.json().catch(() => ({}));
    if (sendRes.ok) {
      sent = true;
      break;
    }
    lastError = JSON.stringify(sendData).slice(0, 300);
  }
  if (!sent) {
    throw new Error(`Erro ao enviar aviso de ligação: ${lastError}`);
  }

  const contact = await prisma.whatsAppContact.upsert({
    where: { phone: params.phone },
    update: {},
    create: {
      phone: params.phone,
      name: params.phone,
      unit: params.dbInstance.unit || null,
    },
  });

  const privateAssignment = privateConversationAssignment(params.dbInstance);
  const conversation = await prisma.whatsAppConversation.upsert({
    where: {
      contactId_instanceId: {
        contactId: contact.id,
        instanceId: params.dbInstance.id,
      },
    },
    update: {
      status: "open",
      lastMessage: params.message,
      lastMessageAt: new Date(),
      ...(privateAssignment || {}),
    },
    create: {
      contactId: contact.id,
      instanceId: params.dbInstance.id,
      status: "open",
      lastMessage: params.message,
      lastMessageAt: new Date(),
      ...(privateAssignment || {}),
    },
  });

  await prisma.whatsAppMessage.create({
    data: {
      conversationId: conversation.id,
      messageId: sendData?.key?.id || sendData?.id || `call_block_${conversation.id}_${Date.now()}`,
      body: params.message,
      type: "text",
      fromMe: true,
      status: "sent",
      timestamp: new Date(),
      respondedByName: "Automação",
    },
  });
}

async function handleCallWebhook(
  payload: any,
  event: string | undefined,
  dbInstance: { id: string; name: string; unit?: string | null },
) {
  if (!isCallWebhookEvent(event, payload)) return false;

  const callInfo = extractCallInfo(payload);
  if (!callInfo.phone || callInfo.fromMe || callInfo.isGroup || callInfo.finished) {
    try {
      await prisma.webhookLog.create({
        data: {
          source: "whatsapp_call_block",
          eventType: event || "call",
          payload: JSON.stringify({
            instance: dbInstance.name,
            unit: dbInstance.unit,
            ignored: true,
            reason: !callInfo.phone
              ? "phone_not_found"
              : callInfo.fromMe
              ? "from_me"
              : callInfo.isGroup
              ? "group"
              : "finished",
            remoteJid: callInfo.remoteJid,
            callId: callInfo.callId,
            candidateCount: callInfo.candidateCount,
            dataKeys: payload?.data && typeof payload.data === "object" ? Object.keys(payload.data) : [],
          }).slice(0, 9000),
          status: "ignored",
        },
      });
    } catch {}
    return true;
  }

  const settings = await getCallBlockSettings();
  const unit = dbInstance.unit || "Todas";
  if (!settings.enabled || !settings.units.includes(unit)) return true;

  const rejection = await rejectIncomingCall(dbInstance.name, callInfo.callId, callInfo.phone);

  try {
    await prisma.webhookLog.create({
      data: {
        source: "whatsapp_call_block",
        eventType: event || "call",
        payload: JSON.stringify({
          instance: dbInstance.name,
          unit,
          phone: callInfo.phone,
          callId: callInfo.callId,
          rejectedByWebhook: rejection.ok,
          rejectPath: rejection.ok ? rejection.path : null,
        }).slice(0, 9000),
        status: rejection.ok ? "processed" : "received",
      },
    });
  } catch {
    // Diagnóstico não pode interromper a automação.
  }

  try {
    await sendCallBlockNotice({
      dbInstance,
      phone: callInfo.phone,
      remoteJid: callInfo.remoteJid,
      message: settings.message,
    });
  } catch (error) {
    await prisma.webhookLog.create({
      data: {
        source: "whatsapp_call_block",
        eventType: event || "call",
        payload: JSON.stringify({
          instance: dbInstance.name,
          unit,
          phone: callInfo.phone,
          callId: callInfo.callId,
          noticeFailed: true,
        }).slice(0, 9000),
        status: "error",
        errorMessage: error instanceof Error ? error.message.slice(0, 800) : String(error).slice(0, 800),
      },
    });
  }

  return true;
}

function normalizeWahaTimestamp(value: unknown) {
  const number = Number(value);
  if (Number.isFinite(number) && number > 0) {
    return number > 9999999999 ? new Date(number).toISOString() : number;
  }
  return new Date().toISOString();
}

function wahaMediaMessageKey(payload: any) {
  const mimetype = String(payload?.media?.mimetype || payload?.mimetype || "").toLowerCase();
  const type = String(payload?.type || payload?.media?.type || "").toLowerCase();
  if (mimetype.startsWith("image/") || type === "image") return "imageMessage";
  if (mimetype.startsWith("video/") || type === "video") return "videoMessage";
  if (mimetype.startsWith("audio/") || type === "audio" || type === "ptt" || type === "voice") return "audioMessage";
  if (type === "sticker") return "stickerMessage";
  return "documentMessage";
}

function normalizeWahaMessage(payload: any) {
  const body = payload?.body || payload?.text || payload?.caption || payload?.message || "";
  const fromMe = payload?.fromMe === true;
  const remoteJid = String(
    (fromMe ? payload?.to || payload?.chatId || payload?.from : payload?.from || payload?.chatId || payload?.to) || ""
  );
  const messageId = payload?.id || payload?._data?.id?._serialized || payload?.messageId;
  const media = payload?.media || {};
  const message: Record<string, any> = {};

  if (media?.url || media?.data || payload?.hasMedia || payload?.type === "image" || payload?.type === "video" || payload?.type === "audio") {
    const key = wahaMediaMessageKey(payload);
    message[key] = {
      url: media.url || payload?.mediaUrl || undefined,
      base64: media.data || media.base64 || undefined,
      mimetype: media.mimetype || payload?.mimetype || undefined,
      caption: body || undefined,
      fileName: media.filename || media.fileName || payload?.filename || undefined,
      fileLength: media.filesize || media.fileSize || media.size || payload?.filesize || payload?.fileSize || undefined,
      ptt: payload?.type === "ptt" || payload?.type === "voice" || undefined,
    };
  } else {
    message.conversation = body;
  }

  return {
    key: {
      remoteJid,
      fromMe,
      id: messageId,
    },
    pushName: payload?.pushName || payload?.notifyName || payload?._data?.notifyName || undefined,
    message,
    messageTimestamp: normalizeWahaTimestamp(payload?.timestamp || payload?.t),
    messageType: Object.keys(message)[0] || "conversation",
    status: payload?.ackName || payload?.ack !== undefined
      ? normalizeWahaAckStatus(payload?.ackName, typeof payload?.ack === "number" ? payload.ack : null)
      : undefined,
    fromMe,
    chatid: remoteJid,
    sender: remoteJid,
  };
}

async function handleWahaAck(payload: any, dbInstance: WebhookInstance) {
  const ack = payload?.payload || payload?.data || payload;
  const messageId = ack?.id || ack?._data?.id?._serialized || ack?.messageId;
  if (!messageId) return true;

  const nextStatus = normalizeWahaAckStatus(ack?.ackName, typeof ack?.ack === "number" ? ack.ack : null);
  const existing = await prisma.whatsAppMessage.findFirst({
    where: {
      messageId,
      conversation: { instanceId: dbInstance.id },
    },
    select: { id: true, status: true, conversationId: true },
  });
  if (!existing || existing.status === "deleted") return true;

  await prisma.whatsAppMessage.update({
    where: { id: existing.id },
    data: { status: nextStatus },
  });

  await prisma.webhookLog.create({
    data: {
      source: "whatsapp_waha",
      eventType: "message_status_update",
      status: "received",
      payload: JSON.stringify({
        instanceId: dbInstance.id,
        instanceName: dbInstance.name,
        conversationId: existing.conversationId,
        messageDbId: existing.id,
        messageId,
        previousStatus: existing.status,
        nextStatus,
        ack: ack?.ack ?? null,
        ackName: ack?.ackName || null,
      }).slice(0, 3000),
    },
  }).catch(() => {});

  return true;
}

async function handleWahaWebhook(payload: any, event: string | undefined, dbInstance: WebhookInstance) {
  if (event === "session.status") {
    const status = normalizeWahaStatus(payload?.payload?.status || payload?.status || payload?.data?.status);
    await prisma.whatsAppInstance.update({
      where: { id: dbInstance.id },
      data: {
        status,
        qrcode: status === "connected" ? null : undefined,
        phoneNumber: payload?.payload?.me?.id?.split("@")?.[0] || undefined,
      },
    });
    if (status !== dbInstance.status) {
      await logWebhookStatusChange({
        source: "whatsapp_waha",
        eventType: "session_status_changed",
        dbInstance,
        previousStatus: dbInstance.status,
        nextStatus: status,
        rawEvent: event,
        payload: {
          status: payload?.payload?.status || payload?.status || payload?.data?.status || null,
          me: payload?.payload?.me?.id || null,
        },
      });
    }
    return true;
  }

  if (event === "message.ack") {
    return handleWahaAck(payload, dbInstance);
  }

  if (event === "message" || event === "message.any" || event === "message.waiting") {
    const msgPayload = payload?.payload || payload?.data || payload?.message || payload;
    if (!msgPayload) return true;
    await processMessage(normalizeWahaMessage(msgPayload), dbInstance, payload);
    return true;
  }

  return false;
}

/**
 * Webhook handler compatível com Evolution API v2.
 * 
 * Eventos tratados:
 * - messages.upsert    → Nova mensagem recebida/enviada
 * - messages.update    → Atualização de status da mensagem
 * - connection.update  → Mudança no status da conexão
 * - qrcode.updated     → Novo QR code gerado
 */
export async function POST(req: Request) {
  try {
    const payload = await req.json();

    // Evolution API v2 envia: { event, instance, data, ... }
    // WAHA envia: { event, session, payload, ... }
    const rawEvent = payload.event || payload.EventType || payload.action;
    const event = normalizeEvolutionWebhookEvent(rawEvent);
    const instanceName = payload.instance || payload.instanceName || payload.session;

    if (!instanceName && !payload.token) {
      return NextResponse.json({ success: true });
    }

    // Buscar instância no banco — Evolution identifica por nome, não por token
    const dbInstance = await prisma.whatsAppInstance.findFirst({
      where: payload.token
        ? { token: payload.token }          // fallback Uazapi (compatibilidade)
        : { name: instanceName },           // Evolution API
      include: { user: { select: { name: true } } },
    });

    if (!dbInstance) {
      return NextResponse.json({ success: true });
    }

    const provider = getInstanceProvider(dbInstance);
    if (provider === "waha") {
      if (await handleWahaWebhook(payload, event, dbInstance)) {
        return NextResponse.json({ success: true });
      }
      return NextResponse.json({ success: true });
    }

    // Auto-aplica rejeição de chamadas na Evolution (throttled, não bloqueia)
    ensureCallRejectApplied(dbInstance).catch(() => {});

    // ─── CHAMADAS ─────────────────────────────────────────────
    if (await handleCallWebhook(payload, event, dbInstance)) {
      return NextResponse.json({ success: true });
    }

    // ─── MENSAGENS ────────────────────────────────────────────
    if (
      event === "messages.upsert" ||
      event === "messages_upsert" ||
      event === "messages" ||
      event === "messages_update" ||
      event === "messages.update"
    ) {
      // Evolution: dados em payload.data; Uazapi fallback: payload.message
      const msgData = payload.data || payload.message;
      if (!msgData) return NextResponse.json({ success: true });

      // Evolution pode enviar array ou objeto único
      const messages = Array.isArray(msgData) ? msgData : [msgData];

      for (const msg of messages) {
        try {
          await processMessage(msg, dbInstance, payload);
        } catch (messageError: any) {
          console.error("[WhatsApp Webhook Message Error]:", messageError);
          await prisma.webhookLog.create({
            data: {
              source: "whatsapp",
              eventType: "message_error",
              payload: JSON.stringify({
                instance: dbInstance.name,
                event,
                rawEvent,
                messageId: msg?.key?.id || msg?.messageid || msg?.id || null,
                remoteJid: msg?.key?.remoteJid || msg?.chatid || msg?.sender || null,
                fromMe: msg?.key?.fromMe ?? msg?.fromMe ?? null,
                status: msg?.status ?? null,
              }).slice(0, 2000),
              status: "error",
              errorMessage: messageError?.message || "Erro ao processar mensagem",
            },
          }).catch(() => {});
        }
      }
    }

    // ─── CONEXÃO ──────────────────────────────────────────────
    if (event === "connection.update" || event === "connection_update" || event === "connection") {
      const state = payload.data?.state || payload.data?.status || payload.status;
      if (state) {
        const newStatus = state === "open" ? "connected"
          : state === "close" ? "disconnected"
          : state === "connecting" ? "connecting"
          : state;
        const qrcode = newStatus === "connected" || newStatus === "disconnected" ? null : undefined;

        await prisma.whatsAppInstance.update({
          where: { id: dbInstance.id },
          data: { status: newStatus, qrcode },
        });
        if (newStatus !== dbInstance.status) {
          await logWebhookStatusChange({
            source: "whatsapp_evolution",
            eventType: "connection_update_status_changed",
            dbInstance,
            previousStatus: dbInstance.status,
            nextStatus: newStatus,
            rawEvent,
            payload: {
              state,
              status: payload.status || null,
              instance: payload.instance || payload.instanceName || null,
              data: payload.data || null,
            },
          });
        }
      }
    }

    // ─── QR CODE ──────────────────────────────────────────────
    if (event === "qrcode.updated" || event === "qrcode_updated" || event === "qrcode") {
      const qrBase64 = payload.data?.qrcode?.base64 || payload.data?.base64 || payload.qrcode;
      if (qrBase64) {
        await prisma.whatsAppInstance.update({
          where: { id: dbInstance.id },
          data: { qrcode: qrBase64, status: "connecting" },
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[WhatsApp Webhook Error]:", error);
    return NextResponse.json({ success: false, error: error.message });
  }
}

/**
 * Processa uma mensagem individual do webhook
 */
async function processMessage(
  msg: any,
  dbInstance: WebhookInstance,
  payload: any
) {
  // ─── Extrair dados da mensagem ────────────────────────────
  // Evolution API v2 format:
  //   msg.key.remoteJid, msg.key.fromMe, msg.key.id
  //   msg.pushName
  //   msg.message.conversation | msg.message.extendedTextMessage.text
  //   msg.messageTimestamp (unix seconds number)
  //   msg.messageType ("conversation", "extendedTextMessage", "imageMessage", etc.)
  //
  // Uazapi fallback format:
  //   msg.chatid, msg.fromMe, msg.messageid
  //   msg.senderName | msg.pushName
  //   msg.text
  //   msg.messageTimestamp (ISO string)

  const remoteJid = msg.key?.remoteJid || msg.chatid || msg.sender;
  if (!remoteJid) return;

  // Ignora grupos
  if (remoteJid.includes("@g.us")) return;

  const resolvedContact = resolveInboundContactIdentifier(msg, String(remoteJid));
  if (!resolvedContact) {
    await prisma.webhookLog.create({
      data: {
        source: "whatsapp",
        eventType: "message_ignored",
        payload: JSON.stringify({
          reason: "no_contact_identifier",
          instance: dbInstance.name,
          messageId: msg.key?.id || msg.messageid || msg.id || null,
          remoteJid,
        }).slice(0, 2000),
        status: "ignored",
      },
    }).catch(() => {});
    return;
  }

  const { contactPhone, isSendablePhone } = resolvedContact;
  if (!isSendablePhone) {
    // Contatos LID (@lid) sem telefone real ainda precisam aparecer no CRM.
    // Não criamos lead/automação para eles, mas registramos a conversa.
    const lidMessageId = msg.key?.id || msg.messageid || msg.id;
    if (lidMessageId && msg.status !== undefined) {
      const newStatus = mapEvolutionMessageStatus(msg.status, "sent");
      await prisma.whatsAppMessage.updateMany({
        where: {
          messageId: lidMessageId,
          status: { notIn: ["deleted", "read", "played"] },
          conversation: { instanceId: dbInstance.id },
        },
        data: { status: newStatus },
      });
    }
  }

  const isFromMe = msg.key?.fromMe ?? msg.fromMe ?? false;
  const messageId = msg.key?.id || msg.messageid || msg.id;
  if (!messageId) return;

  // ─── Extrair texto do corpo da mensagem ─────────────────────
  const messageBody = extractMessageBody(msg);

  // ─── Extrair tipo da mensagem ───────────────────────────────
  const msgType = extractMessageType(msg);

  // ─── Extrair nome do contato ────────────────────────────────
  const contactName = resolveContactNameFromMessage(msg, contactPhone, isFromMe);

  // ─── Extrair foto de perfil (se disponível) ──────────────────
  const profilePicFromPayload: string | null =
    msg.profilePicUrl ||
    msg.senderProfilePicUrl ||
    msg.contact?.profilePicUrl ||
    msg.chat?.profilePicUrl ||
    null;

  // ═══ 1. Encontrar ou criar contato ════════════════════════
  let contact = await prisma.whatsAppContact.findUnique({
    where: { phone: contactPhone },
  });

  if (!contact) {
    try {
      contact = await prisma.whatsAppContact.create({
        data: {
          phone: contactPhone,
          name: contactName,
          profilePic: profilePicFromPayload,
          unit: dbInstance.unit || null,
        },
      });
    } catch (error) {
      if (!isPrismaUniqueConstraintError(error)) throw error;
      contact = await prisma.whatsAppContact.findUnique({
        where: { phone: contactPhone },
      });
      if (!contact) throw error;
    }
  } else {
    const updates: any = {};
    if (shouldUpdateContactName(contact.name, contactName, contactPhone)) updates.name = contactName;
    if (profilePicFromPayload && !contact.profilePic) updates.profilePic = profilePicFromPayload;
    if (Object.keys(updates).length > 0) {
      contact = await prisma.whatsAppContact.update({
        where: { id: contact.id },
        data: updates,
      });
    }
  }

  // ═══ 2. Encontrar ou criar conversa (upsert para evitar duplicatas) ═══
  // Primeiro tentar encontrar
  const existingConv = await prisma.whatsAppConversation.findUnique({
    where: {
      contactId_instanceId: {
        contactId: contact.id,
        instanceId: dbInstance.id,
      },
    },
  });

  const privateAssignment = privateConversationAssignment(dbInstance);

  let conversation = existingConv;
  if (!conversation) {
    try {
      conversation = await prisma.whatsAppConversation.create({
        data: {
          instanceId: dbInstance.id,
          contactId: contact.id,
          status: "open",
          ...(privateAssignment || {}),
        },
      });
    } catch (error) {
      if (!isPrismaUniqueConstraintError(error)) throw error;
      conversation = await prisma.whatsAppConversation.findUnique({
        where: {
          contactId_instanceId: {
            contactId: contact.id,
            instanceId: dbInstance.id,
          },
        },
      });
      if (!conversation) throw error;
    }
  }

  // Auto-reopen: se conversa está resolved/closed e cliente envia nova mensagem, reabrir
  if (conversation && !isFromMe && (conversation.status === 'resolved' || conversation.status === 'closed')) {
    conversation = await prisma.whatsAppConversation.update({
      where: { id: conversation.id },
      data: {
        status: 'open',
        reopenedAt: new Date(),
        reopenCount: { increment: 1 },
      },
    });
  }

  if (
    privateAssignment &&
    (conversation.assignedTo !== privateAssignment.assignedTo ||
      conversation.assignedToName !== privateAssignment.assignedToName)
  ) {
    conversation = await prisma.whatsAppConversation.update({
      where: { id: conversation.id },
      data: privateAssignment,
    });
  }

  // Guarda o JID exato usado pela sessão para este contato — mensagens
  // enviadas pelo telefone falham silenciosamente quando o WhatsApp só
  // reconhece o contato pelo LID (ver AGENTS.md).
  if (!isFromMe && remoteJid && remoteJid.includes("@") && conversation.lastKnownJid !== remoteJid) {
    conversation = await prisma.whatsAppConversation.update({
      where: { id: conversation.id },
      data: { lastKnownJid: remoteJid },
    });
  }

  // ─── Extrair metadados de anúncio (Click to WhatsApp) ────────
  const leadUnit = commercialLeadUnit(dbInstance.unit);
  const capturesLeads = dbInstance.capturesLeads !== false;
  const canCaptureLead = capturesLeads && !!leadUnit;
  if (!canCaptureLead && !isFromMe && isSendablePhone) {
    await prisma.webhookLog.create({
      data: {
        source: "whatsapp",
        eventType: "lead_capture_skipped",
        payload: JSON.stringify({
          reason: capturesLeads ? "lead_unit_not_determined" : "captures_leads_disabled",
          instanceId: dbInstance.id,
          instanceName: dbInstance.name,
          instanceUnit: dbInstance.unit || null,
          contactPhone,
          messageId,
        }).slice(0, 2000),
        status: capturesLeads ? "error" : "ignored",
        errorMessage: capturesLeads
          ? "Instancia configurada para gerar leads sem unidade comercial valida"
          : null,
      },
    }).catch(() => {});
  }
  let adTitle: string | null = null;
  let adSourceUrl: string | null = null;
  let adId: string | null = null;
  let adBody: string | null = null;
  let adDescription: string | null = null;

  const ctxInfo = msg.contextInfo ||
                  msg.message?.contextInfo ||
                  msg.message?.extendedTextMessage?.contextInfo ||
                  msg.message?.imageMessage?.contextInfo ||
                  msg.message?.videoMessage?.contextInfo ||
                  msg.message?.documentMessage?.contextInfo;

  // Baileys/Evolution entregam o anúncio em `externalAdReply`.
  // Algumas versões/integrações expõem como `adReply` — aceitamos os dois.
  const adReply = ctxInfo?.externalAdReply || ctxInfo?.adReply;
  const quotedMessageId =
    typeof ctxInfo?.stanzaId === "string" ? ctxInfo.stanzaId :
    typeof ctxInfo?.quotedMessageId === "string" ? ctxInfo.quotedMessageId :
    typeof ctxInfo?.quotedStanzaId === "string" ? ctxInfo.quotedStanzaId :
    null;
  const quotedMessageFromDb = quotedMessageId
    ? await prisma.whatsAppMessage.findFirst({
        where: {
          conversationId: conversation.id,
          messageId: quotedMessageId,
        },
        select: {
          messageId: true,
          body: true,
          type: true,
          mediaFileName: true,
          fromMe: true,
        },
      })
    : null;
  const quotedMessageFromPayload = extractQuotedMessageMetadata(ctxInfo);
  const quotedMessageData = quotedMessageId
    ? {
        quotedMessageId,
        quotedMessageBody: quotedMessagePreview(quotedMessageFromDb || quotedMessageFromPayload),
        quotedMessageType: quotedMessageFromDb?.type || quotedMessageFromPayload?.type || "text",
        quotedMessageFromMe: quotedMessageFromDb?.fromMe ?? null,
      }
    : null;

  if (adReply) {
    adTitle = adReply.title || adReply.body || adReply.description || "Campanha Desconhecida";
    adBody = adReply.body || null;
    adDescription = adReply.description || null;
    adSourceUrl = adReply.sourceUrl || adReply.source_url || null;
    adId = adReply.sourceId || adReply.source_id || null;
  }
  if (!adId && adSourceUrl) {
    adId = extractAdIdFromSourceUrl(adSourceUrl);
  }

  // Fallback para mensagens via wa.me com texto pré-definido (sem adReply nativo)
  const textBody = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || "").toLowerCase();
  if (!adTitle && textBody) {
    if (
      textBody.includes('tenho interesse e queria mais informações') ||
      textBody.includes('oi! como podemos ajudar') ||
      textBody.includes('vi no facebook') ||
      textBody.includes('vi no instagram') ||
      textBody.includes('anúncio') ||
      textBody.includes('gostaria de saber mais sobre o anúncio')
    ) {
      adTitle = VIA_LINK_CAMPAIGN_LABEL;
    }
  }

  // Resolver o NOME REAL da campanha via Graph API a partir do ID do anúncio.
  // O `sourceId` é o id do *anúncio*; o Graph mapeia anúncio → campanha.
  let resolvedCampaignName: string | null = null;
  let resolvedCampaignId: string | null = null;
  let resolvedAdName: string | null = null;
  let graphResolutionStatus = adId ? "not_attempted" : "no_ad_id";
  let graphResolutionError: string | null = null;
  if (canCaptureLead && adId) {
    const resolved = await resolveCampaignFromAdId(adId, leadUnit);
    graphResolutionStatus = resolved?.status || "not_attempted";
    graphResolutionError = resolved?.errorMessage || resolved?.errorType || null;
    if (resolved?.campaignName) {
      resolvedCampaignName = resolved.campaignName;
      resolvedCampaignId = resolved.campaignId || null;
      resolvedAdName = resolved.adName || null;
    }
  }

  const adSignal = [
    resolvedCampaignName,
    resolvedAdName,
    adTitle,
    adBody,
    adDescription,
    adSourceUrl,
    textBody,
  ].filter(Boolean).join(" ");
  const hasCampaignSignal = !!adTitle || !!adId || !!adSourceUrl || !!adReply;
  const managedCampaignName = canCaptureLead && hasCampaignSignal ? await inferManagedCampaignName(adSignal, leadUnit) : null;
  const keywordCampaignName = canCaptureLead && hasCampaignSignal ? inferCampaignByKeywords(adSignal) : null;
  const messageKeywordCampaignName = canCaptureLead
    ? inferCampaignByKeywords([messageBody, textBody].filter(Boolean).join(" "))
    : null;

  // id da campanha real, senão o id do anúncio (preserva rastreio p/ backfill)
  const campaignTrackId: string | null = canCaptureLead ? (resolvedCampaignId || adId) : null;
  // A conta secundária de Osasco é dedicada à Barriga Trincada. Esse fallback
  // evita perder o rótulo quando a Meta entrega placeholders como {{product.name}}.
  const accountCampaignName = campaignNameFromAccountTrackId(campaignTrackId);
  // O marcador da conta secundária é uma regra operacional confirmada e deve
  // prevalecer sobre inferências textuais que podem classificar o anúncio errado.
  const fallbackCampaignName = normalizeCampaignNameForWrite(adTitle);
  const campaignName: string | null = canCaptureLead && hasCampaignSignal
    ? accountCampaignName || keywordCampaignName || managedCampaignName || resolvedCampaignName || fallbackCampaignName
    : null;

  // Timestamp: Evolution usa unix seconds (number), Uazapi usa ISO string.
  const timestamp =
    typeof msg.messageTimestamp === "number"
      ? new Date(msg.messageTimestamp * 1000)
      : msg.messageTimestamp
        ? new Date(msg.messageTimestamp)
        : new Date();

  // ─── Diagnóstico: registrar estrutura de mensagens de anúncio ────────────────
  // Guarda um resumo leve apenas quando o CTWA nao foi classificado.
  const resolvedRealCampaign = !!campaignName && !isGenericCampaignName(campaignName);
  if (canCaptureLead && process.env.WHATSAPP_CTWA_DIAG_LOGS === "1" && !isFromMe && (adTitle || ctxInfo) && !resolvedRealCampaign) {
    try {
      const snapshot = {
        phone: contactPhone,
        unit: leadUnit,
        detectedCampaign: campaignName,
        unresolvedReason: ctwaUnresolvedReason({
          hasCampaignSignal,
          hasAdReply: !!adReply,
          adId,
          adSourceUrl,
          graphStatus: graphResolutionStatus,
          managedCampaignName,
          keywordCampaignName,
          fallbackCampaignName,
        }),
        managedCampaignName,
        keywordCampaignName,
        adId,
        adSourceUrl,
        graphStatus: graphResolutionStatus,
        graphError: graphResolutionError,
        hasExternalAdReply: !!ctxInfo?.externalAdReply,
        hasAdReply: !!ctxInfo?.adReply,
        messageType: msg.messageType,
        contextInfoKeys: ctxInfo ? Object.keys(ctxInfo) : [],
        contextSummary: {
          conversionSource: ctxInfo?.conversionSource || null,
          entryPointConversionSource: ctxInfo?.entryPointConversionSource || null,
          entryPointConversionApp: ctxInfo?.entryPointConversionApp || null,
          entryPointConversionExternalSource: ctxInfo?.entryPointConversionExternalSource || null,
          entryPointConversionExternalMedium: ctxInfo?.entryPointConversionExternalMedium || null,
          hasCtwaSignals: ctxInfo?.ctwaSignals != null,
          hasCtwaPayload: ctxInfo?.ctwaPayload != null,
        },
        adReplyRaw: compactAdReply(ctxInfo?.externalAdReply ?? ctxInfo?.adReply),
      };
      await prisma.webhookLog.create({
        data: {
          source: "whatsapp_ad",
          eventType: "ctwa_diag",
          payload: JSON.stringify(snapshot).slice(0, 3500),
          status: "received",
        },
      });
    } catch { /* diagnóstico não pode quebrar o fluxo */ }
  }

  // ═══ 3. Auto-criar pessoa (Client) + negócio no Pipeline ═══
  // GARANTIA: qualquer mensagem RECEBIDA assegura a existência da pessoa e do
  // negócio. Antes só rodava em contato/conversa novos — então um lead que o
  // negócio contatou primeiro (broadcast/saudação) e depois respondeu ficava
  // sem pessoa. O bloco é idempotente (só cria o que ainda não existe).
  let leadClient: { id: string; name: string; phone: string | null; source: string | null; fbclid: string | null } | null = null;
  if (canCaptureLead && !isFromMe && isSendablePhone) {
    try {
      const contactDigits = phoneDigits(contactPhone);
      const suffix = contactDigits.slice(-8);
      const phoneConditions: Array<{ phone: string | { contains: string } }> = [
        { phone: contactPhone },
        ...(contactDigits ? [{ phone: { contains: contactDigits } }] : []),
        ...(suffix.length >= 8 ? [{ phone: { contains: suffix } }] : []),
      ];
      const clientCandidates = await prisma.client.findMany({
        where: { isActive: true, OR: phoneConditions },
        orderBy: { updatedAt: "desc" },
        take: 10,
        select: {
          id: true,
          name: true,
          phone: true,
          source: true,
          fbclid: true,
          campaignName: true,
          campaignId: true,
          campaignAttribution: true,
          unit: true,
          userId: true,
          arrivedAt: true,
          updatedAt: true,
        },
      });
      let client = pickBestClientCandidate(clientCandidates, { contactPhone, leadUnit, hasCampaignSignal });

      if (!client) {
        client = await prisma.client.create({
          data: {
            name: contactName !== contactPhone ? contactName : `Lead WhatsApp ${contactPhone}`,
            phone: contactPhone,
            source: hasCampaignSignal ? "facebook_ad" : "whatsapp",
            campaignName: campaignName || undefined,
            campaignId: campaignTrackId || undefined,
            campaignAttribution: hasCampaignSignal ? "automatic_meta" : undefined,
            fbclid: adSourceUrl || undefined,
            stage: "entrada",
            arrivedAt: timestamp,
            unit: leadUnit,
            originUnit: leadUnit,
            userId: dbInstance.userId || null,
          },
        });
      } else if (campaignName || hasCampaignSignal || dbInstance.userId || messageKeywordCampaignName) {
        // Só grava campanha se: ainda não há campanha, OU estamos fazendo
        // upgrade de um rótulo genérico para o nome real (evita regressão).
        // Correção controlada: versões antigas podiam marcar como HyperSlim
        // anúncios de Barriga/Gordura por palavras genéricas como "definição".
        // Quando chega um novo sinal explícito do anúncio, permitimos reparar
        // apenas esse par conhecido, sem recriar lead nem alterar chegada.
        const campaignNameForUpdate =
          campaignName ||
          (client.source === "facebook_ad" && isGenericCampaignName(client.campaignName)
            ? messageKeywordCampaignName
            : null);
        const shouldRepairHyperSlim =
          !!campaignNameForUpdate &&
          client.campaignName === "HyperSlim" &&
          ["Barriga Trincada", "Gordura Localizada"].includes(campaignNameForUpdate);
        const shouldSetCampaign =
          !!campaignNameForUpdate &&
          (!client.campaignName ||
            (isViaLinkCampaignName(campaignNameForUpdate) && isGenericCampaignName(client.campaignName)) ||
            (!isGenericCampaignName(campaignNameForUpdate) && isGenericCampaignName(client.campaignName)) ||
            shouldRepairHyperSlim);
        client = await prisma.client.update({
          where: { id: client.id },
          data: {
            ...(shouldSetCampaign
              ? {
                  ...(!client.source ? { source: "facebook_ad" } : {}),
                  campaignName: campaignNameForUpdate,
                  campaignId: campaignTrackId || undefined,
                  campaignAttribution: "automatic_meta",
                  fbclid: adSourceUrl || undefined,
                }
              : hasCampaignSignal
                ? {
                    ...(!client.source ? { source: "facebook_ad" } : {}),
                    campaignId: campaignTrackId || undefined,
                    campaignAttribution: "automatic_meta",
                    ...(adSourceUrl && !client.fbclid ? { fbclid: adSourceUrl } : {}),
                  }
                : {}),
            // só corrige a unidade se a atual for inválida/oculta — não bagunça
            // um cliente que já está numa unidade visível correta.
            ...(!client.unit || !commercialLeadUnit(client.unit) ? { unit: leadUnit } : {}),
            ...(dbInstance.userId && !client.userId ? { userId: dbInstance.userId } : {}),
            ...(!client.arrivedAt ? { arrivedAt: timestamp } : {}),
          }
        });
      }
      leadClient = client
        ? { id: client.id, name: client.name, phone: client.phone, source: client.source, fbclid: client.fbclid }
        : null;

      const existingDeal = await prisma.salesPipeline.findFirst({
        where: {
          clientId: client.id,
          lostReason: null,
          closedAt: null,
        },
      });

      if (!existingDeal) {
        const defaultPipeline = await prisma.pipeline.findFirst({
          where: { unit: leadUnit },
          orderBy: { createdAt: "asc" },
        });

        let defPipelineId: string | null = null;
        let defStageId: string | null = null;

        if (defaultPipeline) {
          defPipelineId = defaultPipeline.id;
          const firstStage = await prisma.pipelineStage.findFirst({
            where: { pipelineId: defaultPipeline.id },
            orderBy: { position: "asc" },
          });
          if (firstStage) defStageId = firstStage.id;
        }

        await prisma.salesPipeline.create({
          data: {
            clientId: client.id,
            clientName: client.name,
            stage: "novo_lead",
            pipelineId: defPipelineId,
            stageId: defStageId,
            source: "whatsapp",
            unit: leadUnit,
            notes: `Lead via WhatsApp (${contactPhone})`,
            assignedTo: dbInstance.userId || null,
            assignedName: dbInstance.user?.name || null,
            campaignIdSnapshot: client.campaignId || null,
            campaignNameSnapshot: client.campaignName || null,
            campaignAttributionSnapshot: client.campaignAttribution || null,
          },
        });
      }
    } catch (e) {
      console.error("[Webhook] Erro ao criar negócio automático:", e);
    }
  }

  // ═══ 3.5 Automação nativa: saudação CTWA + captura de nome ═══
  if (canCaptureLead && !isFromMe && isSendablePhone) {
    try {
      const automation = await findCtwaWelcomeAutomation(leadUnit);
      const previousWaitingLog = automation ? await prisma.automationLog.findFirst({
        where: {
          automationId: automation.id,
          contactPhone,
          result: "waiting_name",
          triggerData: { path: ["conversationId"], equals: conversation.id },
        },
        orderBy: { executedAt: "desc" },
      }) : null;

      if (automation && previousWaitingLog) {
        const humanReplyAfterGreeting = conversation.assignedTo
          ? null
          : await prisma.whatsAppMessage.findFirst({
              where: {
                conversationId: conversation.id,
                fromMe: true,
                timestamp: {
                  gte: previousWaitingLog.executedAt,
                  lt: timestamp,
                },
                OR: [
                  { respondedByName: null },
                  { respondedByName: { not: "Automação" } },
                ],
              },
              select: { id: true },
            });

        const previousInboundReplies = await prisma.whatsAppMessage.count({
          where: {
            conversationId: conversation.id,
            fromMe: false,
            timestamp: { gte: previousWaitingLog.executedAt },
          },
        });
        const allowBareName =
          previousInboundReplies === 0 &&
          isInsideLeadNameReplyWindow({
            waitingSince: previousWaitingLog.executedAt,
            replyAt: timestamp,
          });
        const capturedName = extractLeadName(messageBody, { allowBareName });

        if (capturedName) {
          const waitingData = (previousWaitingLog.triggerData as Record<string, unknown>) || {};
          const waitingClientId = typeof waitingData.clientId === "string" ? waitingData.clientId : null;
          const clientIdsForNameUpdate = Array.from(new Set(
            [waitingClientId, leadClient?.id].filter((id): id is string => !!id)
          ));
          const syncedName = await syncLeadNameAcrossCrm({
            contactId: contact.id,
            name: capturedName,
            clientIds: clientIdsForNameUpdate,
            phone: contactPhone,
            unit: leadUnit,
          });

          const followUpSkippedReason = conversation.assignedTo
            ? "conversation_assigned"
            : humanReplyAfterGreeting
              ? "human_reply"
              : null;

          if (!followUpSkippedReason) {
            const secondMessage = getStepMessage(
              automation.steps,
              1,
              "Prazer em conhecer você, {{nome}}! 💗\n\nEm breve, nossa atendente dará continuidade ao seu atendimento."
            ).replace(/\{\{\s*nome\s*\}\}/gi, capturedName);

            await sendAutomationText({
              dbInstance,
              conversationId: conversation.id,
              contactPhone,
              message: secondMessage,
            });
          }

          await prisma.automationLog.update({
            where: { id: previousWaitingLog.id },
            data: {
              result: "completed",
              contactName: capturedName,
              triggerData: {
                ...((previousWaitingLog.triggerData as Record<string, unknown>) || {}),
                capturedName,
                nameCapturedAt: new Date().toISOString(),
                nameCaptureFollowUpSkippedReason: followUpSkippedReason,
                updatedClients: syncedName.updatedClients,
                updatedDeals: syncedName.updatedDeals,
                updatedEvaluations: syncedName.updatedEvaluations,
              },
            },
          });

          await prisma.automation.update({
            where: { id: automation.id },
            data: { lastExecutedAt: new Date() },
          });
        } else {
          await cancelWaitingLeadNameLog({
            logId: previousWaitingLog.id,
            triggerData: previousWaitingLog.triggerData,
            reason: conversation.assignedTo
              ? "conversation_assigned"
              : humanReplyAfterGreeting
                ? "human_reply"
                : "reply_not_name",
          });
        }
      }

      const hasRealCtwaSignal = !!adReply || !!adSourceUrl || !!adId;
      const isCtwaLead = hasRealCtwaSignal && leadClient?.source === "facebook_ad";
      const triggerConfig = (automation?.triggerConfig as any) || {};
      const units = Array.isArray(triggerConfig.units) ? triggerConfig.units as string[] : [];
      const appliesToUnit = !automation || units.length === 0 || units.includes(leadUnit);
      const existingAutomationLog = automation ? await prisma.automationLog.findFirst({
        where: {
          automationId: automation.id,
          contactPhone,
          triggerData: { path: ["conversationId"], equals: conversation.id },
        },
        orderBy: { executedAt: "desc" },
      }) : null;
      const messageCountBeforeCurrent = await prisma.whatsAppMessage.count({
        where: { conversationId: conversation.id },
      });

      if (
        automation &&
        appliesToUnit &&
        isCtwaLead &&
        !existingAutomationLog &&
        !conversation.assignedTo &&
        messageCountBeforeCurrent === 0
      ) {
        const firstMessage = getStepMessage(
          automation.steps,
          0,
          "Olá! Seja muito bem-vinda(o) à Clínica Virtuosa. ✨\n\nEstamos felizes com o seu interesse em nossos tratamentos. Pode me informar o seu nome ?"
        );

        await sendAutomationText({
          dbInstance,
          conversationId: conversation.id,
          contactPhone,
          message: firstMessage,
        });

        await prisma.automationLog.create({
          data: {
            automationId: automation.id,
            contactPhone,
            contactName: contact.name || leadClient?.name || null,
            result: "waiting_name",
            triggerData: {
              conversationId: conversation.id,
              clientId: leadClient?.id || null,
              unit: leadUnit,
              campaignName,
              campaignId: campaignTrackId,
              adSourceUrl,
              firstInboundMessageId: messageId,
              greetingSentAt: new Date().toISOString(),
            },
          },
        });

        await prisma.automation.update({
          where: { id: automation.id },
          data: {
            executionCount: { increment: 1 },
            lastExecutedAt: new Date(),
          },
        });
      }
    } catch (e) {
      console.error("[Webhook] Erro na automação CTWA:", e);
    }
  }

  // Checar se é resposta de pesquisa CSAT (1, 2, ou 3)
  if (!isFromMe && conversation && ['1', '2', '3'].includes(messageBody.trim())) {
    const csatMap: Record<string, number> = { '1': 5, '2': 3, '3': 1 };
    const score = csatMap[messageBody.trim()];
    if (score && !conversation.satisfactionScore) {
      await prisma.whatsAppConversation.update({
        where: { id: conversation.id },
        data: { satisfactionScore: score },
      });
    }
  }

  // ═══ 4. Salvar ou atualizar mensagem ═══════════════════════
  // A busca é escopada à conversa: o messageId do WhatsApp é o mesmo para
  // remetente e destinatário, então quando dois números conectados no CRM
  // conversam entre si a mensagem precisa existir nas DUAS caixas.
  const existingMsg = await prisma.whatsAppMessage.findUnique({
    where: {
      conversationId_messageId: {
        conversationId: conversation.id,
        messageId,
      },
    },
  });
  let persistedMessageDbId = existingMsg?.id || null;
  let persistedMessageType = existingMsg?.type || null;
  let persistedMessageMediaUrl = existingMsg?.mediaUrl || null;

  if (!existingMsg) {
    let mediaUrl: string | null = null;
    let mediaFileName: string | null = null;
    let mediaMimeType: string | null = null;
    let mediaSizeBytes: number | null = null;
    let finalMsgType = msgType;

    // Na Evolution API v2, mídia pode vir como base64 no payload ou precisar download
    const isMedia = ["image", "video", "audio", "document", "ptt", "sticker",
      "imageMessage", "videoMessage", "audioMessage", "documentMessage", "stickerMessage",
      "pttMessage", "media", "videoplay"].includes(msgType);

    if (isMedia) {
      const mediaMessage = msg.message?.imageMessage || msg.message?.videoMessage ||
        msg.message?.audioMessage || msg.message?.documentMessage ||
        msg.message?.stickerMessage;

      if (mediaMessage) {
        mediaFileName = cleanMediaFileName(
          mediaMessage.fileName ||
          mediaMessage.filename ||
          mediaMessage.title ||
          msg.fileName ||
          msg.filename
        );
        mediaMimeType = cleanMediaMimeType(mediaMessage.mimetype || mediaMessage.mimeType || msg.mimetype);
        mediaSizeBytes = parseMediaSizeBytes(
          mediaMessage.fileLength ||
          mediaMessage.fileSize ||
          mediaMessage.size ||
          msg.fileLength ||
          msg.fileSize
        );

        // Tentar baixar mídia via Evolution API getBase64FromMediaMessage
        try {
          const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'http://localhost:8080';
          const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || '';

          const mediaRes = await fetch(
            `${EVOLUTION_API_URL}/chat/getBase64FromMediaMessage/${dbInstance.name}`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'apikey': EVOLUTION_API_KEY,
              },
              body: JSON.stringify({ message: msg }),
            }
          );

          if (mediaRes.ok) {
            const mediaData = await mediaRes.json();
            if (mediaData.base64) {
              const mimetype = mediaMessage.mimetype || 'application/octet-stream';
              mediaUrl = `data:${mimetype};base64,${mediaData.base64}`;
              mediaMimeType = mediaMimeType || cleanMediaMimeType(mimetype);
            }
          }
        } catch (e) {
          console.error('[Webhook] Erro ao baixar mídia via Evolution API:', e);
        }

        // Fallback: verificar se URL ou base64 já veio no payload
        if (!mediaUrl) {
          if (mediaMessage.url) {
            mediaUrl = mediaMessage.url;
          } else if (mediaMessage.base64) {
            const mimetype = mediaMessage.mimetype || 'application/octet-stream';
            mediaUrl = `data:${mimetype};base64,${mediaMessage.base64}`;
            mediaMimeType = mediaMimeType || cleanMediaMimeType(mimetype);
          }
        }
      }

      // Normalizar tipo da mensagem
      if (finalMsgType === "media" || finalMsgType === "imageMessage") finalMsgType = "image";
      else if (finalMsgType === "videoMessage" || finalMsgType === "videoplay") finalMsgType = "video";
      else if (finalMsgType === "audioMessage" || finalMsgType === "ptt" || finalMsgType === "pttMessage") finalMsgType = "audio";
      else if (finalMsgType === "documentMessage") finalMsgType = "document";
      else if (finalMsgType === "stickerMessage") finalMsgType = "sticker";
    }

    try {
      const savedMessage = await prisma.whatsAppMessage.create({
        data: {
          conversationId: conversation.id,
          messageId,
          body: messageBody,
          type: finalMsgType,
          mediaUrl,
          mediaFileName,
          mediaMimeType,
          mediaSizeBytes,
          ...(quotedMessageData || {}),
          fromMe: isFromMe,
          status: isFromMe ? mapEvolutionMessageStatus(msg.status, "sent") : "delivered",
          timestamp,
        },
      });
      persistedMessageDbId = savedMessage.id;
      persistedMessageType = savedMessage.type;
      persistedMessageMediaUrl = savedMessage.mediaUrl;
    } catch (error) {
      if (!isPrismaUniqueConstraintError(error)) throw error;

      const duplicatedMessage = await prisma.whatsAppMessage.findUnique({
        where: {
          conversationId_messageId: {
            conversationId: conversation.id,
            messageId,
          },
        },
      });
      if (!duplicatedMessage) throw error;

      let currentMessage = duplicatedMessage;
      const duplicateUpdate: Record<string, unknown> = {};
      if (msg.status !== undefined && duplicatedMessage.status !== "deleted") {
        duplicateUpdate.status = mapEvolutionMessageStatus(msg.status, duplicatedMessage.status);
      }
      if (messageBody && !duplicatedMessage.body.trim()) {
        duplicateUpdate.body = messageBody;
        duplicateUpdate.type = msgType;
      }
      if (Object.keys(duplicateUpdate).length > 0) {
        currentMessage = await prisma.whatsAppMessage.update({
          where: { id: duplicatedMessage.id },
          data: duplicateUpdate,
        });
      }

      persistedMessageDbId = currentMessage.id;
      persistedMessageType = currentMessage.type;
      persistedMessageMediaUrl = currentMessage.mediaUrl;
    }
  } else {
    // Atualiza status de mensagem existente
    const dataToUpdate: any = {};
    const previousStatus = existingMsg.status;

    // Evolution: status vem em messages.update
    if (msg.status !== undefined && existingMsg.status !== "deleted") {
      dataToUpdate.status = mapEvolutionMessageStatus(msg.status, existingMsg.status);
    }
    if (quotedMessageData && !existingMsg.quotedMessageId) {
      dataToUpdate.quotedMessageId = quotedMessageData.quotedMessageId;
      dataToUpdate.quotedMessageBody = quotedMessageData.quotedMessageBody;
      dataToUpdate.quotedMessageType = quotedMessageData.quotedMessageType;
      dataToUpdate.quotedMessageFromMe = quotedMessageData.quotedMessageFromMe;
    }
    if (messageBody && !existingMsg.body.trim()) {
      dataToUpdate.body = messageBody;
      dataToUpdate.type = msgType;
    }

    if (Object.keys(dataToUpdate).length > 0) {
      const updatedMessage = await prisma.whatsAppMessage.update({
        where: { id: existingMsg.id },
        data: dataToUpdate,
      });
      persistedMessageType = updatedMessage.type;
      persistedMessageMediaUrl = updatedMessage.mediaUrl;

      if (existingMsg.fromMe && dataToUpdate.status) {
        await prisma.webhookLog.create({
          data: {
            source: "whatsapp_evolution",
            eventType: "message_status_update",
            status: "received",
            payload: JSON.stringify({
              instanceId: dbInstance.id,
              instanceName: dbInstance.name,
              conversationId: conversation.id,
              messageDbId: existingMsg.id,
              messageId,
              remoteJid,
              webhookStatus: msg.status,
              previousStatus,
              nextStatus: dataToUpdate.status,
              event: payload?.event || payload?.EventType || payload?.action || null,
            }).slice(0, 3000),
          },
        }).catch(() => {});
      }
    }
  }

  // ═══ 5. Atualizar última mensagem na conversa ═══════════════
  await prisma.whatsAppConversation.update({
    where: { id: conversation.id },
    data: {
      lastMessage: messageBody || existingMsg?.body,
      lastMessageAt: new Date(),
      unreadCount: isFromMe ? 0 : { increment: 1 },
    },
  });

  analyzeConversationSilently(conversation.id).catch((e) => {
    console.error("[Webhook] Erro na análise silenciosa:", e);
  });

  if (persistedMessageDbId) {
    if ((persistedMessageType === "audio" || persistedMessageType === "ptt") && persistedMessageMediaUrl) {
      prisma.whatsAppMessageTranscript.upsert({
        where: { whatsAppMessageId: persistedMessageDbId },
        update: { status: "pending", error: null, provider: "gemini", model: "gemini-2.5-flash" },
        create: {
          whatsAppMessageId: persistedMessageDbId,
          status: "pending",
          provider: "gemini",
          model: "gemini-2.5-flash",
        },
      }).catch((e) => {
        console.error("[Webhook] Erro ao marcar áudio para transcrição:", e);
      });
    }

    enqueueAiShadowEvaluation({
      conversationId: conversation.id,
      incomingMessageId: persistedMessageDbId,
      instanceId: dbInstance.id,
      instanceUnit: dbInstance.unit,
      capturesLeads: dbInstance.capturesLeads,
      assignedTo: conversation.assignedTo,
      contactId: contact.id,
      contactPhone,
      contactName: contact.name,
      messageBody,
      messageType: msgType,
      isFromMe,
      isSendablePhone,
    }).catch((e) => {
      console.error("[Webhook] Erro ao enfileirar sombra IA:", e);
    });
  }
}

// ─── Helpers ────────────────────────────────────────────────────

function extractMessageBody(msg: any): string {
  return extractWhatsAppMessageBody(msg);
}

function quotedMessagePreview(message?: {
  body?: string | null;
  type?: string | null;
  mediaFileName?: string | null;
} | null) {
  const body = (message?.body || "").trim();
  if (body) return body.slice(0, 500);
  if (message?.type === "image") return "Imagem";
  if (message?.type === "audio" || message?.type === "ptt") return "Áudio";
  if (message?.type === "video") return "Vídeo";
  if (message?.type === "document") return message.mediaFileName || "Documento";
  return "Mensagem";
}

function extractQuotedMessageMetadata(ctxInfo: any) {
  const quotedMessage = ctxInfo?.quotedMessage;
  if (!quotedMessage || typeof quotedMessage !== "object") return null;

  const messageType = Object.keys(quotedMessage)[0] || "conversation";
  return {
    body: extractMessageBody({ message: quotedMessage }),
    type: extractMessageType({ messageType }),
    mediaFileName:
      quotedMessage.documentMessage?.fileName ||
      quotedMessage.documentMessage?.filename ||
      quotedMessage.documentMessage?.title ||
      null,
  };
}

function extractMessageType(msg: any): string {
  // Evolution API v2: msg.messageType contém o tipo
  if (msg.messageType) {
    const typeMap: Record<string, string> = {
      conversation: "text",
      extendedTextMessage: "text",
      imageMessage: "image",
      videoMessage: "video",
      audioMessage: "audio",
      documentMessage: "document",
      stickerMessage: "sticker",
      pttMessage: "ptt",
      contactMessage: "text",
      locationMessage: "text",
      reactionMessage: "text",
      templateMessage: "text",
      buttonsMessage: "text",
      listMessage: "text",
      interactiveMessage: "text",
    };
    return typeMap[msg.messageType] || msg.messageType;
  }
  // Uazapi fallback
  return msg.type || msg.messageType || "text";
}
