-- Fila aditiva: nenhuma mensagem histórica é inserida ou reprocessada.
CREATE TABLE IF NOT EXISTS "WhatsAppInboundPostProcessJob" (
  "id" TEXT PRIMARY KEY,
  "instanceId" TEXT NOT NULL REFERENCES "WhatsAppInstance"("id") ON DELETE CASCADE,
  "conversationId" TEXT NOT NULL REFERENCES "WhatsAppConversation"("id") ON DELETE CASCADE,
  "messageId" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "claimToken" TEXT,
  "claimedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "WhatsAppInboundPostProcessJob_instanceId_messageId_key"
  ON "WhatsAppInboundPostProcessJob"("instanceId", "messageId");
CREATE INDEX IF NOT EXISTS "WhatsAppInboundPostProcessJob_status_availableAt_idx"
  ON "WhatsAppInboundPostProcessJob"("status", "availableAt");
CREATE INDEX IF NOT EXISTS "WhatsAppInboundPostProcessJob_instanceId_status_availableAt_idx"
  ON "WhatsAppInboundPostProcessJob"("instanceId", "status", "availableAt");
CREATE INDEX IF NOT EXISTS "WhatsAppInboundPostProcessJob_conversationId_idx"
  ON "WhatsAppInboundPostProcessJob"("conversationId");

ALTER TABLE "WhatsAppInboundPostProcessJob" ENABLE ROW LEVEL SECURITY;
