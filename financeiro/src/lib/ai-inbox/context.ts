import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { phoneLookupKey } from "@/lib/phone";
import { digest, plainReply, redact } from "./policy";

type ContextMessage = {
  id: string;
  conversationId: string;
  body: string;
  type: string;
  fromMe: boolean;
  status: string;
  timestamp: Date;
  respondedBy: string | null;
  respondedByName: string | null;
  human: boolean;
  transcript: string | null;
  aiCopy: boolean;
};

export async function loadContexts(ids: string[]) {
  if (!ids.length) return [];
  const conversations = await prisma.whatsAppConversation.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      instanceId: true,
      status: true,
      assignedTo: true,
      blockedAt: true,
      archivedAt: true,
      lastMessageAt: true,
      internalNotesUpdatedAt: true,
      callbackDueAt: true,
      contact: { select: { name: true, phone: true, tags: true } },
      followUps: {
        where: { status: "scheduled" },
        select: { scheduledAt: true, note: true, updatedAt: true },
        take: 2,
        orderBy: { scheduledAt: "asc" },
      },
    },
  });
  const messages = await prisma.$queryRaw<ContextMessage[]>(Prisma.sql`
    SELECT m.*, t.transcript, (u.id IS NOT NULL AND u."isActive" AND m."respondedByName" NOT IN ('Automação', 'IA', 'Assistente virtual')) AS human
    FROM "WhatsAppConversation" c
    CROSS JOIN LATERAL (SELECT id, "conversationId", body, type, "fromMe", status, timestamp, "respondedBy", "respondedByName"
      FROM "WhatsAppMessage" WHERE "conversationId" = c.id ORDER BY timestamp DESC, id DESC LIMIT 40) m
    LEFT JOIN "User" u ON u.id = m."respondedBy"
    LEFT JOIN "WhatsAppMessageTranscript" t ON t."whatsAppMessageId" = m.id AND t.status = 'completed'
    WHERE c.id IN (${Prisma.join(ids)}) ORDER BY m.timestamp, m.id`);
  const replies = await prisma.$queryRaw<
    { conversationId: string; text: string }[]
  >(Prisma.sql`SELECT c.id AS "conversationId", o.result->>'text' AS text
    FROM "WhatsAppConversation" c CROSS JOIN LATERAL (SELECT result FROM "AiInboxOperation"
      WHERE "conversationId" = c.id AND "replyHash" IS NOT NULL ORDER BY "createdAt" DESC LIMIT 100) o
    WHERE c.id IN (${Prisma.join(ids)})`);
  // A pre-existing draft or a greeting around an untouched AI suggestion does
  // not make that suggestion independent human evidence.
  for (const m of messages)
    m.aiCopy =
      m.fromMe &&
      replies.some(
        (r) =>
          r.conversationId === m.conversationId &&
          r.text &&
          plainReply(m.body).includes(plainReply(r.text)),
      );
  const phones = conversations
    .map((c) =>
      c.contact.phone.includes("@")
        ? ""
        : (phoneLookupKey(c.contact.phone) || "").slice(-8),
    )
    .filter((p) => p.length === 8);
  const campaigns = phones.length
    ? await prisma.client.findMany({
        where: {
          unit: "SCS",
          OR: phones.map((phone) => ({ phone: { contains: phone } })),
        },
        select: {
          phone: true,
          campaignName: true,
          stage: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: "desc" },
        take: ids.length * 8,
      })
    : [];
  const registry = await prisma.aiUnitKnowledge.findUnique({
    where: { unit: "SCS" },
    select: { address: true, hours: true, updatedAt: true },
  });
  return conversations.map((c) => {
    const history = messages.filter((m) => m.conversationId === c.id);
    const campaign = campaigns.find(
      (client) =>
        !c.contact.phone.includes("@") &&
        phoneLookupKey(client.phone) === phoneLookupKey(c.contact.phone),
    );
    const names = [
      c.contact.name || "",
      ...history.map((m) => m.respondedByName || ""),
    ];
    const snapshot = digest({
      c,
      campaign,
      registry,
      messages: history.map((m) => [
        m.id,
        m.body,
        m.type,
        m.fromMe,
        m.status,
        m.timestamp,
        m.transcript,
      ]),
    });
    const dialogue = history
      .filter((m) => m.status !== "deleted")
      .map((m) => ({
        id: m.id,
        role: m.fromMe ? "equipe" : "cliente",
        human:
          m.fromMe &&
          m.human &&
          !m.aiCopy &&
          !["failed", "error", "deleted"].includes(m.status) &&
          (m.type === "text" || !!m.transcript),
        text: redact(
          m.type === "text"
            ? plainReply(m.body)
            : m.transcript || `[${m.type} sem transcrição]`,
          names,
        ),
        timestamp: m.timestamp.toISOString(),
      }));
    return {
      id: c.id,
      instanceId: c.instanceId,
      snapshot,
      history,
      dialogue,
      registry,
      operational: {
        status: c.status,
        blocked: !!c.blockedAt,
        archived: !!c.archivedAt,
        campaignHint: campaign?.campaignName || null,
        stage: campaign?.stage || null,
        followUps: c.followUps.map((f) => ({
          scheduledAt: f.scheduledAt.toISOString(),
          note: redact(f.note, names),
        })),
      },
    };
  });
}

export type InboxContext = Awaited<ReturnType<typeof loadContexts>>[number];

export function boundedDialogue(context: InboxContext, maxBytes: number) {
  const selected: typeof context.dialogue = [];
  for (const m of [...context.dialogue].reverse()) {
    const next = { ...m };
    if (Buffer.byteLength(JSON.stringify([next, ...selected])) > maxBytes)
      break;
    selected.unshift(next);
  }
  return selected;
}
