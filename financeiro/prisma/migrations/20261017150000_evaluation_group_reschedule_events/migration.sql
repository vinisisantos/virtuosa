-- Expansão compatível; a ativação de reagendamentos fica fora do build.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15s';
ALTER TABLE "WhatsAppEvaluationGroupNotice" ADD COLUMN IF NOT EXISTS "previousStartTime" TIMESTAMP(3);
DO $$
DECLARE definition TEXT;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO definition FROM pg_constraint
  WHERE conrelid = '"WhatsAppEvaluationGroupNotice"'::regclass AND conname = 'WhatsAppEvaluationGroupNotice_event_check';
  IF definition IS NULL OR position('''rescheduled''' IN definition) = 0 THEN
    ALTER TABLE "WhatsAppEvaluationGroupNotice" DROP CONSTRAINT IF EXISTS "WhatsAppEvaluationGroupNotice_event_check";
    ALTER TABLE "WhatsAppEvaluationGroupNotice" ADD CONSTRAINT "WhatsAppEvaluationGroupNotice_event_check" CHECK (
      ("eventType" = 'scheduled' AND "eventKey" = 'scheduled')
      OR ("eventType" = 'confirmed' AND "eventKey" LIKE 'confirmed:%')
      OR ("eventType" = 'cancelled' AND "eventKey" LIKE 'cancelled:%')
      OR ("eventType" = 'rescheduled' AND "eventKey" LIKE 'rescheduled:%'
        AND "previousStartTime" IS NOT NULL AND "previousStartTime" <> "startTime")
    );
  END IF;
END $$;
COMMIT;
