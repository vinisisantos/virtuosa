BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE "SalesPipeline"
  ADD COLUMN IF NOT EXISTS "commercialStatus" TEXT,
  ADD COLUMN IF NOT EXISTS "commercialReason" TEXT,
  ADD COLUMN IF NOT EXISTS "commercialNote" TEXT,
  ADD COLUMN IF NOT EXISTS "nextContactAt" TIMESTAMP(3);
ALTER TABLE "WhatsAppConversation" ADD COLUMN IF NOT EXISTS "commercialPaused" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "SalesPipeline_unit_commercialStatus_nextContactAt_idx"
  ON "SalesPipeline"("unit", "commercialStatus", "nextContactAt");
CREATE TABLE IF NOT EXISTS "PipelineCommercialHold" (
  "dealId" TEXT NOT NULL REFERENCES "SalesPipeline"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "conversationId" TEXT NOT NULL REFERENCES "WhatsAppConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  PRIMARY KEY ("dealId", "conversationId")
);
CREATE INDEX IF NOT EXISTS "PipelineCommercialHold_conversationId_idx" ON "PipelineCommercialHold"("conversationId");
COMMIT;
