import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { phoneLookupKey } from "@/lib/phone";
import { normalizedPhoneKeySql } from "@/lib/whatsapp/phone-sql";

export function manualOnlyPhoneKey(phone?: string | null) {
  const key = phoneLookupKey(phone);
  return key && key.length >= 10 ? key : null;
}

export async function isManualOnlyPhone(phone?: string | null) {
  const phoneKey = manualOnlyPhoneKey(phone);
  if (!phoneKey) return false;

  const client = await prisma.client.findFirst({
    where: { manualOnlyPhoneKey: phoneKey },
    select: { id: true },
  });
  return Boolean(client);
}

export async function cancelManualOnlyAutomationQueues(
  phoneKey: string,
  tx: Prisma.TransactionClient,
) {
  const conversations = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT conversation.id
    FROM "WhatsAppConversation" conversation
    JOIN "WhatsAppContact" contact ON contact.id = conversation."contactId"
    WHERE ${normalizedPhoneKeySql(Prisma.sql`contact.phone`)} = ${phoneKey}
  `);
  const conversationIds = conversations.map(({ id }) => id);
  if (conversationIds.length === 0) return;

  const now = new Date();
  await Promise.all([
    tx.aliceAutonomousTurn.updateMany({
      where: {
        conversationId: { in: conversationIds },
        status: { in: ["queued", "processing"] },
        firstSentAt: null,
      },
      data: {
        status: "skipped",
        error: "manual_only_contact",
        completedAt: now,
        claimToken: null,
        messagesJson: Prisma.JsonNull,
      },
    }),
    tx.whatsAppWelcomeJob.updateMany({
      where: {
        conversationId: { in: conversationIds },
        status: { in: ["pending", "processing"] },
      },
      data: {
        status: "cancelled",
        reason: "manual_only_contact",
        claimToken: null,
      },
    }),
  ]);
}
