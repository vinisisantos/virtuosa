ALTER TABLE "WhatsAppConversation"
  ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "archivedBy" TEXT,
  ADD COLUMN IF NOT EXISTS "archivedByName" TEXT;

CREATE INDEX IF NOT EXISTS "WhatsAppConversation_instanceId_archivedAt_lastMessageAt_idx"
  ON "WhatsAppConversation"("instanceId", "archivedAt", "lastMessageAt");
