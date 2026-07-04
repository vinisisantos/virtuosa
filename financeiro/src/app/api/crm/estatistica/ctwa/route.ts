import { NextRequest, NextResponse } from "next/server";
import { pickBestCampaignClient } from "@/lib/campaign-client-selection";
import { prisma } from "@/lib/db";
import { requireUnitGuard } from "@/lib/unit-guard";

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

  const canView =
    guard.isAdmin ||
    guard.userRole === "MARKETING" ||
    guard.permissions?.dashboard === true ||
    guard.permissions?.crmEstatistica === true;
  if (!canView) {
    return NextResponse.json({ error: "Sem permissão para estatísticas do CRM" }, { status: 403 });
  }

  try {
    const now = new Date();
    const todayKey = SAO_PAULO_DAY.format(now);
    const defaultStart = new Date(`${todayKey}T00:00:00.000${SP_OFFSET}`);
    const defaultEnd = new Date(`${todayKey}T23:59:59.999${SP_OFFSET}`);
    const start = parseDate(req.nextUrl.searchParams.get("startDate"), defaultStart);
    const end = endOfDate(req.nextUrl.searchParams.get("endDate"), defaultEnd);

    const conversations = await prisma.whatsAppConversation.findMany({
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
    });

    const phones = [
      ...new Set(conversations.map((conversation) => normalizedPhoneKey(conversation.contact.phone)).filter(Boolean)),
    ] as string[];

    const clients = phones.length
      ? await prisma.client.findMany({
          where: {
            OR: phones.map((phone) => ({ phone: { contains: phone.slice(-8) } })),
            ...(guard.unitFilter ? { unit: guard.unitFilter } : {}),
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

    for (const conversation of conversations) {
      const phoneKey = normalizedPhoneKey(conversation.contact.phone);
      if (!phoneKey) continue;

      const relatedClients = clientsByPhone.get(phoneKey) || [];
      const client = pickBestCampaignClient(relatedClients.filter((item) => isClickToWhatsappLead(item)));
      if (!client) continue;

      const dayKey = SAO_PAULO_DAY.format(conversation.createdAt);
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
        arrivedAt: conversation.createdAt,
        source: client.source,
        campaignName: client.campaignName,
        fbclid: client.fbclid,
      });
    }

    return NextResponse.json(
      {
        leads,
        total: leads.length,
        range: { start: start.toISOString(), end: end.toISOString() },
        unit: guard.unitFilter || "Todas",
      },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" } }
    );
  } catch (error: any) {
    console.error("[CRM Estatistica CTWA]", error);
    return NextResponse.json({ error: "Falha ao carregar leads CTWA", details: error?.message }, { status: 500 });
  }
}
