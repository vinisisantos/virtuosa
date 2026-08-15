import { Prisma } from "@prisma/client";

import { phoneLookupKey } from "@/lib/phone";

export const WHATSAPP_CALLBACK_SUPPRESSED_CLOSED_PACKAGE = "suppressed_closed_package";

type CallbackSuppressionDatabase = Prisma.TransactionClient;

export async function suppressWhatsAppCallbacksForClosedPackage(params: {
  db: CallbackSuppressionDatabase;
  clientId: string;
  unit: string;
}) {
  const client = await params.db.client.findUnique({
    where: { id: params.clientId },
    select: { phone: true },
  });
  const phoneKey = phoneLookupKey(client?.phone);
  if (!phoneKey) return 0;

  const changed = await params.db.$executeRaw`
    UPDATE "WhatsAppConversation" AS conversation
    SET
      "callbackDueAt" = NULL,
      "callbackTrackingStartedAt" = NULL,
      "callbackStreakCount" = 0,
      "callbackPipelineSyncedAt" = NOW(),
      "callbackQueueStatus" = ${WHATSAPP_CALLBACK_SUPPRESSED_CLOSED_PACKAGE},
      "updatedAt" = NOW()
    FROM "WhatsAppContact" AS contact, "WhatsAppInstance" AS instance
    WHERE conversation."contactId" = contact."id"
      AND conversation."instanceId" = instance."id"
      AND RIGHT(REGEXP_REPLACE(contact."phone", '[^0-9]', '', 'g'), 11) = ${phoneKey}
      AND (
        instance."unit" = ${params.unit}
        OR (instance."unit" = 'Todas' AND contact."unit" = ${params.unit})
      )
      AND conversation."callbackQueueStatus" <> ${WHATSAPP_CALLBACK_SUPPRESSED_CLOSED_PACKAGE}
  `;

  await params.db.$executeRaw`
    UPDATE "WhatsAppCallbackAttempt" AS attempt
    SET
      "status" = ${WHATSAPP_CALLBACK_SUPPRESSED_CLOSED_PACKAGE},
      "updatedAt" = NOW()
    FROM "WhatsAppConversation" AS conversation,
         "WhatsAppContact" AS contact,
         "WhatsAppInstance" AS instance
    WHERE attempt."conversationId" = conversation."id"
      AND conversation."contactId" = contact."id"
      AND conversation."instanceId" = instance."id"
      AND RIGHT(REGEXP_REPLACE(contact."phone", '[^0-9]', '', 'g'), 11) = ${phoneKey}
      AND (
        instance."unit" = ${params.unit}
        OR (instance."unit" = 'Todas' AND contact."unit" = ${params.unit})
      )
      AND attempt."status" IN ('waiting_response', 'responded')
  `;

  return changed;
}
