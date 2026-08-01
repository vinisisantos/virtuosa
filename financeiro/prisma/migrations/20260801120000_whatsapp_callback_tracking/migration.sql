ALTER TABLE "WhatsAppConversation"
  ADD COLUMN IF NOT EXISTS "lastInboundAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastOutboundAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "callbackDueAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "callbackTrackingStartedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "callbackStreakCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "callbackTotalCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "callbackPipelineSyncedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "WhatsAppConversation_callbackDueAt_callbackStreakCount_status_idx"
  ON "WhatsAppConversation"("callbackDueAt", "callbackStreakCount", "status");
