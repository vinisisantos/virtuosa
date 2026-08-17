import { prisma } from "@/lib/db";

export const WHATSAPP_REACTION_NOTE_PREFIX = "__crm_whatsapp_reaction_v1__:";

export type WhatsAppReactionActor = "contact" | "own";

type ReactionFields = {
  contactReaction: string | null;
  ownReaction: string | null;
};

function reactionStorageKey(targetMessageId: string, actor: WhatsAppReactionActor) {
  return `${WHATSAPP_REACTION_NOTE_PREFIX}${actor}:${targetMessageId}`;
}

function reactionMapKey(conversationId: string, targetMessageId: string) {
  return `${conversationId}\u0000${targetMessageId}`;
}

function reactionFromMetadata(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const reaction = (value as Record<string, unknown>).reaction;
  return typeof reaction === "string" && reaction.trim() ? reaction.trim() : null;
}

export async function setStoredMessageReaction(params: {
  conversationId: string;
  targetMessageId: string;
  actor: WhatsAppReactionActor;
  reaction: string | null;
}) {
  const content = reactionStorageKey(params.targetMessageId, params.actor);
  const reaction = params.reaction?.trim() || null;
  const existing = await prisma.whatsAppConversationInternalNote.findFirst({
    where: { conversationId: params.conversationId, content },
    select: { id: true, mentions: true },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  if (reactionFromMetadata(existing?.mentions) === reaction) return;

  if (!reaction) {
    await prisma.whatsAppConversationInternalNote.deleteMany({
      where: { conversationId: params.conversationId, content },
    });
    return;
  }

  const metadata = {
    kind: "whatsapp_message_reaction",
    targetMessageId: params.targetMessageId,
    actor: params.actor,
    reaction,
  };
  if (existing) {
    await prisma.whatsAppConversationInternalNote.update({
      where: { id: existing.id },
      data: { mentions: metadata },
    });
  } else {
    await prisma.whatsAppConversationInternalNote.create({
      data: {
        conversationId: params.conversationId,
        content,
        mentions: metadata,
        createdBy: "system:whatsapp-reaction",
        createdByName: "WhatsApp",
      },
    });
  }
}

export async function attachStoredMessageReactions<
  T extends { conversationId: string; messageId: string },
>(messages: T[]): Promise<Array<T & ReactionFields>> {
  if (!messages.length) return [];

  const conversationIds = [...new Set(messages.map((message) => message.conversationId))];
  const messageIds = [...new Set(messages.map((message) => message.messageId))];
  const storageKeys = messageIds.flatMap((messageId) => [
    reactionStorageKey(messageId, "contact"),
    reactionStorageKey(messageId, "own"),
  ]);
  const notes = await prisma.whatsAppConversationInternalNote.findMany({
    where: {
      conversationId: { in: conversationIds },
      content: { in: storageKeys },
    },
    select: {
      conversationId: true,
      content: true,
      mentions: true,
      createdAt: true,
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  const reactions = new Map<string, ReactionFields>();
  for (const note of notes) {
    const actor: WhatsAppReactionActor | null = note.content.startsWith(
      `${WHATSAPP_REACTION_NOTE_PREFIX}contact:`,
    )
      ? "contact"
      : note.content.startsWith(`${WHATSAPP_REACTION_NOTE_PREFIX}own:`)
        ? "own"
        : null;
    if (!actor) continue;

    const targetMessageId = note.content.slice(
      `${WHATSAPP_REACTION_NOTE_PREFIX}${actor}:`.length,
    );
    const reaction = reactionFromMetadata(note.mentions);
    if (!targetMessageId || !reaction) continue;

    const key = reactionMapKey(note.conversationId, targetMessageId);
    const current = reactions.get(key) || { contactReaction: null, ownReaction: null };
    current[actor === "contact" ? "contactReaction" : "ownReaction"] = reaction;
    reactions.set(key, current);
  }

  return messages.map((message) => ({
    ...message,
    ...(reactions.get(reactionMapKey(message.conversationId, message.messageId)) || {
      contactReaction: null,
      ownReaction: null,
    }),
  }));
}
