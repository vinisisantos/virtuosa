-- Additive only. Run with an administrative connection before enabling the pilot.
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS "AiInboxObservation" (
  "conversationId" TEXT PRIMARY KEY REFERENCES "WhatsAppConversation"("id") ON DELETE CASCADE,
  "unit" TEXT NOT NULL DEFAULT 'SCS' CHECK ("unit" = 'SCS'),
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
CREATE INDEX IF NOT EXISTS "AiInboxObservation_due_idx" ON "AiInboxObservation" ("unit", "dueAt") WHERE "revision" > "processedRevision";

CREATE TABLE IF NOT EXISTS "AiInboxKnowledge" (
  "id" TEXT PRIMARY KEY,
  "unit" TEXT NOT NULL DEFAULT 'SCS' CHECK ("unit" = 'SCS'),
  "content" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending','approved','rejected','disabled')),
  "version" INTEGER NOT NULL DEFAULT 1,
  "sourceConversationId" TEXT REFERENCES "WhatsAppConversation"("id") ON DELETE SET NULL,
  "sourceMessageIds" JSONB NOT NULL DEFAULT '[]',
  "sourceFingerprint" TEXT NOT NULL UNIQUE,
  "relatedIds" JSONB NOT NULL DEFAULT '[]',
  "embedding" extensions.vector(512),
  "embeddingModel" TEXT,
  "reviewedBy" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "clinicalReviewedBy" TEXT,
  "expiresAt" TIMESTAMP(3),
  "history" JSONB NOT NULL DEFAULT '[]',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "AiInboxKnowledge_scope_idx" ON "AiInboxKnowledge" ("unit", "status", "updatedAt");

CREATE TABLE IF NOT EXISTS "AiInboxOperation" (
  "id" TEXT PRIMARY KEY,
  "unit" TEXT NOT NULL DEFAULT 'SCS' CHECK ("unit" = 'SCS'),
  "kind" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL UNIQUE,
  "userId" TEXT,
  "conversationId" TEXT REFERENCES "WhatsAppConversation"("id") ON DELETE CASCADE,
  "status" TEXT NOT NULL DEFAULT 'running',
  "snapshot" TEXT NOT NULL,
  "knowledgeVersions" JSONB NOT NULL DEFAULT '[]',
  "result" JSONB,
  "replyHash" TEXT,
  "reservedMicroUsd" INTEGER NOT NULL,
  "actualMicroUsd" INTEGER,
  "usage" JSONB,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS "AiInboxOperation_day_idx" ON "AiInboxOperation" ("unit", "createdAt", "kind");
CREATE INDEX IF NOT EXISTS "AiInboxOperation_reply_idx" ON "AiInboxOperation" ("conversationId", "replyHash") WHERE "replyHash" IS NOT NULL;

ALTER TABLE "AiInboxObservation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AiInboxKnowledge" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AiInboxOperation" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "AiInboxObservation", "AiInboxKnowledge", "AiInboxOperation" FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "AiInboxObservation", "AiInboxKnowledge", "AiInboxOperation" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON "AiInboxObservation", "AiInboxKnowledge", "AiInboxOperation" FROM authenticated;
  END IF;
END $$;
