ALTER TABLE "AiPublicTestMessage"
  ADD COLUMN IF NOT EXISTS "campaignPriceSource" TEXT,
  ADD COLUMN IF NOT EXISTS "campaignPriceAudit" JSONB;

UPDATE "AiPublicTestLink"
SET
  "promptVersion" = 'virt-ai-public-v3',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" = 'active'
  AND "promptVersion" IS DISTINCT FROM 'virt-ai-public-v3';
