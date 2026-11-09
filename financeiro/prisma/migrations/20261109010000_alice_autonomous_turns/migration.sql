CREATE TABLE IF NOT EXISTS "AliceAutonomousTurn" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "conversationId" TEXT NOT NULL,
  "instanceId" TEXT NOT NULL,
  "unit" TEXT NOT NULL DEFAULT 'SBC' CHECK ("unit" = 'SBC'),
  "sourceMessageId" TEXT NOT NULL,
  "origin" TEXT NOT NULL DEFAULT 'inbound' CHECK ("origin" IN ('inbound', 'backlog')),
  "status" TEXT NOT NULL DEFAULT 'queued' CHECK ("status" IN ('queued', 'processing', 'sending', 'sent', 'uncertain', 'needs_human', 'skipped', 'failed')),
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "claimToken" TEXT,
  "claimedAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "firstSentAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "messagesJson" JSONB,
  "nextMessageIndex" INTEGER NOT NULL DEFAULT 0,
  "providerMessageIds" JSONB NOT NULL DEFAULT '[]',
  "model" TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
  "inputTokens" INTEGER NOT NULL DEFAULT 0,
  "outputTokens" INTEGER NOT NULL DEFAULT 0,
  "cacheReadInputTokens" INTEGER NOT NULL DEFAULT 0,
  "cacheCreationInputTokens" INTEGER NOT NULL DEFAULT 0,
  "costMicroUsd" INTEGER NOT NULL DEFAULT 0,
  "generationMs" INTEGER NOT NULL DEFAULT 0,
  "generationStartedAt" TIMESTAMP(3),
  "usageRecorded" BOOLEAN NOT NULL DEFAULT FALSE,
  "appointmentId" TEXT,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "AliceAutonomousTurn_conversationId_sourceMessageId_key" ON "AliceAutonomousTurn"("conversationId", "sourceMessageId");
CREATE INDEX IF NOT EXISTS "AliceAutonomousTurn_status_availableAt_idx" ON "AliceAutonomousTurn"("status", "availableAt");
CREATE INDEX IF NOT EXISTS "AliceAutonomousTurn_unit_createdAt_idx" ON "AliceAutonomousTurn"("unit", "createdAt");
CREATE INDEX IF NOT EXISTS "AliceAutonomousTurn_instanceId_conversationId_status_idx" ON "AliceAutonomousTurn"("instanceId", "conversationId", "status");
ALTER TABLE "AliceAutonomousTurn" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "AliceAutonomousTurn" FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "AliceAutonomousTurn" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON "AliceAutonomousTurn" FROM authenticated;
  END IF;
END $$;

ALTER TABLE "WhatsAppConversation" DROP CONSTRAINT IF EXISTS "WhatsAppConversation_aiMode_check";
ALTER TABLE "WhatsAppConversation" ADD CONSTRAINT "WhatsAppConversation_aiMode_check"
  CHECK ("aiMode" IN ('manual', 'suggestions', 'agent'));

-- O deploy provisiona a estrutura, nunca o consentimento ou a fila histórica.
INSERT INTO "AppSetting" ("id", "key", "value", "createdAt", "updatedAt")
VALUES ('alice-autonomous-sbc-activation', 'alice_autonomous_sbc_v1', '{"enabled":false}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
