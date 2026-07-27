CREATE TABLE IF NOT EXISTS "AiTrainingCampaignCreative" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "unit" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "caption" TEXT,
  "externalAdId" TEXT,
  "externalCreativeId" TEXT,
  "imageUrl" TEXT,
  "imageFileName" TEXT,
  "imageMimeType" TEXT,
  "imageSizeBytes" INTEGER,
  "validUntil" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'draft',
  "extractedData" JSONB,
  "approvedSnapshot" JSONB,
  "analysisModel" TEXT,
  "analysisPromptVersion" TEXT NOT NULL DEFAULT 'campaign-creative-v1',
  "analysisError" TEXT,
  "analyzedAt" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "createdByName" TEXT,
  "approvedById" TEXT,
  "approvedByName" TEXT,
  "approvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiTrainingCampaignCreative_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "AiTrainingConversation"
  ADD COLUMN IF NOT EXISTS "campaignCreativeId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'AiTrainingCampaignCreative_campaignId_fkey'
  ) THEN
    ALTER TABLE "AiTrainingCampaignCreative"
      ADD CONSTRAINT "AiTrainingCampaignCreative_campaignId_fkey"
      FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'AiTrainingConversation_campaignCreativeId_fkey'
  ) THEN
    ALTER TABLE "AiTrainingConversation"
      ADD CONSTRAINT "AiTrainingConversation_campaignCreativeId_fkey"
      FOREIGN KEY ("campaignCreativeId") REFERENCES "AiTrainingCampaignCreative"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "AiTrainingCampaignCreative_campaignId_status_idx"
  ON "AiTrainingCampaignCreative"("campaignId", "status");
CREATE INDEX IF NOT EXISTS "AiTrainingCampaignCreative_unit_status_updatedAt_idx"
  ON "AiTrainingCampaignCreative"("unit", "status", "updatedAt");
CREATE INDEX IF NOT EXISTS "AiTrainingCampaignCreative_externalAdId_idx"
  ON "AiTrainingCampaignCreative"("externalAdId");
CREATE INDEX IF NOT EXISTS "AiTrainingConversation_campaignCreativeId_idx"
  ON "AiTrainingConversation"("campaignCreativeId");
