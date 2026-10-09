ALTER TABLE "Agendamento" ADD COLUMN IF NOT EXISTS "evaluationProcedure" TEXT;

CREATE TABLE IF NOT EXISTS "WhatsAppEvaluationGroupNotice" (
  "id" TEXT NOT NULL,
  "appointmentId" TEXT NOT NULL,
  "instanceId" TEXT NOT NULL,
  "groupJid" TEXT NOT NULL,
  "groupName" TEXT NOT NULL,
  "configActivatedAt" TIMESTAMP(3) NOT NULL,
  "clientName" TEXT NOT NULL,
  "clientPhone" TEXT NOT NULL,
  "evaluationProcedure" TEXT NOT NULL,
  "startTime" TIMESTAMP(3) NOT NULL,
  "appointmentCreatedAt" TIMESTAMP(3) NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'queued',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "claimToken" TEXT,
  "claimedAt" TIMESTAMP(3),
  "sendStartedAt" TIMESTAMP(3),
  "providerMessageId" TEXT,
  "submittedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WhatsAppEvaluationGroupNotice_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WhatsAppEvaluationGroupNotice_state_check"
    CHECK ("state" IN ('queued', 'processing', 'sending', 'submitted', 'uncertain', 'cancelled')),
  CONSTRAINT "WhatsAppEvaluationGroupNotice_attempts_check" CHECK ("attempts" >= 0),
  CONSTRAINT "WhatsAppEvaluationGroupNotice_destination_check"
    CHECK ("instanceId" = 'a6871ee7-8352-4b66-bfb2-b8dba9e4f8e3' AND "groupJid" ~ '^[0-9]+(-[0-9]+)?@g[.]us$')
);

-- O build repete este bootstrap. Depois da expansão por evento, não recriar
-- a unicidade legada: uma avaliação pode ter criação e confirmações auditadas.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = '"WhatsAppEvaluationGroupNotice"'::regclass
      AND attname = 'eventKey' AND NOT attisdropped
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS "WhatsAppEvaluationGroupNotice_appointmentId_key"
      ON "WhatsAppEvaluationGroupNotice"("appointmentId");
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "WhatsAppEvaluationGroupNotice_state_availableAt_idx"
  ON "WhatsAppEvaluationGroupNotice"("state", "availableAt");
CREATE INDEX IF NOT EXISTS "WhatsAppEvaluationGroupNotice_state_claimedAt_idx"
  ON "WhatsAppEvaluationGroupNotice"("state", "claimedAt");
CREATE INDEX IF NOT EXISTS "WhatsAppEvaluationGroupNotice_instanceId_createdAt_idx"
  ON "WhatsAppEvaluationGroupNotice"("instanceId", "createdAt");

-- Sem backfill ou acesso via Data API: só novas avaliações podem produzir avisos.
ALTER TABLE "WhatsAppEvaluationGroupNotice" ENABLE ROW LEVEL SECURITY;
