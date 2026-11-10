import { Prisma } from "@prisma/client";
import { ALICE_AUTONOMY_INSTANCE_ID } from "@/lib/ai-assistant/autonomy/policy";

/** Baixa apenas o contador interno; não assume/encerra a conversa nem emite recibo no WhatsApp. */
export async function markCompletedAliceRepliesRead(tx: Prisma.TransactionClient, turnIds: string[]) {
  if (!turnIds.length) return;
  // O webhook insere a entrada e incrementa o contador numa transação. Se ela
  // alterar a conversa enquanto este UPDATE espera a linha, o CAS preserva a pendência.
  await tx.$queryRaw(Prisma.sql`
    WITH eligible AS MATERIALIZED (
      SELECT c.id, c.xmin AS version FROM "AliceAutonomousTurn" t
      JOIN "WhatsAppConversation" c ON c.id=t."conversationId" AND c."instanceId"=t."instanceId"
      JOIN "WhatsAppMessage" src ON src.id=t."sourceMessageId" AND src."conversationId"=c.id
      WHERE t.id IN (${Prisma.join(turnIds)}) AND t."instanceId"=${ALICE_AUTONOMY_INSTANCE_ID} AND t.unit='SBC'
        AND t.status='sent' AND t."firstSentAt" IS NOT NULL AND t."completedAt" IS NOT NULL
        AND NOT src."fromMe" AND src.status<>'deleted'
        AND NOT (src.type='secretEncryptedMessage' AND btrim(src.body)='')
        AND c."unreadCount">0 AND c."aiMode"='agent' AND c."blockedAt" IS NULL AND c."archivedAt" IS NULL
        AND NOT c."commercialPaused" AND c.status NOT IN ('closed','resolved','lost')
        AND (c."aiModeUpdatedAt" IS NULL OR c."aiModeUpdatedAt"<=t."firstSentAt")
        AND NOT EXISTS (
          SELECT 1 FROM "WhatsAppMessage" m WHERE m."conversationId"=c.id AND NOT m."fromMe"
            AND m.status<>'deleted' AND NOT (m.type='secretEncryptedMessage' AND btrim(m.body)='') AND m.id<>src.id
            AND (m.timestamp>src.timestamp
              OR (m.timestamp=src.timestamp AND (m."createdAt">=src."createdAt" OR m.id>src.id))
              OR m."createdAt">t."startedAt")
        )
    )
    UPDATE "WhatsAppConversation" c SET "unreadCount"=0, "updatedAt"=clock_timestamp()
    FROM eligible e WHERE c.id=e.id AND c.xmin=e.version RETURNING c.id
  `);
}
