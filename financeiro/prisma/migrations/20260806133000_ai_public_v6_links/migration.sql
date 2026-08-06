ALTER TABLE "AiPublicTestLink"
  ADD COLUMN IF NOT EXISTS "runtimeVersion" TEXT NOT NULL DEFAULT 'current',
  ADD COLUMN IF NOT EXISTS "campaignId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'AiPublicTestLink_campaignId_fkey'
      AND conrelid = '"AiPublicTestLink"'::regclass
  ) THEN
    ALTER TABLE "AiPublicTestLink"
      ADD CONSTRAINT "AiPublicTestLink_campaignId_fkey"
      FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "AiPublicTestLink_runtimeVersion_unit_createdAt_idx"
  ON "AiPublicTestLink"("runtimeVersion", "unit", "createdAt");

CREATE INDEX IF NOT EXISTS "AiPublicTestLink_campaignId_idx"
  ON "AiPublicTestLink"("campaignId");
