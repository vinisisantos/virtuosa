import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUnitGuard } from "@/lib/unit-guard";

const SP_OFFSET = "-03:00";

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

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date");
  const unit = req.nextUrl.searchParams.get("unit");
  const guard = requireUnitGuard(req, { requestedUnit: unit });
  if (guard instanceof NextResponse) return guard;

  const canAudit =
    guard.isAdmin ||
    guard.userRole === "MARKETING" ||
    guard.permissions?.dashboard === true ||
    guard.permissions?.crmEstatistica === true;
  if (!canAudit) {
    return NextResponse.json({ error: "Sem permissão para auditar o dashboard" }, { status: 403 });
  }

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Informe date no formato YYYY-MM-DD" }, { status: 400 });
  }

  const start = new Date(`${date}T00:00:00.000${SP_OFFSET}`);
  const end = new Date(`${date}T23:59:59.999${SP_OFFSET}`);
  const unitWhere = guard.unitFilter ? { unit: guard.unitFilter } : {};

  const clients = await prisma.client.findMany({
    where: {
      ...unitWhere,
      OR: [
        { arrivedAt: { gte: start, lte: end } },
        { arrivedAt: null, createdAt: { gte: start, lte: end } },
      ],
    },
    select: {
      id: true,
      name: true,
      phone: true,
      source: true,
      campaignName: true,
      fbclid: true,
      arrivedAt: true,
      createdAt: true,
      unit: true,
    },
    orderBy: [{ arrivedAt: "asc" }, { createdAt: "asc" }],
  });

  const countedClients: typeof clients = [];
  const ignored: Array<(typeof clients)[number] & { reason: string }> = [];
  const countedKeys = new Set<string>();

  for (const client of clients) {
    if (!isClickToWhatsappLead(client)) {
      ignored.push({ ...client, reason: "Não parece CTWA/facebook_ad" });
      continue;
    }
    const dedupeKey = normalizedPhoneKey(client.phone) || client.id;
    if (countedKeys.has(dedupeKey)) {
      ignored.push({ ...client, reason: "Duplicado por telefone no mesmo dia" });
      continue;
    }
    countedKeys.add(dedupeKey);
    countedClients.push(client);
  }

  const conversations = await prisma.whatsAppConversation.findMany({
    where: {
      createdAt: { gte: start, lte: end },
      ...(guard.unitFilter ? { instance: { unit: guard.unitFilter } } : {}),
    },
    select: {
      id: true,
      createdAt: true,
      contact: { select: { name: true, phone: true } },
      instance: { select: { name: true, unit: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  const ctwaPhones = new Set(
    countedClients
      .map((client) => normalizedPhoneKey(client.phone))
      .filter(Boolean)
  );
  const countedConversationKeys = new Set<string>();
  const countedConversations = conversations.filter((conversation) => {
    const phoneKey = normalizedPhoneKey(conversation.contact.phone);
    if (!phoneKey || !ctwaPhones.has(phoneKey)) return false;
    if (countedConversationKeys.has(phoneKey)) return false;
    countedConversationKeys.add(phoneKey);
    return true;
  });

  const byCampaign = new Map<string, number>();
  for (const client of countedClients) {
    const key = client.campaignName || "Sem campanha";
    byCampaign.set(key, (byCampaign.get(key) || 0) + 1);
  }

  return NextResponse.json({
    date,
    unit: guard.unitFilter || "Todas",
    range: { start: start.toISOString(), end: end.toISOString() },
    dashboardCount: countedConversations.length,
    rawClientCandidates: clients.length,
    ignoredCount: ignored.length,
    conversationsStarted: conversations.length,
    countedConversations,
    byCampaign: [...byCampaign.entries()].map(([campaignName, count]) => ({ campaignName, count })),
    countedClients,
    ignored,
    conversations,
  });
}
