-- Fila nova; não percorre nem altera conversas, respostas ou leads históricos.
CREATE TABLE IF NOT EXISTS "WhatsAppWelcomeJob" (
  "id" TEXT PRIMARY KEY,
  "conversationId" TEXT NOT NULL REFERENCES "WhatsAppConversation"("id") ON DELETE CASCADE,
  "clientId" TEXT NOT NULL,
  "automationId" TEXT NOT NULL REFERENCES "Automation"("id") ON DELETE CASCADE,
  "instanceId" TEXT NOT NULL,
  "unit" TEXT NOT NULL,
  "contactPhone" TEXT NOT NULL,
  "inboundMessageId" TEXT NOT NULL,
  "dueAt" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "phase" INTEGER NOT NULL DEFAULT 0,
  "claimToken" TEXT,
  "claimedAt" TIMESTAMP(3),
  "campaignKey" TEXT,
  "configUpdatedAt" TIMESTAMP(3),
  "greeting" TEXT,
  "question" TEXT,
  "replyId" TEXT,
  "greetingMessageId" TEXT,
  "greetingSentAt" TIMESTAMP(3),
  "questionMessageId" TEXT,
  "questionSentAt" TIMESTAMP(3),
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "WhatsAppWelcomeJob_conversationId_key" ON "WhatsAppWelcomeJob"("conversationId");
CREATE INDEX IF NOT EXISTS "WhatsAppWelcomeJob_status_dueAt_idx" ON "WhatsAppWelcomeJob"("status", "dueAt");
ALTER TABLE "WhatsAppWelcomeJob" ENABLE ROW LEVEL SECURITY;
