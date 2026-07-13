ALTER TABLE "AiTrainingConversation"
  ADD COLUMN IF NOT EXISTS "replyDueAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "replyStatus" TEXT NOT NULL DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS "replyVersion" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "AiTrainingConversation_replyStatus_replyDueAt_idx"
  ON "AiTrainingConversation"("replyStatus", "replyDueAt");
