-- Expansão de destino; não cria configuração, gates nem avisos retroativos.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15s';
DO $$
DECLARE definition TEXT;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO definition FROM pg_constraint
  WHERE conrelid = '"WhatsAppEvaluationGroupNotice"'::regclass
    AND conname = 'WhatsAppEvaluationGroupNotice_destination_check';
  IF definition IS NULL OR position('d1385a2c-e4e9-4822-8125-c693edf9ef3d' IN definition) = 0 THEN
    ALTER TABLE "WhatsAppEvaluationGroupNotice" DROP CONSTRAINT IF EXISTS "WhatsAppEvaluationGroupNotice_destination_check";
    ALTER TABLE "WhatsAppEvaluationGroupNotice" ADD CONSTRAINT "WhatsAppEvaluationGroupNotice_destination_check"
      CHECK ("instanceId" IN ('a6871ee7-8352-4b66-bfb2-b8dba9e4f8e3', 'd1385a2c-e4e9-4822-8125-c693edf9ef3d')
        AND "groupJid" ~ '^[0-9]+(-[0-9]+)?@g[.]us$');
  END IF;
END $$;
COMMIT;
