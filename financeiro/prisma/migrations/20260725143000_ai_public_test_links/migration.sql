CREATE TABLE IF NOT EXISTS "AiPublicTestLink" (
    "id" TEXT NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "tokenHint" VARCHAR(12) NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Teste da IA Virtuosa',
    "unit" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "includeExperimentalCaderno" BOOLEAN NOT NULL DEFAULT true,
    "promptVersion" TEXT NOT NULL DEFAULT 'virt-ai-public-v1',
    "knowledgeVersion" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "maxSessions" INTEGER NOT NULL DEFAULT 100,
    "maxRepliesPerSession" INTEGER NOT NULL DEFAULT 20,
    "maxTotalReplies" INTEGER NOT NULL DEFAULT 200,
    "sessionCount" INTEGER NOT NULL DEFAULT 0,
    "replyCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdByName" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AiPublicTestLink_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AiPublicTestSession" (
    "id" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "secretHash" VARCHAR(64) NOT NULL,
    "ipHash" VARCHAR(64),
    "status" TEXT NOT NULL DEFAULT 'active',
    "replyStatus" TEXT NOT NULL DEFAULT 'idle',
    "replyCount" INTEGER NOT NULL DEFAULT 0,
    "lockUntil" TIMESTAMP(3),
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AiPublicTestSession_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AiPublicTestSession_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "AiPublicTestLink"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "AiPublicTestMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "clientMessageId" TEXT,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "model" TEXT,
    "guardrailFlags" JSONB,
    "feedbackRating" TEXT,
    "feedbackComment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AiPublicTestMessage_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AiPublicTestMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AiPublicTestSession"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "AiPublicTestLink_tokenHash_key" ON "AiPublicTestLink"("tokenHash");
CREATE INDEX IF NOT EXISTS "AiPublicTestLink_status_expiresAt_idx" ON "AiPublicTestLink"("status", "expiresAt");
CREATE INDEX IF NOT EXISTS "AiPublicTestLink_unit_createdAt_idx" ON "AiPublicTestLink"("unit", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "AiPublicTestSession_secretHash_key" ON "AiPublicTestSession"("secretHash");
CREATE INDEX IF NOT EXISTS "AiPublicTestSession_linkId_createdAt_idx" ON "AiPublicTestSession"("linkId", "createdAt");
CREATE INDEX IF NOT EXISTS "AiPublicTestSession_ipHash_createdAt_idx" ON "AiPublicTestSession"("ipHash", "createdAt");
CREATE INDEX IF NOT EXISTS "AiPublicTestSession_status_lastActiveAt_idx" ON "AiPublicTestSession"("status", "lastActiveAt");
CREATE UNIQUE INDEX IF NOT EXISTS "AiPublicTestMessage_sessionId_clientMessageId_key" ON "AiPublicTestMessage"("sessionId", "clientMessageId");
CREATE INDEX IF NOT EXISTS "AiPublicTestMessage_sessionId_createdAt_idx" ON "AiPublicTestMessage"("sessionId", "createdAt");
CREATE INDEX IF NOT EXISTS "AiPublicTestMessage_feedbackRating_createdAt_idx" ON "AiPublicTestMessage"("feedbackRating", "createdAt");
