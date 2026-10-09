-- Expansão compatível com o código ainda em produção. Os defaults também
-- classificam inserts feitos pela versão antiga, sem criar eventos retroativos.
ALTER TABLE "WhatsAppEvaluationGroupNotice"
  ADD COLUMN IF NOT EXISTS "eventType" TEXT NOT NULL DEFAULT 'scheduled',
  ADD COLUMN IF NOT EXISTS "eventKey" TEXT NOT NULL DEFAULT 'scheduled';

CREATE UNIQUE INDEX IF NOT EXISTS "WhatsAppEvaluationGroupNotice_appointmentId_eventKey_key"
  ON "WhatsAppEvaluationGroupNotice"("appointmentId", "eventKey");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = '"WhatsAppEvaluationGroupNotice"'::regclass
      AND conname = 'WhatsAppEvaluationGroupNotice_event_check'
  ) THEN
    ALTER TABLE "WhatsAppEvaluationGroupNotice"
      ADD CONSTRAINT "WhatsAppEvaluationGroupNotice_event_check" CHECK (
        ("eventType" = 'scheduled' AND "eventKey" = 'scheduled')
        OR ("eventType" = 'confirmed' AND "eventKey" LIKE 'confirmed:%')
      );
  END IF;
END $$;

-- Manter appointmentId_key até finalizar o deploy e drenar workers antigos.
-- finalize.sql é operacional e NÃO deve entrar no build automático.
