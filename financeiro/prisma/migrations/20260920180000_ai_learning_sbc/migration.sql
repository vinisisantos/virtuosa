-- Piloto supervisionado, restrito a SBC. Não envia mensagens nem altera o atendimento.
CREATE TABLE IF NOT EXISTS "AiLearningObservation" (
  "conversationId" TEXT PRIMARY KEY REFERENCES "WhatsAppConversation"("id") ON DELETE CASCADE,
  "unit" TEXT NOT NULL DEFAULT 'SBC' CHECK ("unit" = 'SBC'),
  "revision" INTEGER NOT NULL DEFAULT 1,
  "processedRevision" INTEGER NOT NULL DEFAULT 0,
  "lastEventKey" TEXT NOT NULL,
  "leaseToken" TEXT,
  "leaseUntil" TIMESTAMP(3),
  "dueAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "error" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "AiLearningObservation_due_idx"
  ON "AiLearningObservation" ("unit", "dueAt")
  WHERE "revision" > "processedRevision";

CREATE TABLE IF NOT EXISTS "AiLearningCandidate" (
  "id" TEXT PRIMARY KEY,
  "unit" TEXT NOT NULL DEFAULT 'SBC' CHECK ("unit" = 'SBC'),
  "content" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending', 'approved', 'rejected')),
  "version" INTEGER NOT NULL DEFAULT 1,
  "sourceConversationId" TEXT REFERENCES "WhatsAppConversation"("id") ON DELETE SET NULL,
  "sourceMessageIds" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "sourceFingerprint" TEXT NOT NULL UNIQUE,
  "reviewedBy" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "history" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "AiLearningCandidate_scope_idx"
  ON "AiLearningCandidate" ("unit", "status", "updatedAt");

CREATE TABLE IF NOT EXISTS "AiLearningOperation" (
  "id" TEXT PRIMARY KEY,
  "unit" TEXT NOT NULL DEFAULT 'SBC' CHECK ("unit" = 'SBC'),
  "kind" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL UNIQUE,
  "status" TEXT NOT NULL DEFAULT 'running' CHECK ("status" IN ('running', 'completed', 'failed')),
  "snapshot" TEXT NOT NULL,
  "reservedMicroUsd" INTEGER NOT NULL,
  "actualMicroUsd" INTEGER,
  "usage" JSONB,
  "result" JSONB,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3)
);

CREATE INDEX IF NOT EXISTS "AiLearningOperation_day_idx"
  ON "AiLearningOperation" ("unit", "createdAt", "kind");

INSERT INTO "AppSetting" ("id", "key", "value", "createdAt", "updatedAt")
VALUES (
  gen_random_uuid()::text,
  'ai_learning_sbc_v1',
  jsonb_build_object(
    'enabled', true,
    'activatedAt', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'unit', 'SBC',
    'dailyBudgetMicroUsd', 500000
  )::text,
  now(),
  now()
)
ON CONFLICT ("key") DO NOTHING;

ALTER TABLE "AiLearningObservation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AiLearningCandidate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AiLearningOperation" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "AiLearningObservation", "AiLearningCandidate", "AiLearningOperation" FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "AiLearningObservation", "AiLearningCandidate", "AiLearningOperation" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON "AiLearningObservation", "AiLearningCandidate", "AiLearningOperation" FROM authenticated;
  END IF;
END $$;
