ALTER TABLE "AiPublicTestSession"
ADD COLUMN IF NOT EXISTS "campaignCreativeId" TEXT;

CREATE INDEX IF NOT EXISTS "AiPublicTestSession_campaignCreativeId_idx"
ON "AiPublicTestSession"("campaignCreativeId");

DO $$
BEGIN
  ALTER TABLE "AiPublicTestSession"
  ADD CONSTRAINT "AiPublicTestSession_campaignCreativeId_fkey"
  FOREIGN KEY ("campaignCreativeId")
  REFERENCES "AiTrainingCampaignCreative"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
