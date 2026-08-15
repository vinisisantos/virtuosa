ALTER TABLE "WhatsAppConversation"
  ADD COLUMN IF NOT EXISTS "callbackQueueStatus" TEXT NOT NULL DEFAULT 'inactive';

CREATE TABLE IF NOT EXISTS "WhatsAppCallbackAttempt" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "attemptNumber" INTEGER NOT NULL,
  "historicalNumber" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'waiting_response',
  "sentAt" TIMESTAMP(3) NOT NULL,
  "sentBy" TEXT,
  "sentByName" TEXT,
  "outboundMessageId" TEXT,
  "respondedAt" TIMESTAMP(3),
  "inboundMessageId" TEXT,
  "resumedAt" TIMESTAMP(3),
  "resumedBy" TEXT,
  "resumedByName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "WhatsAppCallbackAttempt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "WhatsAppConversation_instanceId_callbackQueueStatus_lastMessageAt_idx"
  ON "WhatsAppConversation"("instanceId", "callbackQueueStatus", "lastMessageAt");

CREATE INDEX IF NOT EXISTS "WhatsAppCallbackAttempt_conversationId_status_sentAt_idx"
  ON "WhatsAppCallbackAttempt"("conversationId", "status", "sentAt");

CREATE INDEX IF NOT EXISTS "WhatsAppCallbackAttempt_status_respondedAt_idx"
  ON "WhatsAppCallbackAttempt"("status", "respondedAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'WhatsAppCallbackAttempt_conversationId_fkey'
      AND conrelid = '"WhatsAppCallbackAttempt"'::regclass
  ) THEN
    ALTER TABLE "WhatsAppCallbackAttempt"
      ADD CONSTRAINT "WhatsAppCallbackAttempt_conversationId_fkey"
      FOREIGN KEY ("conversationId") REFERENCES "WhatsAppConversation"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

UPDATE "WhatsAppConversation"
SET "callbackQueueStatus" = 'waiting_response'
WHERE "callbackStreakCount" > 0
  AND "callbackDueAt" IS NOT NULL
  AND "status" NOT IN ('closed', 'resolved', 'lost')
  AND "callbackQueueStatus" = 'inactive';

INSERT INTO "WhatsAppCallbackAttempt" (
  "id",
  "conversationId",
  "attemptNumber",
  "historicalNumber",
  "status",
  "sentAt",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid()::TEXT,
  conversation."id",
  conversation."callbackStreakCount",
  conversation."callbackTotalCount",
  'waiting_response',
  COALESCE(conversation."lastOutboundAt", conversation."updatedAt"),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "WhatsAppConversation" conversation
WHERE conversation."callbackQueueStatus" = 'waiting_response'
  AND NOT EXISTS (
    SELECT 1
    FROM "WhatsAppCallbackAttempt" attempt
    WHERE attempt."conversationId" = conversation."id"
      AND attempt."status" IN ('waiting_response', 'responded')
  );
