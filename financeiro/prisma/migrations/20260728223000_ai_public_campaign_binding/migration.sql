ALTER TABLE "AiPublicTestLink"
  ADD COLUMN IF NOT EXISTS "campaignCreativeId" TEXT;

CREATE INDEX IF NOT EXISTS "AiPublicTestLink_campaignCreativeId_idx"
  ON "AiPublicTestLink"("campaignCreativeId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'AiPublicTestLink_campaignCreativeId_fkey'
  ) THEN
    ALTER TABLE "AiPublicTestLink"
      ADD CONSTRAINT "AiPublicTestLink_campaignCreativeId_fkey"
      FOREIGN KEY ("campaignCreativeId")
      REFERENCES "AiTrainingCampaignCreative"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;
