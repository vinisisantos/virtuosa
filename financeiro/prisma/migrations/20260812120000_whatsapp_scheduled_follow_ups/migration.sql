CREATE TABLE IF NOT EXISTS "WhatsAppConversationFollowUp" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "assignedTo" TEXT NOT NULL,
    "assignedToName" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3),
    "completedBy" TEXT,
    "completedByName" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledBy" TEXT,
    "cancelledByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppConversationFollowUp_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "WhatsAppConversationFollowUp_conversationId_status_idx"
ON "WhatsAppConversationFollowUp"("conversationId", "status");

CREATE INDEX IF NOT EXISTS "WhatsAppConversationFollowUp_status_assignedTo_scheduledAt_idx"
ON "WhatsAppConversationFollowUp"("status", "assignedTo", "scheduledAt");

CREATE INDEX IF NOT EXISTS "WhatsAppConversationFollowUp_scheduledAt_idx"
ON "WhatsAppConversationFollowUp"("scheduledAt");

CREATE UNIQUE INDEX IF NOT EXISTS "WhatsAppConversationFollowUp_one_scheduled_per_conversation_idx"
ON "WhatsAppConversationFollowUp"("conversationId")
WHERE "status" = 'scheduled';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'WhatsAppConversationFollowUp_conversationId_fkey'
  ) THEN
    ALTER TABLE "WhatsAppConversationFollowUp"
    ADD CONSTRAINT "WhatsAppConversationFollowUp_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "WhatsAppConversation"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
