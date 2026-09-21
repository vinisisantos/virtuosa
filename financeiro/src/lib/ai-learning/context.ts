import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { aiLearningDigest, plainLearningText, sanitizeLearningText } from "@/lib/ai-learning/policy";

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
};

export type AiLearningDialogueMessage = {
  id: string;
  role: "cliente" | "equipe";
  human: boolean;
  text: string;
  timestamp: string;
};

export type AiLearningContext = {
  id: string;
  instanceId: string;
  snapshot: string;
  operational: { status: string; blocked: boolean; archived: boolean };
  dialogue: AiLearningDialogueMessage[];
};

export async function loadAiLearningContexts(ids: string[]): Promise<AiLearningContext[]> {
  if (!ids.length) return [];
  const conversations = await prisma.whatsAppConversation.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      instanceId: true,
      status: true,
      blockedAt: true,
      archivedAt: true,
      contact: { select: { name: true } },
    },
  });
  const messages = await prisma.$queryRaw<ContextMessage[]>(Prisma.sql`
    SELECT m.id, m."conversationId", m.body, m.type, m."fromMe", m.status, m.timestamp,
      m."respondedBy", m."respondedByName",
      (u.id IS NOT NULL AND u."isActive" AND lower(COALESCE(m."respondedByName", ''))
        NOT IN ('automação', 'automação meta', 'assistente virtual', 'ia', 'sistema')) AS human
    FROM "WhatsAppConversation" c
    CROSS JOIN LATERAL (
      SELECT id, "conversationId", body, type, "fromMe", status, timestamp, "respondedBy", "respondedByName"
      FROM "WhatsAppMessage"
      WHERE "conversationId" = c.id AND type = 'text' AND status <> 'deleted'
      ORDER BY timestamp DESC, id DESC
      LIMIT 20
    ) m
    LEFT JOIN "User" u ON u.id = m."respondedBy"
    WHERE c.id IN (${Prisma.join(ids)})
    ORDER BY m.timestamp, m.id`);

  return conversations.map((conversation) => {
    const history = messages.filter((message) => message.conversationId === conversation.id);
    const names = [
      conversation.contact.name || "",
      ...history.map((message) => message.respondedByName || ""),
    ];
    const dialogue = history
      .filter((message) => plainLearningText(message.body).length > 0)
      .map((message) => ({
        id: message.id,
        role: message.fromMe ? "equipe" as const : "cliente" as const,
        human: message.fromMe
          && message.human
          && !["failed", "error", "deleted"].includes(message.status),
        text: sanitizeLearningText(message.body, names),
        timestamp: message.timestamp.toISOString(),
      }));
    return {
      id: conversation.id,
      instanceId: conversation.instanceId,
      snapshot: aiLearningDigest({
        conversation: [conversation.id, conversation.instanceId, conversation.status, conversation.blockedAt, conversation.archivedAt],
        messages: history.map((message) => [
          message.id,
          message.body,
          message.fromMe,
          message.status,
          message.timestamp,
          message.respondedBy,
        ]),
      }),
      operational: {
        status: conversation.status,
        blocked: Boolean(conversation.blockedAt),
        archived: Boolean(conversation.archivedAt),
      },
      dialogue,
    };
  });
}

export function boundedAiLearningDialogue(context: AiLearningContext, maxBytes: number) {
  const selected: AiLearningDialogueMessage[] = [];
  for (const message of [...context.dialogue].reverse()) {
    const next = [message, ...selected];
    if (Buffer.byteLength(JSON.stringify(next), "utf8") > maxBytes) break;
    selected.unshift(message);
  }
  return selected;
}
