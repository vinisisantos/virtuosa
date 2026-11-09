CREATE TABLE IF NOT EXISTS "AliceAutoSchedule" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "replyMessageId" TEXT NOT NULL,
  "offerMessageId" TEXT NOT NULL,
  "appointmentId" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'sending',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AliceAutoSchedule_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AliceAutoSchedule_conversationId_replyMessageId_key" ON "AliceAutoSchedule"("conversationId", "replyMessageId");
CREATE UNIQUE INDEX IF NOT EXISTS "AliceAutoSchedule_appointmentId_key" ON "AliceAutoSchedule"("appointmentId");
CREATE INDEX IF NOT EXISTS "AliceAutoSchedule_conversationId_createdAt_idx" ON "AliceAutoSchedule"("conversationId", "createdAt");
ALTER TABLE "AliceAutoSchedule" ENABLE ROW LEVEL SECURITY;

-- A ativação explícita deve ocorrer somente após o novo deployment ficar pronto.
INSERT INTO "AppSetting" ("id", "key", "value", "createdAt", "updatedAt")
VALUES ('alice-auto-schedule-sbc-activation', 'alice_auto_schedule_sbc_v1', '{"enabled":false}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
