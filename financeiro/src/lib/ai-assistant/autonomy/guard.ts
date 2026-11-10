import type { AliceAutonomousTurn } from "@prisma/client";
import { prisma } from "@/lib/db";
import { loadAliceAutonomyConfig } from "@/lib/ai-assistant/autonomy/config";
import { ALICE_AUTONOMY_INSTANCE_ID, ALICE_AUTONOMY_LEASE_MS, aliceAutonomyConversationEligible } from "@/lib/ai-assistant/autonomy/policy";

export class AliceAutonomyStopped extends Error {
  constructor() { super("conversation_changed_before_send"); }
}

export async function validateAliceAutonomousTurn(
  turn: AliceAutonomousTurn, token: string, status: "processing" | "sending", database = prisma,
) {
  if (turn.instanceId !== ALICE_AUTONOMY_INSTANCE_ID || !(await loadAliceAutonomyConfig(database)).enabled) return false;
  const [current, conversation, messages] = await Promise.all([
    database.aliceAutonomousTurn.findFirst({ where: { id: turn.id, claimToken: token, status,
      conversationId: turn.conversationId, instanceId: turn.instanceId, sourceMessageId: turn.sourceMessageId,
      claimedAt: { gte: new Date(Date.now() - ALICE_AUTONOMY_LEASE_MS) } }, select: { id: true } }),
    database.whatsAppConversation.findFirst({ where: { id: turn.conversationId, instanceId: turn.instanceId }, select: {
      instanceId: true, aiMode: true, status: true, blockedAt: true, archivedAt: true, commercialPaused: true,
      instance: { select: { status: true, unit: true } }, commercialHolds: { select: { dealId: true }, take: 1 },
    } }),
    database.whatsAppMessage.findMany({ where: { conversationId: turn.conversationId, status: { not: "deleted" },
      NOT: { type: "secretEncryptedMessage", body: "" } },
      select: { id: true, messageId: true, fromMe: true, respondedByName: true },
      orderBy: [{ timestamp: "desc" }, { id: "desc" }], take: 30 }),
  ]);
  if (!current || !conversation || !aliceAutonomyConversationEligible(conversation)
    || conversation.instance.status !== "connected" || conversation.instance.unit !== "SBC" || conversation.commercialHolds.length) return false;
  const own = Array.isArray(turn.providerMessageIds) ? turn.providerMessageIds : [];
  for (const message of messages) {
    if (!message.fromMe) return message.id === turn.sourceMessageId;
    if (!own.includes(message.messageId) && message.respondedByName !== "Automação de recepção") return false;
  }
  return false;
}
