ALTER TABLE "AiPublicTestSession"
  ADD COLUMN IF NOT EXISTS "conversationState" JSONB;

ALTER TABLE "AiTrainingConversation"
  ADD COLUMN IF NOT EXISTS "conversationState" JSONB;

ALTER TABLE "AiPublicTestMessage"
  ADD COLUMN IF NOT EXISTS "sdrAudit" JSONB,
  ADD COLUMN IF NOT EXISTS "promptTokens" INTEGER,
  ADD COLUMN IF NOT EXISTS "completionTokens" INTEGER,
  ADD COLUMN IF NOT EXISTS "latencyMs" INTEGER,
  ADD COLUMN IF NOT EXISTS "generationAttempts" INTEGER;

ALTER TABLE "AiTrainingMessage"
  ADD COLUMN IF NOT EXISTS "sdrAudit" JSONB,
  ADD COLUMN IF NOT EXISTS "promptTokens" INTEGER,
  ADD COLUMN IF NOT EXISTS "completionTokens" INTEGER,
  ADD COLUMN IF NOT EXISTS "latencyMs" INTEGER,
  ADD COLUMN IF NOT EXISTS "generationAttempts" INTEGER;

UPDATE "AiPublicTestLink"
SET
  "promptVersion" = 'virt-ai-public-v5',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" = 'active'
  AND "promptVersion" IS DISTINCT FROM 'virt-ai-public-v5';
