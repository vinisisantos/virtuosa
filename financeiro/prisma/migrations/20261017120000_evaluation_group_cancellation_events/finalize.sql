-- Operacional: somente após deploy compatível Ready há pelo menos dois minutos,
-- requisições antigas drenadas e conferência do domínio de produção. Não rodar no build.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15s';
SELECT pg_advisory_xact_lock(hashtext('whatsapp_evaluation_group_sbc_v1'));
LOCK TABLE "WhatsAppEvaluationGroupNotice" IN SHARE ROW EXCLUSIVE MODE;
DO $$
DECLARE current_config JSONB; cutoff TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid = '"WhatsAppEvaluationGroupNotice"'::regclass
      AND conname = 'WhatsAppEvaluationGroupNotice_event_check'
      AND position('''cancelled''' IN pg_get_constraintdef(oid)) > 0)
    OR to_regclass('"WhatsAppEvaluationGroupNotice_appointmentId_eventKey_key"') IS NULL
    OR to_regclass('"WhatsAppEvaluationGroupNotice_appointmentId_key"') IS NOT NULL THEN
    RAISE EXCEPTION 'Expansão de cancelamentos ausente ou índice legado incompatível.';
  END IF;
  IF EXISTS (SELECT 1 FROM "WhatsAppEvaluationGroupNotice" WHERE state IN ('processing','sending')) THEN
    RAISE EXCEPTION 'Há avisos em processamento; aguarde a drenagem.';
  END IF;
  SELECT value::jsonb INTO current_config FROM "AppSetting"
  WHERE key = 'whatsapp_evaluation_group_sbc_v1' FOR UPDATE;
  IF current_config IS NULL OR jsonb_typeof(current_config) IS DISTINCT FROM 'object'
    OR current_config->'enabled' IS DISTINCT FROM 'true'::jsonb
    OR current_config->>'instanceId' IS DISTINCT FROM 'a6871ee7-8352-4b66-bfb2-b8dba9e4f8e3'
    OR current_config->>'groupJid' IS DISTINCT FROM '120363430057824721@g.us'
    OR COALESCE(current_config->>'groupName', '') NOT IN ('AVALIAÇOES SBC','AVALIAÇÕES SBC')
    OR jsonb_typeof(current_config->'approvedBy') IS DISTINCT FROM 'string'
    OR length(btrim(COALESCE(current_config->>'approvedBy', ''))) NOT BETWEEN 1 AND 200
    OR jsonb_typeof(current_config->'activatedAt') IS DISTINCT FROM 'string'
    OR NOT isfinite((current_config->>'activatedAt')::timestamptz)
    OR (current_config->>'activatedAt')::timestamptz > clock_timestamp() THEN
    RAISE EXCEPTION 'Configuração ativa do grupo aprovado não confirmada.';
  END IF;
  IF current_config ? 'cancellationsActivatedAt' AND current_config->'cancellationsActivatedAt' IS DISTINCT FROM 'null'::jsonb THEN
    IF jsonb_typeof(current_config->'cancellationsActivatedAt') IS DISTINCT FROM 'string'
      OR NOT isfinite((current_config->>'cancellationsActivatedAt')::timestamptz)
      OR (current_config->>'cancellationsActivatedAt')::timestamptz > clock_timestamp() THEN
      RAISE EXCEPTION 'Corte existente de cancelamentos inválido.';
    END IF;
    cutoff := current_config->>'cancellationsActivatedAt';
  ELSE
    cutoff := to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  END IF;
  UPDATE "AppSetting" SET value = jsonb_set(current_config, '{cancellationsActivatedAt}', to_jsonb(cutoff))::text
  WHERE key = 'whatsapp_evaluation_group_sbc_v1';
END $$;
COMMIT;
