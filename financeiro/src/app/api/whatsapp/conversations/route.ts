import { NextResponse } from "next/server";
import { getInstancesForRequest } from "@/lib/whatsapp/instance-resolver";

import { prisma } from "@/lib/db";

let whatsappPerformanceIndexesReady = false;
let whatsappPerformanceIndexesPromise: Promise<void> | null = null;

function ensureWhatsappPerformanceIndexes() {
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

    await ensureWhatsappPerformanceIndexes();

    // Resolver instâncias do usuário
    const { instances: dbInstances } = await getInstancesForRequest(req);

    if (!dbInstances || dbInstances.length === 0) {
      return NextResponse.json({ conversations: [] });
    }

    const instanceIds = dbInstances.map(i => i.id);

    // Filtro de status dinâmico
    let statusFilter: any = {};
    if (status === 'all' || !status) {
      // Mostrar tudo exceto fechados
      statusFilter = { status: { not: 'closed' } };
    } else if (status === 'open') {
      statusFilter = { status: { in: ['open', 'waiting_customer', 'waiting_response'] } };
    } else if (status === 'closed') {
      statusFilter = { status: { in: ['resolved', 'closed'] } };
    } else {
      statusFilter = { status };
    }

    if (summary === "unread") {
      const conversations = await prisma.whatsAppConversation.findMany({
        where: {
          instanceId: { in: instanceIds },
          ...statusFilter,
        },
        select: {
          id: true,
          unreadCount: true,
        },
      });

      return NextResponse.json({ conversations });
    }

    const conversations = await prisma.whatsAppConversation.findMany({
      where: {
        instanceId: { in: instanceIds },
        ...statusFilter,
      },
      include: {
        contact: true,
      },
      orderBy: {
        lastMessageAt: "desc",
      },
    });

    // ── Tag = campanha de origem do lead ─────────────────────────────────────
    // A "etiqueta" de cada conversa é a campanha (Client.campaignName), casada
    // pelo telefone do contato. Consulta enxuta (só os telefones visíveis) e
    // já escopada — as conversas aqui são exclusivamente do dono da caixa.
    const normPhone = (p?: string | null) => (p || "").replace(/\D/g, "").slice(-8);
    const rawPhones = [...new Set(
      conversations.map((c) => c.contact?.phone).filter(Boolean) as string[]
    )];
    const clients = rawPhones.length
      ? await prisma.client.findMany({
          where: { phone: { in: rawPhones }, campaignName: { not: null } },
          select: { phone: true, campaignName: true, fbclid: true },
        })
      : [];
    const campaignByPhone = new Map<string, { name: string; url: string | null }>();
    for (const cl of clients) {
      const k = normPhone(cl.phone);
      if (k.length >= 8 && cl.campaignName && !campaignByPhone.has(k)) {
        campaignByPhone.set(k, {
          name: cl.campaignName,
          url: cl.fbclid && /^https?:\/\//i.test(cl.fbclid) ? cl.fbclid : null,
        });
      }
    }
    const conversationsWithTags = conversations.map((c) => ({
      ...c,
      campaignName: campaignByPhone.get(normPhone(c.contact?.phone))?.name || null,
      campaignUrl: campaignByPhone.get(normPhone(c.contact?.phone))?.url || null,
    }));

    return NextResponse.json({ conversations: conversationsWithTags });
  } catch (error: any) {
    console.error("[WhatsApp Conversations API Error]:", error);
    return NextResponse.json({ error: "Erro interno", details: error.message }, { status: 500 });
  }
}
