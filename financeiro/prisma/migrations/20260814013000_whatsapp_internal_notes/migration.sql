ALTER TABLE "WhatsAppConversation"
  ADD COLUMN IF NOT EXISTS "internalNotesUpdatedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "WhatsAppConversationInternalNote" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "mentions" JSONB,
  "createdBy" TEXT NOT NULL,
  "createdByName" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "WhatsAppConversationInternalNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "WhatsAppConversationInternalNote_conversationId_createdAt_idx"
  ON "WhatsAppConversationInternalNote"("conversationId", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'WhatsAppConversationInternalNote_conversationId_fkey'
      AND conrelid = '"WhatsAppConversationInternalNote"'::regclass
  ) THEN
    ALTER TABLE "WhatsAppConversationInternalNote"
      ADD CONSTRAINT "WhatsAppConversationInternalNote_conversationId_fkey"
      FOREIGN KEY ("conversationId") REFERENCES "WhatsAppConversation"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
