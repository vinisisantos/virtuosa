ALTER TABLE "AiShadowSetting"
  ALTER COLUMN "modelA" SET DEFAULT 'anthropic:claude-sonnet-5';

UPDATE "AiShadowSetting"
SET "modelA" = 'anthropic:claude-sonnet-5'
WHERE "unit" = 'Osasco'
  AND "modelA" = 'gemini:gemini-2.5-flash';

ALTER TABLE "AiShadowRun"
  ADD COLUMN IF NOT EXISTS "sourceMode" TEXT NOT NULL DEFAULT 'live',
  ADD COLUMN IF NOT EXISTS "outcome" TEXT,
  ADD COLUMN IF NOT EXISTS "campaignName" TEXT,
  ADD COLUMN IF NOT EXISTS "campaignId" TEXT;

CREATE INDEX IF NOT EXISTS "AiShadowRun_sourceMode_idx"
  ON "AiShadowRun"("sourceMode");

CREATE INDEX IF NOT EXISTS "AiShadowRun_outcome_idx"
  ON "AiShadowRun"("outcome");

CREATE INDEX IF NOT EXISTS "AiShadowRun_campaignName_idx"
  ON "AiShadowRun"("campaignName");

ALTER TABLE "AiShadowDraft"
  ADD COLUMN IF NOT EXISTS "batchJobId" TEXT,
  ADD COLUMN IF NOT EXISTS "batchCustomId" TEXT;

CREATE INDEX IF NOT EXISTS "AiShadowDraft_batchJobId_idx"
  ON "AiShadowDraft"("batchJobId");

CREATE INDEX IF NOT EXISTS "AiShadowDraft_batchCustomId_idx"
  ON "AiShadowDraft"("batchCustomId");

CREATE TABLE IF NOT EXISTS "AiShadowBatchJob" (
  "id" TEXT NOT NULL,
  "unit" TEXT NOT NULL,
  "sourceMode" TEXT NOT NULL DEFAULT 'retroactive',
  "provider" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "modelKey" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'created',
  "providerBatchId" TEXT,
  "inputFileId" TEXT,
  "outputFileId" TEXT,
  "errorFileId" TEXT,
  "requestCount" INTEGER NOT NULL DEFAULT 0,
  "estimatedInputTokens" INTEGER NOT NULL DEFAULT 0,
  "estimatedOutputTokens" INTEGER NOT NULL DEFAULT 0,
  "estimatedCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "actualInputTokens" INTEGER,
  "actualOutputTokens" INTEGER,
  "actualCostUsd" DOUBLE PRECISION,
  "metadata" JSONB,
  "error" TEXT,
  "submittedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiShadowBatchJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AiShadowBatchJob_unit_status_idx"
  ON "AiShadowBatchJob"("unit", "status");

CREATE INDEX IF NOT EXISTS "AiShadowBatchJob_provider_providerBatchId_idx"
  ON "AiShadowBatchJob"("provider", "providerBatchId");

CREATE INDEX IF NOT EXISTS "AiShadowBatchJob_sourceMode_idx"
  ON "AiShadowBatchJob"("sourceMode");
