import { NextResponse } from "next/server";
import { getInstancesForRequest } from "@/lib/whatsapp/instance-resolver";

import { prisma } from "@/lib/db";

let whatsappPerformanceIndexesReady = false;
let whatsappPerformanceIndexesPromise: Promise<void> | null = null;

const DEFAULT_CONVERSATION_LIMIT = 120;
const MAX_CONVERSATION_LIMIT = 200;
const CAMPAIGN_PHONE_LOOKUP_TAKE = 8;

function parseLimit(value: string | null) {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_CONVERSATION_LIMIT;
  return Math.min(parsed, MAX_CONVERSATION_LIMIT);
}

function parseUpdatedSince(value: string | null) {
  if (!value) return null;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;

  // Pequena sobreposicao para evitar perder atualizacoes no mesmo milissegundo do cursor.
  return new Date(parsed.getTime() - 2000);
}

function getStatusFilter(status: string) {
  if (status === "all" || !status) {
    return { status: { not: "closed" } };
  }

  if (status === "open") {
    return { status: { in: ["open", "waiting_customer", "waiting_response"] } };
  }

  if (status === "closed") {
    return { status: { in: ["resolved", "closed"] } };
  }

  return { status };
}

function isConversationVisibleForStatus(conversationStatus: string | null | undefined, requestedStatus: string) {
  if (requestedStatus === "all" || !requestedStatus) return conversationStatus !== "closed";
  if (requestedStatus === "open") {
    return ["open", "waiting_customer", "waiting_response"].includes(conversationStatus || "");
  }
  if (requestedStatus === "closed") {
    return ["resolved", "closed"].includes(conversationStatus || "");
  }

  return conversationStatus === requestedStatus;
}

function normalizePhoneSuffix(value?: string | null) {
  return (value || "").replace(/\D/g, "").slice(-8);
}

function ensureWhatsappPerformanceIndexes() {
  if (process.env.WHATSAPP_AUTO_ENSURE_INDEXES !== "1") return Promise.resolve();
  if (whatsappPerformanceIndexesReady) return Promise.resolve();

  if (!whatsappPerformanceIndexesPromise) {
    whatsappPerformanceIndexesPromise = Promise.all([
      prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS "WhatsAppConversation_instanceId_status_lastMessageAt_idx" ON "WhatsAppConversation"("instanceId", "status", "lastMessageAt" DESC)`
      ),
      prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS "WhatsAppConversation_instanceId_lastMessageAt_idx" ON "WhatsAppConversation"("instanceId", "lastMessageAt" DESC)`
      ),
      prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS "WhatsAppConversation_unreadCount_idx" ON "WhatsAppConversation"("unreadCount")`
      ),
      prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS "WhatsAppMessage_conversationId_timestamp_idx" ON "WhatsAppMessage"("conversationId", "timestamp")`
      ),
    ])
      .then(() => {
        whatsappPerformanceIndexesReady = true;
      })
      .catch((error) => {
        whatsappPerformanceIndexesPromise = null;
        console.error("[WhatsApp Performance Indexes]:", error);
      });
  }

  return whatsappPerformanceIndexesPromise;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || "all";
    const summary = searchParams.get("summary");
    const limit = parseLimit(searchParams.get("limit"));
    const updatedSince = parseUpdatedSince(searchParams.get("updatedSince"));
    const serverTime = new Date().toISOString();
    const isIncremental = Boolean(updatedSince);

    await ensureWhatsappPerformanceIndexes();

    // Resolver instâncias do usuário
    const { instances: dbInstances } = await getInstancesForRequest(req);

    if (!dbInstances || dbInstances.length === 0) {
      return NextResponse.json({ conversations: [], serverTime });
    }

    const instanceIds = dbInstances.map(i => i.id);
    const statusFilter = getStatusFilter(status);

    if (summary === "unread") {
      const conversations = await prisma.whatsAppConversation.findMany({
        where: {
          instanceId: { in: instanceIds },
          unreadCount: { gt: 0 },
          ...statusFilter,
        },
        select: {
          id: true,
          unreadCount: true,
        },
      });

      return NextResponse.json({ conversations, count: conversations.length, serverTime });
    }

    const conversationWhere = updatedSince
      ? {
          instanceId: { in: instanceIds },
          OR: [
            { updatedAt: { gte: updatedSince } },
            { lastMessageAt: { gte: updatedSince } },
          ],
        }
      : {
          instanceId: { in: instanceIds },
          ...statusFilter,
        };

    const conversations = await prisma.whatsAppConversation.findMany({
      where: conversationWhere,
      select: {
        id: true,
        instanceId: true,
        status: true,
        assignedTo: true,
        assignedToName: true,
        unreadCount: true,
        lastMessage: true,
        lastMessageAt: true,
        updatedAt: true,
        resolution: true,
        closedAt: true,
        closedByName: true,
        satisfactionScore: true,
        contact: {
          select: {
            id: true,
            phone: true,
            name: true,
            profilePic: true,
            tags: true,
            unit: true,
          },
        },
      },
      orderBy: updatedSince
        ? { updatedAt: "desc" as const }
        : { lastMessageAt: "desc" as const },
      take: limit,
    });

    const visibleConversations = updatedSince
      ? conversations.filter((conversation) => isConversationVisibleForStatus(conversation.status, status))
      : conversations;
    const removedConversationIds = updatedSince
      ? conversations
          .filter((conversation) => !isConversationVisibleForStatus(conversation.status, status))
          .map((conversation) => conversation.id)
      : [];

    // ── Tag = campanha de origem do lead ─────────────────────────────────────
    // A "etiqueta" de cada conversa é a campanha (Client.campaignName), casada
    // pelo telefone do contato. Consulta enxuta (só os telefones visíveis) e
    // já escopada — as conversas aqui são exclusivamente do dono da caixa.
    const phoneSuffixes = [...new Set(
      visibleConversations
        .map((c) => normalizePhoneSuffix(c.contact?.phone))
        .filter((suffix) => suffix.length >= 8)
    )];

    const clients = phoneSuffixes.length
      ? await prisma.client.findMany({
          where: {
            campaignName: { not: null },
            OR: phoneSuffixes.map((suffix) => ({ phone: { contains: suffix } })),
          },
          select: { phone: true, campaignName: true, fbclid: true, updatedAt: true },
          orderBy: { updatedAt: "desc" },
          take: Math.max(limit, phoneSuffixes.length * CAMPAIGN_PHONE_LOOKUP_TAKE),
        })
      : [];
    const campaignByPhone = new Map<string, { name: string; url: string | null }>();
    for (const cl of clients) {
      const k = normalizePhoneSuffix(cl.phone);
      if (k.length >= 8 && cl.campaignName && !campaignByPhone.has(k)) {
        campaignByPhone.set(k, {
          name: cl.campaignName,
          url: cl.fbclid && /^https?:\/\//i.test(cl.fbclid) ? cl.fbclid : null,
        });
      }
    }
    const conversationsWithTags = visibleConversations.map((c) => ({
      ...c,
      campaignName: campaignByPhone.get(normalizePhoneSuffix(c.contact?.phone))?.name || null,
      campaignUrl: campaignByPhone.get(normalizePhoneSuffix(c.contact?.phone))?.url || null,
    }));

    return NextResponse.json({
      conversations: conversationsWithTags,
      incremental: isIncremental,
      limit,
      removedConversationIds,
      serverTime,
    });
  } catch (error: any) {
    console.error("[WhatsApp Conversations API Error]:", error);
    return NextResponse.json({ error: "Erro interno", details: error.message }, { status: 500 });
  }
}
