ALTER TABLE "AiShadowRun"
  ADD COLUMN IF NOT EXISTS "conversationPhase" TEXT NOT NULL DEFAULT 'pre_handoff';

CREATE INDEX IF NOT EXISTS "AiShadowRun_conversationPhase_idx"
  ON "AiShadowRun"("conversationPhase");

ALTER TABLE "AiShadowSetting"
  ALTER COLUMN "onlyAfterHours" SET DEFAULT false;

UPDATE "AiShadowSetting"
SET "onlyAfterHours" = false
WHERE "unit" = 'Osasco';
