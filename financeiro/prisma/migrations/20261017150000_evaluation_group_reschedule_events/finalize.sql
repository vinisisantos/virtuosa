-- Operacional: após versão compatível Ready por dois minutos e requisições antigas drenadas.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15s';
SELECT pg_advisory_xact_lock(hashtext('whatsapp_evaluation_group_sbc_v1'));
LOCK TABLE "WhatsAppEvaluationGroupNotice" IN SHARE ROW EXCLUSIVE MODE;
DO $$
DECLARE config JSONB; cutoff TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"WhatsAppEvaluationGroupNotice"'::regclass
    AND conname='WhatsAppEvaluationGroupNotice_event_check' AND position('''rescheduled''' IN pg_get_constraintdef(oid))>0)
    OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
      AND table_name='WhatsAppEvaluationGroupNotice' AND column_name='previousStartTime')
    OR to_regclass('"WhatsAppEvaluationGroupNotice_appointmentId_eventKey_key"') IS NULL
    OR to_regclass('"WhatsAppEvaluationGroupNotice_appointmentId_key"') IS NOT NULL THEN
    RAISE EXCEPTION 'Expansão de reagendamentos ausente ou índice incompatível.';
  END IF;
  IF EXISTS (SELECT 1 FROM "WhatsAppEvaluationGroupNotice" WHERE state IN ('processing','sending')) THEN
    RAISE EXCEPTION 'Há avisos em processamento; aguarde a drenagem.';
  END IF;
  SELECT value::jsonb INTO config FROM "AppSetting" WHERE key='whatsapp_evaluation_group_sbc_v1' FOR UPDATE;
  IF config IS NULL OR jsonb_typeof(config) IS DISTINCT FROM 'object'
    OR config->'enabled' IS DISTINCT FROM 'true'::jsonb
    OR config->>'instanceId' IS DISTINCT FROM 'a6871ee7-8352-4b66-bfb2-b8dba9e4f8e3'
    OR config->>'groupJid' IS DISTINCT FROM '120363430057824721@g.us'
    OR COALESCE(config->>'groupName','') NOT IN ('AVALIAÇOES SBC','AVALIAÇÕES SBC')
    OR jsonb_typeof(config->'approvedBy') IS DISTINCT FROM 'string'
    OR length(btrim(COALESCE(config->>'approvedBy',''))) NOT BETWEEN 1 AND 200
    OR jsonb_typeof(config->'activatedAt') IS DISTINCT FROM 'string'
    OR NOT isfinite((config->>'activatedAt')::timestamptz)
    OR (config->>'activatedAt')::timestamptz>clock_timestamp() THEN
    RAISE EXCEPTION 'Configuração ativa do grupo aprovado não confirmada.';
  END IF;
  IF config ? 'reschedulesActivatedAt' AND config->'reschedulesActivatedAt' IS DISTINCT FROM 'null'::jsonb THEN
    IF jsonb_typeof(config->'reschedulesActivatedAt') IS DISTINCT FROM 'string'
      OR NOT isfinite((config->>'reschedulesActivatedAt')::timestamptz)
      OR (config->>'reschedulesActivatedAt')::timestamptz>clock_timestamp() THEN
      RAISE EXCEPTION 'Corte de reagendamentos inválido.';
    END IF;
    cutoff:=config->>'reschedulesActivatedAt';
  ELSE
    cutoff:=to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  END IF;
  UPDATE "AppSetting" SET value=jsonb_set(config,'{reschedulesActivatedAt}',to_jsonb(cutoff))::text
  WHERE key='whatsapp_evaluation_group_sbc_v1';
END $$;
COMMIT;
