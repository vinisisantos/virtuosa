import { prisma } from "@/lib/db";
import { pickBestCampaignClient } from "@/lib/campaign-client-selection";
import { extractDirectFormLeadName } from "@/lib/whatsapp/form-lead-welcome";
import { leadArrivalMatchesEventDay } from "@/lib/whatsapp/lead-arrival-date";
import { qualifiedLeadInstanceFilter } from "@/lib/whatsapp/qualified-lead-scope";

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
  conversationId: string;
  assignedTo: string | null;
  assignedToName: string | null;
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
  const [conversations, directFormMessages] = await Promise.all([
    prisma.whatsAppConversation.findMany({
      where: {
        ...(params.start || params.end ? { createdAt: { ...(params.start ? { gte: params.start } : {}), ...(params.end ? { lte: params.end } : {}) } } : {}),
        ...(params.assignedTo ? { assignedTo: params.assignedTo } : {}),
        instance: qualifiedLeadInstanceFilter(params.unit),
      },
      select: {
        id: true,
        createdAt: true,
        assignedTo: true,
        assignedToName: true,
        contact: { select: { phone: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.whatsAppMessage.findMany({
      where: {
        fromMe: false,
        body: { contains: "Preenchi seu formulário", mode: "insensitive" },
        ...(params.start || params.end ? { timestamp: { ...(params.start ? { gte: params.start } : {}), ...(params.end ? { lte: params.end } : {}) } } : {}),
        conversation: {
          ...(params.assignedTo ? { assignedTo: params.assignedTo } : {}),
          instance: qualifiedLeadInstanceFilter(params.unit),
        },
      },
      select: {
        body: true,
        timestamp: true,
        conversation: {
          select: {
            id: true,
            assignedTo: true,
            assignedToName: true,
            contact: { select: { phone: true } },
          },
        },
      },
      orderBy: { timestamp: "asc" },
    }),
  ]);

  const directFormEvents = directFormMessages.flatMap((message) => {
    const phone = message.conversation.contact.phone;
    return extractDirectFormLeadName(message.body, phone)
      ? [{
          receivedAt: message.timestamp,
          phone,
          conversationId: message.conversation.id,
          assignedTo: message.conversation.assignedTo,
          assignedToName: message.conversation.assignedToName,
          isDirectFormLead: true,
        }]
      : [];
  });
  const leadEvents = [
    ...conversations.map((conversation) => ({
      receivedAt: conversation.createdAt,
      phone: conversation.contact.phone,
      conversationId: conversation.id,
      assignedTo: conversation.assignedTo,
      assignedToName: conversation.assignedToName,
      isDirectFormLead: false,
    })),
    ...directFormEvents,
  ].sort((first, second) => first.receivedAt.getTime() - second.receivedAt.getTime());

  const phones = [...new Set(leadEvents.map((event) => normalizedWhatsappPhone(event.phone)).filter(Boolean))] as string[];
  if (phones.length === 0) return [] as QualifiedWhatsappLead[];

  const clients = await prisma.client.findMany({
    where: {
      isActive: true,
      AND: [
        { OR: phones.map((phone) => ({ phone: { contains: phone.slice(-8) } })) },
        ...(params.unit
          ? [{ OR: [{ unit: params.unit }, { originUnit: params.unit }] }]
          : []),
      ],
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
  for (const event of leadEvents) {
    const phoneKey = normalizedWhatsappPhone(event.phone);
    if (!phoneKey) continue;
    const relatedClients = clientsByPhone.get(phoneKey) || [];
    const clickToWhatsappClients = relatedClients.filter(isClickToWhatsappLead);
    const client = event.isDirectFormLead
      ? pickBestCampaignClient(clickToWhatsappClients) || pickBestCampaignClient(relatedClients)
      : pickBestCampaignClient(
          clickToWhatsappClients.filter((candidate) =>
            leadArrivalMatchesEventDay(candidate, event.receivedAt)
          )
        );
    if (!client) continue;

    const dedupeKey = `${spDateKey(event.receivedAt)}:${phoneKey}`;
    if (countedKeys.has(dedupeKey)) continue;
    countedKeys.add(dedupeKey);
    leads.push({
      receivedAt: event.receivedAt,
      phoneKey,
      conversationId: event.conversationId,
      assignedTo: event.assignedTo,
      assignedToName: event.assignedToName,
      client,
    });
  }

  return leads;
}
