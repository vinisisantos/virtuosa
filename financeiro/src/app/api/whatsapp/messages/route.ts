import { NextResponse } from "next/server";
import { getInstancesForRequest } from "@/lib/whatsapp/instance-resolver";

import { prisma } from "@/lib/db";
import { phoneLookupKey } from "@/lib/phone";

const EDIT_WINDOW_MS = 15 * 60 * 1000;
const DELETE_WINDOW_MS = 60 * 60 * 1000;
const DEFAULT_MESSAGES_LIMIT = 120;
const MAX_MESSAGES_LIMIT = 300;

function parseLimit(value: string | null) {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_MESSAGES_LIMIT;
  return Math.min(parsed, MAX_MESSAGES_LIMIT);
}

const getEvolutionConfig = () => ({
  url: process.env.EVOLUTION_API_URL || "http://localhost:8080",
  apiKey: process.env.EVOLUTION_API_KEY || "",
});

function jidFromPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return `${digits}@s.whatsapp.net`;
}

function normalizeText(value?: string | null): string {
  return (value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function matchesPerson(value: { name?: string | null; email?: string | null } | null | undefined, token: string) {
  const normalizedToken = normalizeText(token);
  return normalizeText(value?.name).includes(normalizedToken) || normalizeText(value?.email).includes(normalizedToken);
}

function normalizeStageKey(value?: string | null): string {
  return normalizeText(value).replace(/\s+/g, "_");
}

function contactPhoneConditions(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const suffix = digits.slice(-8);
  return [
    { phone },
    ...(digits ? [{ phone: { contains: digits } }] : []),
    ...(suffix.length >= 8 ? [{ phone: { contains: suffix } }] : []),
  ];
}

function userHasOsascoAccess(user: { unit?: string | null; permissions?: unknown } | null | undefined) {
  const permissions =
    user?.permissions && typeof user.permissions === "object" && !Array.isArray(user.permissions)
      ? (user.permissions as Record<string, unknown>)
      : {};

  return (
    user?.unit === "Osasco" ||
    permissions.admin === true ||
    permissions.multiUnit === true ||
    permissions.unitOsasco === true
  );
}

const HANDOFF_HISTORY_STAGE_KEYS = new Set([
  "agendado",
  "em_negociacao",
  "fechado",
  "perdido",
  "encerrado",
  "finalizado",
  "descartado",
  "sem_retorno",
  "nao_viavel",
]);

function serializeReadonlyHistoryMessage(message: {
  id: string;
  conversationId: string;
  messageId: string;
  body: string;
  type: string;
  mediaUrl: string | null;
  mediaFileName: string | null;
  mediaMimeType: string | null;
  mediaSizeBytes: number | null;
  quotedMessageId: string | null;
  quotedMessageBody: string | null;
  quotedMessageType: string | null;
  quotedMessageFromMe: boolean | null;
  fromMe: boolean;
  status: string;
  timestamp: Date;
  createdAt: Date;
  respondedBy: string | null;
  respondedByName: string | null;
}) {
  return {
    ...message,
    id: `history_thais_${message.id}`,
    timestamp: message.timestamp.toISOString(),
    createdAt: message.createdAt.toISOString(),
    readOnly: true,
    historySource: "thais",
  };
}

async function hasLarissaHandoffPipelineDeal(params: {
  phone: string;
  phoneKey: string;
  ownerId: string;
  thaisUserIds: string[];
}) {
  const matchingClients = await prisma.client.findMany({
    where: { OR: contactPhoneConditions(params.phone) },
    select: { id: true, phone: true },
    take: 50,
  });
  const clientIds = matchingClients
    .filter((client) => phoneLookupKey(client.phone) === params.phoneKey)
    .map((client) => client.id);

  const osascoStages = await prisma.pipelineStage.findMany({
    where: { pipeline: { unit: "Osasco" } },
    select: { id: true, name: true },
  });
  const stageIds = osascoStages
    .filter((stage) => HANDOFF_HISTORY_STAGE_KEYS.has(normalizeStageKey(stage.name)))
    .map((stage) => stage.id);

  const phoneOr = [
    ...(clientIds.length ? [{ clientId: { in: clientIds } }] : []),
    { clientName: { contains: params.phoneKey } },
    ...(params.phoneKey.length >= 8 ? [{ clientName: { contains: params.phoneKey.slice(-8) } }] : []),
  ];
  if (!phoneOr.length) return false;

  const stageOr = [
    { stage: { in: [...HANDOFF_HISTORY_STAGE_KEYS] } },
    ...(stageIds.length ? [{ stageId: { in: stageIds } }] : []),
  ];

  const deal = await prisma.salesPipeline.findFirst({
    where: {
      unit: "Osasco",
      OR: phoneOr,
      AND: [
        { OR: stageOr },
        {
          OR: [
            { assignedTo: params.ownerId },
            { assignedTo: { in: params.thaisUserIds } },
            { assignedTo: null },
          ],
        },
      ],
    },
    select: { id: true },
  });

  return !!deal;
}

async function loadLarissaHandoffHistory(params: {
  conversation: {
    id: string;
    contactId: string;
    contact: { phone: string };
    instance: { userId: string | null; unit: string | null };
  };
  limit: number;
}) {
  const ownerId = params.conversation.instance.userId;
  const phoneKey = phoneLookupKey(params.conversation.contact.phone);
  if (!ownerId || !phoneKey || params.conversation.instance.unit !== "Osasco") return [];

  const owner = await prisma.user.findUnique({
    where: { id: ownerId },
    select: { id: true, name: true, email: true, unit: true, permissions: true, isActive: true },
  });
  if (!owner?.isActive || !matchesPerson(owner, "larissa") || !userHasOsascoAccess(owner)) return [];

  const thaisUsers = await prisma.user.findMany({
    where: {
      isActive: true,
      OR: [
        { name: { contains: "Thais", mode: "insensitive" } },
        { name: { contains: "Thaís", mode: "insensitive" } },
        { email: { contains: "thais", mode: "insensitive" } },
      ],
    },
    select: { id: true, name: true, email: true, unit: true, permissions: true },
  });
  const thaisUserIds = thaisUsers
    .filter((user) => matchesPerson(user, "thais") && userHasOsascoAccess(user))
    .map((user) => user.id);
  if (!thaisUserIds.length) return [];

  const hasHandoffDeal = await hasLarissaHandoffPipelineDeal({
    phone: params.conversation.contact.phone,
    phoneKey,
    ownerId,
    thaisUserIds,
  });
  if (!hasHandoffDeal) return [];

  const thaisInstances = await prisma.whatsAppInstance.findMany({
    where: {
      userId: { in: thaisUserIds },
      status: { not: "archived" },
      OR: [{ unit: "Osasco" }, { unit: "Todas" }],
    },
    select: { id: true },
  });
  const thaisInstanceIds = thaisInstances.map((instance) => instance.id);
  if (!thaisInstanceIds.length) return [];

  const sourceConversations = await prisma.whatsAppConversation.findMany({
    where: {
      id: { not: params.conversation.id },
      instanceId: { in: thaisInstanceIds },
      OR: [
        { contactId: params.conversation.contactId },
        { contact: { OR: contactPhoneConditions(params.conversation.contact.phone) } },
      ],
    },
    select: {
      id: true,
      contact: { select: { phone: true } },
      _count: { select: { messages: true } },
    },
    orderBy: [{ lastMessageAt: "desc" }, { updatedAt: "desc" }],
    take: 10,
  });

  const sourceConversationIds = sourceConversations
    .filter((conversation) => phoneLookupKey(conversation.contact.phone) === phoneKey && conversation._count.messages > 0)
    .map((conversation) => conversation.id);
  if (!sourceConversationIds.length) return [];

  const historyLimit = Math.min(Math.max(params.limit, 80), 160);
  const recentHistory = await prisma.whatsAppMessage.findMany({
    where: { conversationId: { in: sourceConversationIds } },
    orderBy: { timestamp: "desc" },
    take: historyLimit,
    select: {
      id: true,
      conversationId: true,
      messageId: true,
      body: true,
      type: true,
      mediaUrl: true,
      mediaFileName: true,
      mediaMimeType: true,
      mediaSizeBytes: true,
      quotedMessageId: true,
      quotedMessageBody: true,
      quotedMessageType: true,
      quotedMessageFromMe: true,
      fromMe: true,
      status: true,
      timestamp: true,
      respondedBy: true,
      respondedByName: true,
      createdAt: true,
    },
  });
  const history = recentHistory.reverse();
  if (!history.length) return [];

  const dividerTimestamp = history[0]?.timestamp || new Date();
  return [
    {
      id: `history_thais_divider_${params.conversation.id}`,
      conversationId: params.conversation.id,
      messageId: `history_thais_divider_${params.conversation.id}`,
      body: "Histórico da conversa Thais",
      type: "handoff_divider",
      mediaUrl: null,
      mediaFileName: null,
      mediaMimeType: null,
      mediaSizeBytes: null,
      quotedMessageId: null,
      quotedMessageBody: null,
      quotedMessageType: null,
      quotedMessageFromMe: null,
      fromMe: false,
      status: "system",
      timestamp: dividerTimestamp.toISOString(),
      createdAt: dividerTimestamp.toISOString(),
      respondedBy: null,
      respondedByName: null,
      readOnly: true,
      historySource: "thais",
    },
    ...history.map(serializeReadonlyHistoryMessage),
  ];
}

async function getAuthorizedMessage(req: Request, messageId: string) {
  const { instances: dbInstances } = await getInstancesForRequest(req);
  if (!dbInstances || dbInstances.length === 0) {
    return { error: NextResponse.json({ error: "Nenhuma instância encontrada" }, { status: 404 }) };
  }

  const instanceIds = dbInstances.map((i) => i.id);
  const message = await prisma.whatsAppMessage.findFirst({
    where: {
      id: messageId,
      conversation: { instanceId: { in: instanceIds } },
    },
    include: {
      conversation: {
        include: {
          contact: true,
          instance: true,
        },
      },
    },
  });

  if (!message) {
    return { error: NextResponse.json({ error: "Mensagem não encontrada ou sem permissão" }, { status: 404 }) };
  }

  return { message };
}

async function callEvolutionCandidates(candidates: Array<{ method: string; path: string; body: unknown }>) {
  const { url, apiKey } = getEvolutionConfig();
  let lastError: unknown = null;

  for (const candidate of candidates) {
    try {
      const res = await fetch(`${url}${candidate.path}`, {
        method: candidate.method,
        headers: {
          "Content-Type": "application/json",
          apikey: apiKey,
        },
        body: JSON.stringify(candidate.body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) return data;
      lastError = { status: res.status, data, path: candidate.path };
      if (res.status !== 404 && res.status !== 405) break;
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(`Evolution API não confirmou a ação: ${JSON.stringify(lastError).slice(0, 500)}`);
}

async function editEvolutionMessage(params: {
  instanceName: string;
  phone: string;
  remoteJid: string;
  messageId: string;
  text: string;
}) {
  const key = { remoteJid: params.remoteJid, fromMe: true, id: params.messageId };
  return callEvolutionCandidates([
    {
      method: "POST",
      path: `/message/updateMessage/${params.instanceName}`,
      body: { number: params.phone, key, text: params.text },
    },
    {
      method: "POST",
      path: `/message/edit/${params.instanceName}`,
      body: { number: params.phone, key, text: params.text },
    },
  ]);
}

async function deleteEvolutionMessage(params: {
  instanceName: string;
  phone: string;
  remoteJid: string;
  messageId: string;
}) {
  const key = { remoteJid: params.remoteJid, fromMe: true, id: params.messageId };
  const body = { number: params.phone, key, id: params.messageId, remoteJid: params.remoteJid, fromMe: true };
  return callEvolutionCandidates([
    { method: "DELETE", path: `/message/delete/${params.instanceName}`, body },
    { method: "POST", path: `/message/delete/${params.instanceName}`, body },
    { method: "DELETE", path: `/message/deleteMessageForEveryone/${params.instanceName}`, body },
    { method: "POST", path: `/message/deleteMessageForEveryone/${params.instanceName}`, body },
    { method: "DELETE", path: `/chat/deleteMessageForEveryone/${params.instanceName}`, body },
    { method: "POST", path: `/chat/deleteMessageForEveryone/${params.instanceName}`, body },
  ]);
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const conversationId = searchParams.get("conversationId");
    const markAsRead = searchParams.get("markAsRead") === "1";
    const limit = parseLimit(searchParams.get("limit"));

    if (!conversationId) {
      return NextResponse.json({ error: "conversationId é obrigatório" }, { status: 400 });
    }

    // Resolver instâncias do usuário
    const { instances: dbInstances } = await getInstancesForRequest(req);

    // Validar que a conversa pertence a alguma instância do usuário
    if (!dbInstances || dbInstances.length === 0) {
      return NextResponse.json({ error: "Nenhuma instância encontrada" }, { status: 404 });
    }

    const instanceIds = dbInstances.map(i => i.id);
    const conversation = await prisma.whatsAppConversation.findFirst({
      where: { id: conversationId, instanceId: { in: instanceIds } },
      include: {
        contact: { select: { phone: true } },
        instance: { select: { userId: true, unit: true } },
      },
    });

    if (!conversation) {
      return NextResponse.json({ error: "Conversa não encontrada ou sem permissão" }, { status: 404 });
    }

    const recentMessages = await prisma.whatsAppMessage.findMany({
      where: {
        conversationId: conversationId,
      },
      orderBy: {
        timestamp: "desc",
      },
      take: limit,
      select: {
        id: true,
        conversationId: true,
        messageId: true,
        body: true,
        type: true,
        mediaUrl: true,
        mediaFileName: true,
        mediaMimeType: true,
        mediaSizeBytes: true,
        quotedMessageId: true,
        quotedMessageBody: true,
        quotedMessageType: true,
        quotedMessageFromMe: true,
        fromMe: true,
        status: true,
        timestamp: true,
        respondedBy: true,
        respondedByName: true,
        createdAt: true,
      },
    });
    const messages = recentMessages.reverse();
    const handoffHistory = await loadLarissaHandoffHistory({ conversation, limit });

    // Só marca como lida quando o front pedir explicitamente e a conversa já
    // estiver assumida por um atendente. Antes disso, abrir para pré-visualizar
    // não deve apagar o contador de mensagens não vistas.
    if (markAsRead && conversation.assignedTo) {
      await prisma.whatsAppConversation.update({
        where: { id: conversationId },
        data: { unreadCount: 0 },
      });
    }

    return NextResponse.json({ messages: [...handoffHistory, ...messages], limit });
  } catch (error: any) {
    console.error("[WhatsApp Messages API Error]:", error);
    return NextResponse.json({ error: "Erro interno", details: error.message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const id = body?.id;
    const nextBody = typeof body?.body === "string" ? body.body.trim() : "";

    if (!id || !nextBody) {
      return NextResponse.json({ error: "Mensagem e novo texto são obrigatórios" }, { status: 400 });
    }

    const { message, error } = await getAuthorizedMessage(req, id);
    if (error) return error;
    if (!message) return NextResponse.json({ error: "Mensagem não encontrada" }, { status: 404 });
    if (!message.fromMe || message.type !== "text") {
      return NextResponse.json({ error: "Só é possível editar mensagens de texto enviadas pelo CRM" }, { status: 400 });
    }
    if (message.status === "deleted") {
      return NextResponse.json({ error: "Mensagem apagada não pode ser editada" }, { status: 400 });
    }
    if (Date.now() - message.timestamp.getTime() > EDIT_WINDOW_MS) {
      return NextResponse.json({ error: "Tempo para editar esta mensagem expirou" }, { status: 400 });
    }

    const phone = message.conversation.contact.phone;
    await editEvolutionMessage({
      instanceName: message.conversation.instance.name,
      phone,
      remoteJid: jidFromPhone(phone),
      messageId: message.messageId,
      text: nextBody,
    });

    const updated = await prisma.whatsAppMessage.update({
      where: { id: message.id },
      data: { body: nextBody },
    });

    const latest = await prisma.whatsAppMessage.findFirst({
      where: { conversationId: message.conversationId },
      orderBy: { timestamp: "desc" },
      select: { id: true },
    });
    if (latest?.id === message.id) {
      await prisma.whatsAppConversation.update({
        where: { id: message.conversationId },
        data: { lastMessage: nextBody },
      });
    }

    return NextResponse.json({ success: true, message: updated });
  } catch (error: any) {
    console.error("[WhatsApp Messages PATCH Error]:", error);
    return NextResponse.json({ error: "Erro ao editar mensagem", details: error.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const body = await req.json();
    const id = body?.id;

    if (!id) {
      return NextResponse.json({ error: "Mensagem é obrigatória" }, { status: 400 });
    }

    const { message, error } = await getAuthorizedMessage(req, id);
    if (error) return error;
    if (!message) return NextResponse.json({ error: "Mensagem não encontrada" }, { status: 404 });
    if (!message.fromMe) {
      return NextResponse.json({ error: "Só é possível apagar mensagens enviadas pelo CRM" }, { status: 400 });
    }
    if (message.status === "deleted") {
      return NextResponse.json({ error: "Mensagem já apagada" }, { status: 400 });
    }
    if (Date.now() - message.timestamp.getTime() > DELETE_WINDOW_MS) {
      return NextResponse.json({ error: "Tempo para apagar esta mensagem expirou" }, { status: 400 });
    }

    const phone = message.conversation.contact.phone;
    await deleteEvolutionMessage({
      instanceName: message.conversation.instance.name,
      phone,
      remoteJid: jidFromPhone(phone),
      messageId: message.messageId,
    });

    const deletedBody = "Mensagem apagada";
    const updated = await prisma.whatsAppMessage.update({
      where: { id: message.id },
      data: {
        body: deletedBody,
        mediaUrl: null,
        mediaFileName: null,
        mediaMimeType: null,
        mediaSizeBytes: null,
        status: "deleted",
      },
    });

    const latest = await prisma.whatsAppMessage.findFirst({
      where: { conversationId: message.conversationId },
      orderBy: { timestamp: "desc" },
      select: { id: true },
    });
    if (latest?.id === message.id) {
      await prisma.whatsAppConversation.update({
        where: { id: message.conversationId },
        data: { lastMessage: deletedBody },
      });
    }

    return NextResponse.json({ success: true, message: updated });
  } catch (error: any) {
    console.error("[WhatsApp Messages DELETE Error]:", error);
    return NextResponse.json({ error: "Erro ao apagar mensagem", details: error.message }, { status: 500 });
  }
}
