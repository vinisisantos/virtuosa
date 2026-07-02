import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { extractAdIdFromSourceUrl, resolveCampaignFromAdId } from "@/lib/lead-processor";
import { inferCampaignByKeywords, inferManagedCampaignName } from "@/lib/campaign-attribution";
import { analyzeConversationSilently } from "@/lib/crm-silent-analysis";

const getEvolutionConfig = () => ({
  url: process.env.EVOLUTION_API_URL || 'http://localhost:8080',
  apiKey: process.env.EVOLUTION_API_KEY || '',
});

const CTWA_WELCOME_TRIGGER = "ctwa_welcome";
const CALL_BLOCK_SETTINGS_KEY = "whatsapp_call_block_settings";
const CALL_BLOCK_LAST_NOTIFIED_KEY = "whatsapp_call_block_last_notified";
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

function isGenericWhatsAppContactName(value?: string | null) {
  const normalized = (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

  return (
    normalized === "virtuosa sao caetano do sul" ||
    normalized === "clinica virtuosa" ||
    normalized.startsWith("virtuosa sao caetano")
  );
}

function isFormattedPhonePlaceholder(value?: string | null) {
  return /^\(\d{2}\)\s\d{4,5}-\d{4}$/.test((value || "").trim());
}

function shouldUpdateContactName(currentName?: string | null, nextName?: string | null, phone?: string | null) {
  const cleanNext = nextName?.trim();
  if (!cleanNext || cleanNext === phone || isGenericWhatsAppContactName(cleanNext)) return false;
  return !currentName || isGenericWhatsAppContactName(currentName) || isFormattedPhonePlaceholder(currentName);
}

function getStepMessage(steps: any, index: number, fallback: string) {
  if (!Array.isArray(steps)) return fallback;
  const step = steps.filter((item) => item?.type === "send_message")[index];
  return typeof step?.config?.message === "string" && step.config.message.trim()
    ? step.config.message
    : fallback;
}

function isValidLeadName(value: string) {
  const text = value.trim().replace(/\s+/g, " ");
  const normalized = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (text.length < 2 || text.length > 50) return false;
  if (/\d|https?:\/\/|www\.|@/.test(text)) return false;
  if (/[?!]{2,}/.test(text)) return false;
  const blocked = /^(oi|ola|olá|bom dia|boa tarde|boa noite|sim|nao|não|ok|tudo bem|obrigado|obrigada|quero|gostaria|preco|preço|valor|endereco|endereço|tenho interesse)$/i;
  if (blocked.test(text)) return false;

  const intentPattern = /\b(vcs?|voces?|voce|faz(?:em)?|tem|atende|trabalha|vende|quero|queria|gostaria|saber|informacoes?|informacao|preco|valor|quanto|custa|agenda(?:r)?|marcar|consulta|avaliacao|procedimento|tratamento|promocao|endolaser|endolift|botox|crio|criolipolise|corrente|russa|lipo|barriga|hyper\s*slim|hyperslim|monji|monjifast|celulite|flacidez|gordura|emagrecimento)\b/;
  if (intentPattern.test(normalized)) return false;

  const words = normalized.split(" ").filter(Boolean);
  if (words.length === 1 && text.length > 18) return false;
  if (words.length > 4) return false;

  return /^[\p{L}\p{M}'’.-]+(?:\s+[\p{L}\p{M}'’.-]+){0,5}$/u.test(text);
}

function extractLeadName(value: string) {
  const raw = value.trim();
  const patterns = [
    /^(?:me\s+chamo|meu\s+nome\s+[eé]|sou\s+(?:o|a)?\s*)\s+/i,
    /^(?:nome\s*:)\s*/i,
  ];
  let candidate = raw;
  for (const pattern of patterns) {
    if (pattern.test(candidate)) {
      candidate = candidate.replace(pattern, "").trim();
      break;
    }
  }
  candidate = candidate.split(/[,.!?;:\n]/)[0]?.trim() || "";
  if (!isValidLeadName(candidate)) return null;
  return candidate
    .toLocaleLowerCase("pt-BR")
    .replace(/(^|\s)([\p{L}\p{M}])/gu, (_, space, letter) => `${space}${letter.toLocaleUpperCase("pt-BR")}`);
}

async function sendAutomationText(params: {
  dbInstance: { name: string };
  conversationId: string;
  contactPhone: string;
  message: string;
}) {
  const { url, apiKey } = getEvolutionConfig();
  const sendRes = await fetch(`${url}/message/sendText/${params.dbInstance.name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: apiKey },
    body: JSON.stringify({ number: params.contactPhone, text: params.message }),
  });
  const sendData = await sendRes.json().catch(() => ({}));
  if (!sendRes.ok) {
    throw new Error(`Erro ao enviar automação: ${JSON.stringify(sendData).slice(0, 300)}`);
  }

  const messageId = sendData?.key?.id || sendData?.id || `auto_${params.conversationId}_${Date.now()}`;
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

function extractCallInfo(payload: any) {
  const call = firstCallData(payload) || {};
  const remoteJid =
    call.from ||
    call.sender ||
    call.chatId ||
    call.remoteJid ||
    call.key?.remoteJid ||
    call.peerJid ||
    payload?.from ||
    payload?.sender ||
    payload?.remoteJid ||
    "";
  const phone = String(remoteJid).replace("@s.whatsapp.net", "").replace("@c.us", "").replace(/\D/g, "");
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
  const body = { callId, id: callId, from: phone, number: phone };
  return callEvolutionCandidates([
    { method: "POST", path: `/call/reject/${instanceName}`, body },
    { method: "POST", path: `/call/rejectCall/${instanceName}`, body },
    { method: "POST", path: `/call/decline/${instanceName}`, body },
    { method: "POST", path: `/call/end/${instanceName}`, body },
  ]);
}

async function shouldSendCallBlockNotice(instanceId: string, phone: string, cooldownMinutes: number) {
  const setting = await prisma.appSetting.findUnique({
    where: { key: CALL_BLOCK_LAST_NOTIFIED_KEY },
    select: { value: true },
  });
  const now = Date.now();
  const key = `${instanceId}:${phone}`;
  let current: Record<string, number> = {};

  try {
    current = setting?.value ? JSON.parse(setting.value) : {};
  } catch {
    current = {};
  }

  const last = Number(current[key] || 0);
  if (last && now - last < cooldownMinutes * 60_000) return false;

  current[key] = now;
  for (const [entryKey, timestamp] of Object.entries(current)) {
    if (now - Number(timestamp) > 7 * 24 * 60 * 60_000) delete current[entryKey];
  }

  await prisma.appSetting.upsert({
    where: { key: CALL_BLOCK_LAST_NOTIFIED_KEY },
    create: { key: CALL_BLOCK_LAST_NOTIFIED_KEY, value: JSON.stringify(current) },
    update: { value: JSON.stringify(current) },
  });

  return true;
}

async function sendCallBlockNotice(params: {
  dbInstance: { id: string; name: string; unit?: string | null };
  phone: string;
  message: string;
}) {
  const { url, apiKey } = getEvolutionConfig();
  const sendRes = await fetch(`${url}/message/sendText/${params.dbInstance.name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: apiKey },
    body: JSON.stringify({ number: params.phone, text: params.message }),
  });
  const sendData = await sendRes.json().catch(() => ({}));
  if (!sendRes.ok) {
    throw new Error(`Erro ao enviar aviso de ligação: ${JSON.stringify(sendData).slice(0, 300)}`);
  }

  const contact = await prisma.whatsAppContact.upsert({
    where: { phone: params.phone },
    update: {},
    create: {
      phone: params.phone,
      name: params.phone,
      unit: params.dbInstance.unit || "Osasco",
    },
  });

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
    },
    create: {
      contactId: contact.id,
      instanceId: params.dbInstance.id,
      status: "open",
      lastMessage: params.message,
      lastMessageAt: new Date(),
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
  if (!callInfo.phone || callInfo.fromMe || callInfo.isGroup || callInfo.finished) return true;

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

  const shouldSendNotice = await shouldSendCallBlockNotice(
    dbInstance.id,
    callInfo.phone,
    settings.cooldownMinutes,
  );

  if (shouldSendNotice) {
    await sendCallBlockNotice({
      dbInstance,
      phone: callInfo.phone,
      message: settings.message,
    });
  }

  return true;
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
    const event = payload.event || payload.EventType || payload.action;
    const instanceName = payload.instance || payload.instanceName;

    if (!instanceName && !payload.token) {
      return NextResponse.json({ success: true });
    }

    // Buscar instância no banco — Evolution identifica por nome, não por token
    const dbInstance = await prisma.whatsAppInstance.findFirst({
      where: payload.token
        ? { token: payload.token }          // fallback Uazapi (compatibilidade)
        : { name: instanceName },           // Evolution API
    });

    if (!dbInstance) {
      return NextResponse.json({ success: true });
    }

    // ─── CHAMADAS ─────────────────────────────────────────────
    if (await handleCallWebhook(payload, event, dbInstance)) {
      return NextResponse.json({ success: true });
    }

    // ─── MENSAGENS ────────────────────────────────────────────
    if (event === "messages.upsert" || event === "messages" || event === "messages_update" || event === "messages.update") {
      // Evolution: dados em payload.data; Uazapi fallback: payload.message
      const msgData = payload.data || payload.message;
      if (!msgData) return NextResponse.json({ success: true });

      // Evolution pode enviar array ou objeto único
      const messages = Array.isArray(msgData) ? msgData : [msgData];

      for (const msg of messages) {
        await processMessage(msg, dbInstance, payload);
      }
    }

    // ─── CONEXÃO ──────────────────────────────────────────────
    if (event === "connection.update" || event === "connection") {
      const state = payload.data?.state || payload.data?.status || payload.status;
      if (state) {
        const newStatus = state === "open" ? "connected"
          : state === "close" ? "disconnected"
          : state === "connecting" ? "connecting"
          : state;

        await prisma.whatsAppInstance.update({
          where: { id: dbInstance.id },
          data: { status: newStatus },
        });
      }
    }

    // ─── QR CODE ──────────────────────────────────────────────
    if (event === "qrcode.updated" || event === "qrcode") {
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
  dbInstance: { id: string; token: string; name: string; userId?: string | null; unit?: string | null },
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

  // Extrair telefone
  const contactPhone = remoteJid.replace("@s.whatsapp.net", "").replace("@c.us", "");
  if (!/^\d{8,15}$/.test(contactPhone)) return;

  const isFromMe = msg.key?.fromMe ?? msg.fromMe ?? false;
  const messageId = msg.key?.id || msg.messageid || msg.id;
  if (!messageId) return;

  // ─── Extrair texto do corpo da mensagem ─────────────────────
  const messageBody = extractMessageBody(msg);

  // ─── Extrair tipo da mensagem ───────────────────────────────
  const msgType = extractMessageType(msg);

  // ─── Extrair nome do contato ────────────────────────────────
  const contactName = msg.pushName || msg.senderName || contactPhone;

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

  const isNewContact = !contact;

  if (!contact) {
    contact = await prisma.whatsAppContact.create({
      data: {
        phone: contactPhone,
        name: contactName,
        profilePic: profilePicFromPayload,
        unit: dbInstance.unit || "Osasco",
      },
    });
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

  const isNewConversation = !existingConv;

  let conversation = existingConv || await prisma.whatsAppConversation.create({
    data: {
      instanceId: dbInstance.id,
      contactId: contact.id,
      status: "open",
    },
  });

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

  // ─── Extrair metadados de anúncio (Click to WhatsApp) ────────
  const VISIBLE_UNITS = ["Osasco", "SBC", "SCS"];
  const leadUnit =
    dbInstance.unit && VISIBLE_UNITS.includes(dbInstance.unit)
      ? dbInstance.unit
      : "Osasco";
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
      adTitle = "Campanha Desconhecida (Via Link)";
    }
  }

  // Resolver o NOME REAL da campanha via Graph API a partir do ID do anúncio.
  // O `sourceId` é o id do *anúncio*; o Graph mapeia anúncio → campanha.
  let resolvedCampaignName: string | null = null;
  let resolvedCampaignId: string | null = null;
  let resolvedAdName: string | null = null;
  if (adId) {
    const resolved = await resolveCampaignFromAdId(adId, dbInstance.unit);
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
  const managedCampaignName = hasCampaignSignal ? await inferManagedCampaignName(adSignal, leadUnit) : null;
  const keywordCampaignName = hasCampaignSignal ? inferCampaignByKeywords(adSignal) : null;

  // Nome final: produto explícito por keyword > campanha cadastrada > campanha real Graph > headline.
  const isGenericCampaign = (n: string | null | undefined) => {
    const normalized = (n || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
    return (
      !!normalized &&
      (normalized.startsWith("campanha desconhecida") ||
        normalized === "anuncio no status" ||
        normalized === "converse conosco" ||
        normalized === "desconhecido")
    );
  };
  const fallbackCampaignName = adTitle && !isGenericCampaign(adTitle) ? adTitle : null;
  const campaignName: string | null = hasCampaignSignal
    ? keywordCampaignName || managedCampaignName || resolvedCampaignName || fallbackCampaignName
    : null;
  // id da campanha real, senão o id do anúncio (preserva rastreio p/ backfill)
  const campaignTrackId: string | null = resolvedCampaignId || adId;

  // Timestamp: Evolution usa unix seconds (number), Uazapi usa ISO string.
  const timestamp =
    typeof msg.messageTimestamp === "number"
      ? new Date(msg.messageTimestamp * 1000)
      : msg.messageTimestamp
        ? new Date(msg.messageTimestamp)
        : new Date();

  // ─── Diagnóstico: registrar estrutura de mensagens de anúncio ────────────────
  // O WhatsApp mostra o card "Anúncio do Facebook", logo o `externalAdReply`
  // existe na mensagem — mas o Evolution pode entregá-lo em outro campo. Gravamos
  // a estrutura crua (sem mídia pesada) p/ confirmar a captação em Config→Webhooks.
  if (!isFromMe && (adTitle || ctxInfo)) {
    try {
      const replacer = (k: string, v: unknown) => {
        if (k === "jpegThumbnail" || k === "thumbnail" || k === "base64" || k === "fileSha256" || k === "fileEncSha256" || k === "mediaKey")
          return "[stripped]";
        if (typeof v === "string" && v.length > 400) return v.slice(0, 200) + "…[trunc]";
        return v;
      };
      const snapshot = {
        phone: contactPhone,
        detectedCampaign: campaignName,
        managedCampaignName,
        keywordCampaignName,
        adId,
        adSourceUrl,
        hasExternalAdReply: !!ctxInfo?.externalAdReply,
        hasAdReply: !!ctxInfo?.adReply,
        graphResolved: !!resolvedCampaignName,
        messageType: msg.messageType,
        contextInfoKeys: ctxInfo ? Object.keys(ctxInfo) : [],
        adReplyRaw: ctxInfo?.externalAdReply ?? ctxInfo?.adReply ?? null,
        rawMessage: msg.message ?? null,
      };
      await prisma.webhookLog.create({
        data: {
          source: "whatsapp_ad",
          eventType: "ctwa_diag",
          payload: JSON.stringify(snapshot, replacer).slice(0, 9000),
          status: campaignName && !isGenericCampaign(campaignName) ? "processed" : "received",
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
  if (!isFromMe) {
    try {
      let client = await prisma.client.findFirst({
        where: { phone: contactPhone },
      });

      if (!client) {
        client = await prisma.client.create({
          data: {
            name: contactName !== contactPhone ? contactName : `Lead WhatsApp ${contactPhone}`,
            phone: contactPhone,
            source: hasCampaignSignal ? "facebook_ad" : "whatsapp",
            campaignName: campaignName || undefined,
            campaignId: campaignTrackId || undefined,
            fbclid: adSourceUrl || undefined,
            stage: "entrada",
            arrivedAt: timestamp,
            unit: leadUnit,
            userId: dbInstance.userId || null,
          },
        });
      } else if (campaignName || hasCampaignSignal || dbInstance.userId) {
        // Só grava campanha se: ainda não há campanha, OU estamos fazendo
        // upgrade de um rótulo genérico para o nome real (evita regressão).
        // Correção controlada: versões antigas podiam marcar como HyperSlim
        // anúncios de Barriga/Gordura por palavras genéricas como "definição".
        // Quando chega um novo sinal explícito do anúncio, permitimos reparar
        // apenas esse par conhecido, sem recriar lead nem alterar chegada.
        const shouldRepairHyperSlim =
          !!campaignName &&
          client.campaignName === "HyperSlim" &&
          ["Barriga Trincada", "Gordura Localizada"].includes(campaignName);
        const shouldSetCampaign =
          !!campaignName &&
          (!client.campaignName ||
            (!isGenericCampaign(campaignName) && isGenericCampaign(client.campaignName)) ||
            shouldRepairHyperSlim);
        client = await prisma.client.update({
          where: { id: client.id },
          data: {
            ...(shouldSetCampaign
              ? {
                  source: "facebook_ad",
                  campaignName,
                  campaignId: campaignTrackId || undefined,
                  fbclid: adSourceUrl || undefined,
                }
              : hasCampaignSignal
                ? {
                    source: "facebook_ad",
                    campaignId: campaignTrackId || undefined,
                    ...(adSourceUrl && !client.fbclid ? { fbclid: adSourceUrl } : {}),
                  }
                : {}),
            // só corrige a unidade se a atual for inválida/oculta — não bagunça
            // um cliente que já está numa unidade visível correta.
            ...(!client.unit || !VISIBLE_UNITS.includes(client.unit) ? { unit: leadUnit } : {}),
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
          },
        });
      }
    } catch (e) {
      console.error("[Webhook] Erro ao criar negócio automático:", e);
    }
  }

  // ═══ 3.5 Automação nativa: saudação CTWA + captura de nome ═══
  if (!isFromMe) {
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
        const capturedName = extractLeadName(messageBody);
        if (capturedName && !conversation.assignedTo) {
          await prisma.whatsAppContact.update({
            where: { id: contact.id },
            data: { name: capturedName },
          });

          const updatedClients = await prisma.client.updateMany({
            where: { phone: contactPhone, source: "facebook_ad" },
            data: { name: capturedName },
          });

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

          await prisma.automationLog.update({
            where: { id: previousWaitingLog.id },
            data: {
              result: "completed",
              contactName: capturedName,
              triggerData: {
                ...((previousWaitingLog.triggerData as Record<string, unknown>) || {}),
                capturedName,
                nameCapturedAt: new Date().toISOString(),
                updatedClients: updatedClients.count,
              },
            },
          });

          await prisma.automation.update({
            where: { id: automation.id },
            data: { lastExecutedAt: new Date() },
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
  const existingMsg = await prisma.whatsAppMessage.findUnique({
    where: { messageId },
  });

  if (!existingMsg) {
    let mediaUrl: string | null = null;
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

    await prisma.whatsAppMessage.create({
      data: {
        conversationId: conversation.id,
        messageId,
        body: messageBody,
        type: finalMsgType,
        mediaUrl,
        fromMe: isFromMe,
        status: isFromMe ? "sent" : "delivered",
        timestamp,
      },
    });
  } else {
    // Atualiza status de mensagem existente
    const dataToUpdate: any = {};

    // Evolution: status vem em messages.update
    if (msg.status !== undefined && existingMsg.status !== "deleted") {
      const statusMap: Record<number, string> = {
        0: "error",
        1: "pending",
        2: "sent",
        3: "delivered",
        4: "read",
        5: "played",
      };
      dataToUpdate.status = typeof msg.status === "number"
        ? (statusMap[msg.status] || "sent")
        : (msg.status || existingMsg.status);
    }

    if (Object.keys(dataToUpdate).length > 0) {
      await prisma.whatsAppMessage.update({
        where: { messageId },
        data: dataToUpdate,
      });
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
}

// ─── Helpers ────────────────────────────────────────────────────

function extractMessageBody(msg: any): string {
  // Evolution API v2: texto em diferentes locais dependendo do tipo
  if (msg.message) {
    const m = msg.message;
    return (
      m.conversation ||
      m.extendedTextMessage?.text ||
      m.imageMessage?.caption ||
      m.videoMessage?.caption ||
      m.documentMessage?.caption ||
      m.buttonsResponseMessage?.selectedDisplayText ||
      m.listResponseMessage?.title ||
      m.templateButtonReplyMessage?.selectedDisplayText ||
      ""
    );
  }
  // Uazapi fallback
  return msg.text || (msg.content && msg.content.text) || "";
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
    };
    return typeMap[msg.messageType] || msg.messageType;
  }
  // Uazapi fallback
  return msg.type || msg.messageType || "text";
}
