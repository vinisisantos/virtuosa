import { prisma } from "@/lib/db";
import { pickBestCampaignClient } from "@/lib/campaign-client-selection";

const SP_TZ = "America/Sao_Paulo";

type QualifiedLeadClient = {
  id: string;
  phone: string | null;
  source: string | null;
  fbclid: string | null;
  campaignId: string | null;
  campaignName: string | null;
  campaignAttribution: string | null;
  utmCampaign: string | null;
  stage: string;
  totalSpent: number;
  packageValue: number | null;
  unit: string;
  name: string;
  email: string | null;
  arrivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type QualifiedWhatsappLead = {
  receivedAt: Date;
  phoneKey: string;
  client: QualifiedLeadClient;
};

export function normalizedWhatsappPhone(value?: string | null) {
  const digits = (value || "").replace(/\D/g, "");
  return digits.length >= 8 ? digits.slice(-11) : null;
}

function isClickToWhatsappLead(client: Pick<QualifiedLeadClient, "source" | "fbclid">) {
  const adUrl = client.fbclid || "";
  return (
    client.source === "facebook_ad" ||
    /(?:fb\.me|wa\.me|wamo\/status\/preview|instagram\.com\/p\/)/i.test(adUrl)
  );
}

function spDateKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SP_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export async function getQualifiedWhatsappLeads(params: {
  start?: Date;
  end?: Date;
  unit?: string;
  assignedTo?: string;
}) {
  const conversations = await prisma.whatsAppConversation.findMany({
    where: {
      ...(params.start || params.end ? { createdAt: { ...(params.start ? { gte: params.start } : {}), ...(params.end ? { lte: params.end } : {}) } } : {}),
      ...(params.assignedTo ? { assignedTo: params.assignedTo } : {}),
      ...(params.unit ? { instance: { unit: params.unit } } : {}),
    },
    select: {
      createdAt: true,
      contact: { select: { phone: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const phones = [...new Set(conversations.map((conversation) => normalizedWhatsappPhone(conversation.contact.phone)).filter(Boolean))] as string[];
  if (phones.length === 0) return [] as QualifiedWhatsappLead[];

  const clients = await prisma.client.findMany({
    where: {
      isActive: true,
      OR: phones.map((phone) => ({ phone: { contains: phone.slice(-8) } })),
      ...(params.unit ? { unit: params.unit } : {}),
    },
    select: {
      id: true,
      phone: true,
      source: true,
      fbclid: true,
      campaignId: true,
      campaignName: true,
      campaignAttribution: true,
      utmCampaign: true,
      stage: true,
      totalSpent: true,
      packageValue: true,
      unit: true,
      name: true,
      email: true,
      arrivedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const clientsByPhone = new Map<string, QualifiedLeadClient[]>();
  for (const client of clients) {
    const phoneKey = normalizedWhatsappPhone(client.phone);
    if (!phoneKey) continue;
    const list = clientsByPhone.get(phoneKey) || [];
    list.push(client);
    clientsByPhone.set(phoneKey, list);
  }

  const leads: QualifiedWhatsappLead[] = [];
  const countedKeys = new Set<string>();
  for (const conversation of conversations) {
    const phoneKey = normalizedWhatsappPhone(conversation.contact.phone);
    if (!phoneKey) continue;
    const candidates = (clientsByPhone.get(phoneKey) || []).filter(isClickToWhatsappLead);
    const client = pickBestCampaignClient(candidates);
    if (!client) continue;

    const dedupeKey = `${spDateKey(conversation.createdAt)}:${phoneKey}`;
    if (countedKeys.has(dedupeKey)) continue;
    countedKeys.add(dedupeKey);
    leads.push({ receivedAt: conversation.createdAt, phoneKey, client });
  }

  return leads;
}
