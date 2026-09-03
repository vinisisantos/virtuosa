import { NextRequest, NextResponse } from "next/server";
import { pickBestCampaignClient } from "@/lib/campaign-client-selection";
import {
  getCrmLeadCountAdjustments,
  sumCrmLeadCountAdjustments,
} from "@/lib/crm/lead-count-adjustments";
import { canViewCrmStatistics } from "@/lib/crm-statistics";
import { prisma } from "@/lib/db";
import { requireUnitGuard } from "@/lib/unit-guard";
import { NOT_LEAD_SOURCE } from "@/lib/lead-source";
import { extractDirectFormLeadName } from "@/lib/whatsapp/form-lead-welcome";
import { leadArrivalMatchesEventDay } from "@/lib/whatsapp/lead-arrival-date";

const SP_OFFSET = "-03:00";
const SAO_PAULO_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function normalizedPhoneKey(value?: string | null) {
  const digits = (value || "").replace(/\D/g, "");
  return digits.length >= 8 ? digits.slice(-11) : null;
}

function isClickToWhatsappLead(client: { source: string | null; fbclid: string | null }) {
  const adUrl = client.fbclid || "";
  return (
    client.source === "facebook_ad" ||
    /(?:fb\.me|wa\.me|wamo\/status\/preview|instagram\.com\/p\/)/i.test(adUrl)
  );
}

function parseDate(value: string | null, fallback: Date) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fallback;
  return new Date(`${value}T00:00:00.000${SP_OFFSET}`);
}

function endOfDate(value: string | null, fallback: Date) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fallback;
  return new Date(`${value}T23:59:59.999${SP_OFFSET}`);
}

export async function GET(req: NextRequest) {
  const requestedUnit = req.nextUrl.searchParams.get("unit");
  const guard = requireUnitGuard(req, { requestedUnit });
  if (guard instanceof NextResponse) return guard;

  if (!canViewCrmStatistics(guard)) {
    return NextResponse.json({ error: "Sem permissão para estatísticas do CRM" }, { status: 403 });
  }

  try {
    const now = new Date();
    const todayKey = SAO_PAULO_DAY.format(now);
    const defaultStart = new Date(`${todayKey}T00:00:00.000${SP_OFFSET}`);
    const defaultEnd = new Date(`${todayKey}T23:59:59.999${SP_OFFSET}`);
    const start = parseDate(req.nextUrl.searchParams.get("startDate"), defaultStart);
    const end = endOfDate(req.nextUrl.searchParams.get("endDate"), defaultEnd);
    const includeNotLeads = req.nextUrl.searchParams.get("includeNotLeads") === "true";

    const [conversations, directFormMessages, notLeads, manualAdjustments] = await Promise.all([
      prisma.whatsAppConversation.findMany({
        where: {
          createdAt: { gte: start, lte: end },
          instance: {
            capturesLeads: true,
            ...(guard.unitFilter ? { unit: guard.unitFilter } : {}),
          },
        },
        include: {
          contact: true,
          instance: { select: { unit: true, name: true } },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.whatsAppMessage.findMany({
        where: {
          fromMe: false,
          timestamp: { gte: start, lte: end },
          body: { contains: "Preenchi seu formulário", mode: "insensitive" },
          conversation: {
            instance: {
              capturesLeads: true,
              ...(guard.unitFilter ? { unit: guard.unitFilter } : {}),
            },
          },
        },
        select: {
          body: true,
          timestamp: true,
          conversation: {
            include: {
              contact: true,
              instance: { select: { unit: true, name: true } },
            },
          },
        },
        orderBy: { timestamp: "asc" },
      }),
      includeNotLeads
        ? prisma.salesPipeline.findMany({
            where: {
              source: NOT_LEAD_SOURCE,
              createdAt: { gte: start, lte: end },
              ...(guard.unitFilter ? { unit: guard.unitFilter } : {}),
            },
            select: { id: true, createdAt: true, unit: true },
            orderBy: { createdAt: "asc" },
          })
        : Promise.resolve([]),
      getCrmLeadCountAdjustments({
        start,
        end,
        unit: guard.unitFilter,
      }),
    ]);

    const directFormEvents = directFormMessages.flatMap((message) => (
      extractDirectFormLeadName(message.body, message.conversation.contact.phone)
        ? [{ conversation: message.conversation, arrivedAt: message.timestamp, isDirectFormLead: true }]
        : []
    ));
    const leadEvents = [
      ...conversations.map((conversation) => ({
        conversation,
        arrivedAt: conversation.createdAt,
        isDirectFormLead: false,
      })),
      ...directFormEvents,
    ].sort((a, b) => a.arrivedAt.getTime() - b.arrivedAt.getTime());

    const phones = [
      ...new Set(leadEvents.map((event) => normalizedPhoneKey(event.conversation.contact.phone)).filter(Boolean)),
    ] as string[];

    const clients = phones.length
      ? await prisma.client.findMany({
          where: {
            OR: phones.map((phone) => ({ phone: { contains: phone.slice(-8) } })),
            ...(guard.unitFilter
              ? { AND: [{ OR: [{ unit: guard.unitFilter }, { originUnit: guard.unitFilter }] }] }
              : {}),
          },
          orderBy: { updatedAt: "desc" },
        })
      : [];

    const clientsByPhone = new Map<string, typeof clients>();
    for (const client of clients) {
      const key = normalizedPhoneKey(client.phone);
      if (!key) continue;
      const list = clientsByPhone.get(key) || [];
      list.push(client);
      clientsByPhone.set(key, list);
    }

    const countedKeys = new Set<string>();
    const leads = [];

    for (const event of leadEvents) {
      const { conversation } = event;
      const phoneKey = normalizedPhoneKey(conversation.contact.phone);
      if (!phoneKey) continue;

      const relatedClients = clientsByPhone.get(phoneKey) || [];
      const clickToWhatsappClients = relatedClients.filter((item) => isClickToWhatsappLead(item));
      const client = event.isDirectFormLead
        ? pickBestCampaignClient(clickToWhatsappClients) || pickBestCampaignClient(relatedClients)
        : pickBestCampaignClient(
            clickToWhatsappClients.filter((candidate) =>
              leadArrivalMatchesEventDay(candidate, event.arrivedAt)
            )
          );
      if (!client) continue;

      const dayKey = SAO_PAULO_DAY.format(event.arrivedAt);
      const dedupeKey = `${dayKey}:${phoneKey}`;
      if (countedKeys.has(dedupeKey)) continue;
      countedKeys.add(dedupeKey);

      leads.push({
        id: client.id,
        conversationId: conversation.id,
        name: client.name || conversation.contact.name || conversation.contact.phone,
        phone: client.phone || conversation.contact.phone,
        email: client.email,
        unit: client.unit || conversation.instance.unit,
        tags: client.tags,
        totalSpent: client.totalSpent,
        visitCount: client.visitCount,
        lastVisit: client.lastVisit,
        stage: client.stage || "entrada",
        createdAt: client.createdAt,
        arrivedAt: event.arrivedAt,
        source: event.isDirectFormLead ? "facebook_ad" : client.source,
        campaignName: client.campaignName,
        fbclid: client.fbclid,
      });
    }

    const manualAdjustmentTotal = sumCrmLeadCountAdjustments(manualAdjustments);

    return NextResponse.json(
      {
        leads,
        notLeads,
        manualAdjustments,
        manualAdjustmentTotal,
        total: leads.length + manualAdjustmentTotal,
        range: { start: start.toISOString(), end: end.toISOString() },
        unit: guard.unitFilter || "Todas",
      },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" } }
    );
  } catch (error: unknown) {
    console.error("[CRM Estatistica CTWA]", error);
    const details = error instanceof Error ? error.message : "Erro desconhecido";
    return NextResponse.json({ error: "Falha ao carregar leads CTWA", details }, { status: 500 });
  }
}
