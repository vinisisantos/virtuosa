ALTER TABLE "AiTrainingConversation"
  ADD COLUMN IF NOT EXISTS "runtimeVersion" TEXT NOT NULL DEFAULT 'current',
  ADD COLUMN IF NOT EXISTS "campaignId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'AiTrainingConversation_campaignId_fkey'
      AND conrelid = '"AiTrainingConversation"'::regclass
  ) THEN
    ALTER TABLE "AiTrainingConversation"
      ADD CONSTRAINT "AiTrainingConversation_campaignId_fkey"
      FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "AiTrainingConversation_runtimeVersion_unit_updatedAt_idx"
  ON "AiTrainingConversation"("runtimeVersion", "unit", "updatedAt");

CREATE INDEX IF NOT EXISTS "AiTrainingConversation_campaignId_idx"
  ON "AiTrainingConversation"("campaignId");
