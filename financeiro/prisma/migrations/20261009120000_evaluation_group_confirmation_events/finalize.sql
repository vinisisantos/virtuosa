-- Executar manualmente apenas após verificar o deploy compatível em produção
-- e o encerramento de requisições/workers da versão anterior. O worker antigo
-- não reconhece eventos e pode enviar uma confirmação com o texto de criação.
-- Não executar no build: a remoção do índice e a ativação são um único cutover.
-- Após este contrato, rollback para código pré-eventos NÃO é seguro. Desativar
-- confirmações na configuração e manter/republicar código compatível; não apagar
-- eventos nem restaurar appointmentId_key, pois a auditoria pode ter várias linhas.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15s';

SELECT pg_advisory_xact_lock(hashtext('whatsapp_evaluation_group_sbc_v1'));
LOCK TABLE "WhatsAppEvaluationGroupNotice" IN SHARE ROW EXCLUSIVE MODE;

DO $$
DECLARE
  current_config JSONB;
  cutoff TEXT;
BEGIN
  IF to_regclass('"WhatsAppEvaluationGroupNotice_appointmentId_eventKey_key"') IS NULL THEN
    RAISE EXCEPTION 'Expansão por eventos ausente; não é seguro ativar confirmações.';
  END IF;
  IF EXISTS (SELECT 1 FROM "WhatsAppEvaluationGroupNotice" WHERE "state" IN ('processing', 'sending')) THEN
    RAISE EXCEPTION 'Há avisos em processamento; aguarde a drenagem antes de ativar confirmações.';
  END IF;

  SELECT "value"::jsonb INTO current_config
  FROM "AppSetting"
  WHERE "key" = 'whatsapp_evaluation_group_sbc_v1'
  FOR UPDATE;

  IF current_config IS NULL
    OR jsonb_typeof(current_config) IS DISTINCT FROM 'object'
    OR current_config->'enabled' IS DISTINCT FROM 'true'::jsonb
    OR current_config->>'instanceId' IS DISTINCT FROM 'a6871ee7-8352-4b66-bfb2-b8dba9e4f8e3'
    OR current_config->>'groupJid' IS DISTINCT FROM '120363430057824721@g.us'
    OR COALESCE(current_config->>'groupName', '') NOT IN ('AVALIAÇOES SBC', 'AVALIAÇÕES SBC')
    OR jsonb_typeof(current_config->'activatedAt') IS DISTINCT FROM 'string'
    OR jsonb_typeof(current_config->'approvedBy') IS DISTINCT FROM 'string'
    OR length(btrim(COALESCE(current_config->>'approvedBy', ''))) NOT BETWEEN 1 AND 200
  THEN
    RAISE EXCEPTION 'Configuração ativa do grupo e remetente aprovados não foi confirmada.';
  END IF;

  -- Um cast inválido aborta a transação antes de qualquer alteração.
  IF NOT isfinite((current_config->>'activatedAt')::timestamptz)
    OR (current_config->>'activatedAt')::timestamptz > clock_timestamp()
  THEN
    RAISE EXCEPTION 'Corte de ativação original inválido.';
  END IF;

  IF current_config ? 'confirmationsActivatedAt'
    AND current_config->'confirmationsActivatedAt' IS DISTINCT FROM 'null'::jsonb
  THEN
    IF jsonb_typeof(current_config->'confirmationsActivatedAt') IS DISTINCT FROM 'string'
      OR NOT isfinite((current_config->>'confirmationsActivatedAt')::timestamptz)
      OR (current_config->>'confirmationsActivatedAt')::timestamptz > clock_timestamp()
    THEN
      RAISE EXCEPTION 'Corte de confirmações existente inválido.';
    END IF;
    cutoff := current_config->>'confirmationsActivatedAt';
  ELSE
    cutoff := to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  END IF;

  DROP INDEX IF EXISTS "WhatsAppEvaluationGroupNotice_appointmentId_key";

  UPDATE "AppSetting"
  SET "value" = jsonb_set(current_config, '{confirmationsActivatedAt}', to_jsonb(cutoff))::text
  WHERE "key" = 'whatsapp_evaluation_group_sbc_v1';
END $$;

COMMIT;
