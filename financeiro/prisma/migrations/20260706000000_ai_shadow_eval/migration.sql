CREATE TABLE IF NOT EXISTS "AiShadowSetting" (
  "id" TEXT NOT NULL,
  "unit" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "mode" TEXT NOT NULL DEFAULT 'shadow',
  "allowedInstanceIds" JSONB,
  "modelA" TEXT NOT NULL DEFAULT 'gemini:gemini-2.5-flash',
  "modelB" TEXT NOT NULL DEFAULT 'groq:meta-llama/llama-4-scout-17b-16e-instruct',
  "onlyAfterHours" BOOLEAN NOT NULL DEFAULT true,
  "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  "weekdayStart" TEXT NOT NULL DEFAULT '19:00',
  "weekdayEnd" TEXT NOT NULL DEFAULT '08:00',
  "weekendEnabled" BOOLEAN NOT NULL DEFAULT true,
  "maxRunsPerDay" INTEGER NOT NULL DEFAULT 80,
  "promptVersion" TEXT NOT NULL DEFAULT 'virt-ai-shadow-v1',
  "knowledgeVersion" TEXT NOT NULL DEFAULT 'crm-live-v1',
  "updatedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiShadowSetting_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AiShadowRun" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "incomingMessageId" TEXT,
  "unit" TEXT NOT NULL,
  "instanceId" TEXT NOT NULL,
  "contactId" TEXT,
  "contactPhone" TEXT,
  "contactName" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "triggerReason" TEXT,
  "promptVersion" TEXT NOT NULL,
  "knowledgeVersion" TEXT NOT NULL,
  "context" JSONB,
  "error" TEXT,
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiShadowRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AiShadowDraft" (
  "id" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "modelKey" TEXT NOT NULL,
  "blindLabel" TEXT,
  "provider" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "decision" TEXT,
  "messages" JSONB,
  "handoffReason" TEXT,
  "confidence" DOUBLE PRECISION,
  "guardrailFlags" JSONB,
  "rawText" TEXT,
  "error" TEXT,
  "latencyMs" INTEGER,
  "promptTokens" INTEGER,
  "completionTokens" INTEGER,
  "costUsd" DOUBLE PRECISION,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiShadowDraft_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AiShadowReview" (
  "id" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "reviewerId" TEXT,
  "reviewerName" TEXT,
  "selectedOption" TEXT NOT NULL,
  "humanScore" INTEGER,
  "severeErrorA" BOOLEAN NOT NULL DEFAULT false,
  "severeErrorB" BOOLEAN NOT NULL DEFAULT false,
  "severeErrorNotes" TEXT,
  "handoffAssessment" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiShadowReview_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AiShadowSetting_unit_key" ON "AiShadowSetting"("unit");
CREATE INDEX IF NOT EXISTS "AiShadowSetting_enabled_idx" ON "AiShadowSetting"("enabled");
CREATE INDEX IF NOT EXISTS "AiShadowSetting_unit_idx" ON "AiShadowSetting"("unit");

CREATE UNIQUE INDEX IF NOT EXISTS "AiShadowRun_incomingMessageId_key" ON "AiShadowRun"("incomingMessageId");
CREATE INDEX IF NOT EXISTS "AiShadowRun_unit_idx" ON "AiShadowRun"("unit");
CREATE INDEX IF NOT EXISTS "AiShadowRun_instanceId_idx" ON "AiShadowRun"("instanceId");
CREATE INDEX IF NOT EXISTS "AiShadowRun_conversationId_idx" ON "AiShadowRun"("conversationId");
CREATE INDEX IF NOT EXISTS "AiShadowRun_status_idx" ON "AiShadowRun"("status");
CREATE INDEX IF NOT EXISTS "AiShadowRun_createdAt_idx" ON "AiShadowRun"("createdAt");

CREATE UNIQUE INDEX IF NOT EXISTS "AiShadowDraft_runId_modelKey_key" ON "AiShadowDraft"("runId", "modelKey");
CREATE INDEX IF NOT EXISTS "AiShadowDraft_runId_idx" ON "AiShadowDraft"("runId");
CREATE INDEX IF NOT EXISTS "AiShadowDraft_status_idx" ON "AiShadowDraft"("status");
CREATE INDEX IF NOT EXISTS "AiShadowDraft_provider_model_idx" ON "AiShadowDraft"("provider", "model");

CREATE INDEX IF NOT EXISTS "AiShadowReview_runId_idx" ON "AiShadowReview"("runId");
CREATE INDEX IF NOT EXISTS "AiShadowReview_reviewerId_idx" ON "AiShadowReview"("reviewerId");
CREATE INDEX IF NOT EXISTS "AiShadowReview_createdAt_idx" ON "AiShadowReview"("createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AiShadowDraft_runId_fkey'
  ) THEN
    ALTER TABLE "AiShadowDraft"
      ADD CONSTRAINT "AiShadowDraft_runId_fkey"
      FOREIGN KEY ("runId") REFERENCES "AiShadowRun"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AiShadowReview_runId_fkey'
  ) THEN
    ALTER TABLE "AiShadowReview"
      ADD CONSTRAINT "AiShadowReview_runId_fkey"
      FOREIGN KEY ("runId") REFERENCES "AiShadowRun"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

