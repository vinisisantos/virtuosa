import { prisma } from "@/lib/db";
import { phoneLookupKey } from "@/lib/phone";

function contactPhoneConditions(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const suffix = digits.slice(-8);
  return [
    { phone },
    ...(digits ? [{ phone: { contains: digits } }] : []),
    ...(suffix.length >= 8 ? [{ phone: { contains: suffix } }] : []),
  ];
}

export function normalizePhoneForWhatsApp(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const key = phoneLookupKey(phone);
  if (!key) return digits;
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  return key.length >= 10 && key.length <= 11 ? `55${key}` : digits;
}

export async function findConversationByPhone(params: {
  phone: string;
  instanceIds?: string[];
  includeArchivedInstances?: boolean;
}) {
  const phoneKey = phoneLookupKey(params.phone);
  if (!phoneKey) return null;

  const conversations = await prisma.whatsAppConversation.findMany({
    where: {
      ...(params.instanceIds ? { instanceId: { in: params.instanceIds } } : {}),
      ...(!params.includeArchivedInstances ? { instance: { status: { not: "archived" } } } : {}),
      contact: {
        OR: contactPhoneConditions(params.phone),
      },
    },
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
    orderBy: [{ lastMessageAt: "desc" }, { updatedAt: "desc" }],
    take: 30,
  });

  return conversations.find((conversation) => phoneLookupKey(conversation.contact.phone) === phoneKey) || null;
}

async function findContactByPhone(phone: string) {
  const phoneKey = phoneLookupKey(phone);
  if (!phoneKey) return null;

  const contacts = await prisma.whatsAppContact.findMany({
    where: { OR: contactPhoneConditions(phone) },
    orderBy: { updatedAt: "desc" },
    take: 20,
  });

  return contacts.find((contact) => phoneLookupKey(contact.phone) === phoneKey) || null;
}

function shouldUseContactName(name: string | null | undefined, phone: string) {
  const cleanName = (name || "").trim();
  return !!cleanName && phoneLookupKey(cleanName) !== phoneLookupKey(phone);
}

export async function createConversationForInstance(params: {
  instanceId: string;
  phone: string;
  contactName?: string | null;
  unit?: string | null;
  lastKnownJid?: string | null;
}) {
  const canonicalPhone = normalizePhoneForWhatsApp(params.phone);
  const contactName = shouldUseContactName(params.contactName, canonicalPhone)
    ? params.contactName!.trim()
    : canonicalPhone;

  let contact = await findContactByPhone(canonicalPhone);
  if (!contact) {
    contact = await prisma.whatsAppContact.upsert({
      where: { phone: canonicalPhone },
      update: {},
      create: {
        phone: canonicalPhone,
        name: contactName,
        unit: params.unit || null,
      },
    });
  } else if ((!contact.name || contact.name === contact.phone) && contactName !== canonicalPhone) {
    contact = await prisma.whatsAppContact.update({
      where: { id: contact.id },
      data: {
        name: contactName,
        unit: contact.unit || params.unit || null,
      },
    });
  }

  return prisma.whatsAppConversation.upsert({
    where: {
      contactId_instanceId: {
        contactId: contact.id,
        instanceId: params.instanceId,
      },
    },
    update: {
      status: "open",
      closedAt: null,
      closeNote: null,
      resolution: null,
      ...(params.lastKnownJid ? { lastKnownJid: params.lastKnownJid } : {}),
    },
    create: {
      contactId: contact.id,
      instanceId: params.instanceId,
      status: "open",
      lastKnownJid: params.lastKnownJid || null,
    },
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
  });
}
