-- Expansão somente. O gate de cancelamentos permanece desligado durante o deploy.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15s';
DO $$
DECLARE definition TEXT;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO definition FROM pg_constraint
  WHERE conrelid = '"WhatsAppEvaluationGroupNotice"'::regclass
    AND conname = 'WhatsAppEvaluationGroupNotice_event_check';
  IF definition IS NULL OR position('''cancelled''' IN definition) = 0 THEN
    ALTER TABLE "WhatsAppEvaluationGroupNotice"
      DROP CONSTRAINT IF EXISTS "WhatsAppEvaluationGroupNotice_event_check";
    ALTER TABLE "WhatsAppEvaluationGroupNotice"
      ADD CONSTRAINT "WhatsAppEvaluationGroupNotice_event_check" CHECK (
        ("eventType" = 'scheduled' AND "eventKey" = 'scheduled')
        OR ("eventType" = 'confirmed' AND "eventKey" LIKE 'confirmed:%')
        OR ("eventType" = 'cancelled' AND "eventKey" LIKE 'cancelled:%')
      );
  END IF;
END $$;
COMMIT;
