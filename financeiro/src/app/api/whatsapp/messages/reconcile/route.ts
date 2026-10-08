import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getInstancesForRequest } from "@/lib/whatsapp/instance-resolver";
import { findEvolutionMessageById } from "@/lib/whatsapp/inbound-media";
import { broadcastInboxRealtimeChange } from "@/lib/whatsapp/inbox-realtime";
import {
  normalizeWhatsAppMessageStatus,
  whatsAppStatusUpdateFilter,
} from "@/lib/whatsapp/message-status";
import { getInstanceProvider } from "@/lib/whatsapp/provider";

export const maxDuration = 20;

const MIN_PENDING_AGE_MS = 25_000;
const RECHECK_COOLDOWN_MS = 30_000;
const PROVIDER_TIMEOUT_MS = 7_000;

function matchesOutgoingConversation(
  record: Record<string, unknown>,
  lastKnownJid: string | null,
  contactPhone: string,
) {
  const key = record.key as Record<string, unknown> | undefined;
  if (key?.fromMe !== true) return false;

  const knownJid = lastKnownJid?.trim().toLowerCase().replace(/@c\.us$/, "@s.whatsapp.net");
  const digits = contactPhone.replace(/\D/g, "");
  const phoneCandidates = new Set([digits]);
  if (/^55\d{2}9\d{8}$/.test(digits)) {
    phoneCandidates.add(`${digits.slice(0, 4)}${digits.slice(5)}`);
  } else if (/^55\d{10}$/.test(digits)) {
    phoneCandidates.add(`${digits.slice(0, 4)}9${digits.slice(4)}`);
  }

  return [key.remoteJid, key.remoteJidAlt].some((value) => {
    if (typeof value !== "string") return false;
    const jid = value.trim().toLowerCase().replace(/@c\.us$/, "@s.whatsapp.net");
    if (knownJid && jid === knownJid) return true;
    if (!/@s\.whatsapp\.net$/.test(jid)) return false;
    return phoneCandidates.has(jid.slice(0, -("@s.whatsapp.net".length)));
  });
}

function recheckClaimId(instanceId: string, now: number) {
  const bucket = Math.floor(now / RECHECK_COOLDOWN_MS);
  const digest = createHash("sha256")
    .update(`whatsapp-status-recheck:${instanceId}:${bucket}`)
    .digest("hex");
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}

export async function POST(req: Request) {
  const input = await req.json().catch(() => null);
  const conversationId = typeof input?.conversationId === "string"
    ? input.conversationId.trim()
    : "";
  const messageId = typeof input?.messageId === "string"
    ? input.messageId.trim()
    : "";
  if (!conversationId || conversationId.length > 100 || !messageId || messageId.length > 160) {
    return NextResponse.json({ error: "Mensagem inválida." }, { status: 400 });
  }

  const { instances } = await getInstancesForRequest(req);
  const instanceIds = instances
    .filter((instance) => instance.canView && instance.status !== "archived")
    .map((instance) => instance.id);
  if (!instanceIds.length) {
    return NextResponse.json({ error: "Sem acesso à caixa." }, { status: 403 });
  }

  const conversation = await prisma.whatsAppConversation.findFirst({
    where: { id: conversationId, instanceId: { in: instanceIds } },
    select: {
      id: true,
      lastKnownJid: true,
      contact: { select: { phone: true } },
      instance: { select: { id: true, name: true, provider: true } },
    },
  });
  if (!conversation) {
    return NextResponse.json({ error: "Conversa não encontrada ou sem permissão." }, { status: 404 });
  }

  const message = await prisma.whatsAppMessage.findUnique({
    where: { conversationId_messageId: { conversationId, messageId } },
    select: { id: true, fromMe: true, status: true, timestamp: true },
  });
  if (!message?.fromMe) {
    return NextResponse.json({ error: "Mensagem não encontrada ou sem permissão." }, { status: 404 });
  }
  if (message.status !== "pending") {
    return NextResponse.json({ checked: false, providerFound: false, status: message.status });
  }
  if (getInstanceProvider(conversation.instance) !== "evolution") {
    return NextResponse.json({
      checked: false,
      providerFound: false,
      unsupported: true,
      status: message.status,
    });
  }

  const now = Date.now();
  if (now - message.timestamp.getTime() < MIN_PENDING_AGE_MS) {
    return NextResponse.json({
      checked: false,
      providerFound: false,
      retryAfterMs: MIN_PENDING_AGE_MS,
      status: message.status,
    });
  }

  // Uma tentativa por instância a cada 30 s evita fan-out em queda do provedor.
  // O ID determinístico bloqueia duas abas concorrentes na mesma janela.
  const recentAttempt = await prisma.webhookLog.findFirst({
    where: {
      source: "whatsapp_evolution",
      eventType: "message_status_recheck",
      createdAt: { gte: new Date(now - RECHECK_COOLDOWN_MS) },
      payload: { contains: conversation.instance.id },
    },
    select: { id: true },
  });
  if (recentAttempt) {
    return NextResponse.json({
      checked: false,
      providerFound: false,
      throttled: true,
      retryAfterMs: RECHECK_COOLDOWN_MS,
      status: message.status,
    });
  }

  const configUrl = process.env.EVOLUTION_API_URL?.replace(/\/+$/, "");
  const apiKey = process.env.EVOLUTION_API_KEY;
  if (!configUrl || !apiKey) {
    return NextResponse.json({ error: "Verificação indisponível." }, { status: 503 });
  }

  let attempt: { id: string };
  try {
    attempt = await prisma.webhookLog.create({
      data: {
        id: recheckClaimId(conversation.instance.id, now),
        source: "whatsapp_evolution",
        eventType: "message_status_recheck",
        status: "received",
        payload: JSON.stringify({
          instanceId: conversation.instance.id,
          conversationId,
          messageDbId: message.id,
          messageId,
        }),
      },
      select: { id: true },
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      return NextResponse.json({
        checked: false,
        providerFound: false,
        throttled: true,
        retryAfterMs: RECHECK_COOLDOWN_MS,
        status: message.status,
      });
    }
    return NextResponse.json({ error: "Verificação indisponível." }, { status: 503 });
  }

  try {
    const response = await fetch(
      `${configUrl}/chat/findMessages/${encodeURIComponent(conversation.instance.name)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: apiKey },
        body: JSON.stringify({ where: { key: { id: messageId } }, page: 1, offset: 10 }),
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
      },
    );
    if (!response.ok) throw new Error(`Evolution HTTP ${response.status}`);

    const original = findEvolutionMessageById(
      await response.json(),
      messageId,
      (record) => matchesOutgoingConversation(
        record,
        conversation.lastKnownJid,
        conversation.contact.phone,
      ),
    );
    const providerStatus = normalizeWhatsAppMessageStatus(original?.status);
    let updated = false;
    if (providerStatus && providerStatus !== "pending" && providerStatus !== "deleted") {
      const result = await prisma.whatsAppMessage.updateMany({
        where: {
          id: message.id,
          fromMe: true,
          status: whatsAppStatusUpdateFilter(providerStatus),
        },
        data: { status: providerStatus },
      });
      updated = result.count > 0;
    }

    const current = await prisma.whatsAppMessage.findUnique({
      where: { id: message.id },
      select: { status: true },
    });
    await prisma.webhookLog.update({
      where: { id: attempt.id },
      data: { status: "processed", processedAt: new Date() },
    }).catch(() => {});
    if (updated) {
      await broadcastInboxRealtimeChange({
        instanceId: conversation.instance.id,
        conversationId,
        messageId: message.id,
        kind: "status",
      });
    }

    return NextResponse.json({
      checked: true,
      providerFound: Boolean(original),
      status: current?.status || message.status,
    });
  } catch (error) {
    await prisma.webhookLog.update({
      where: { id: attempt.id },
      data: {
        status: "error",
        errorMessage: error instanceof Error ? error.message.slice(0, 180) : "Falha de consulta",
        processedAt: new Date(),
      },
    }).catch(() => {});
    return NextResponse.json({ error: "Não foi possível verificar o envio agora." }, { status: 502 });
  }
}
