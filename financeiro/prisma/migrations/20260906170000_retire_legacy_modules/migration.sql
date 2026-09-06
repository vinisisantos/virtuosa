-- Executar somente após publicar e validar a versão sem os módulos retirados.
-- O histórico operacional permanece: nenhuma tabela de clientes, mensagens,
-- campanhas, agenda ou financeiro é alvo desta migração.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

DO $$
BEGIN
  IF to_regclass('cron.job') IS NOT NULL THEN
    IF to_regclass('cron.job_run_details') IS NOT NULL THEN
      DELETE FROM cron.job_run_details
      WHERE jobid IN (
        SELECT jobid FROM cron.job
        WHERE jobname = 'ai-inbox-scs-observer-every-15-minutes'
      );
    END IF;
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'ai-inbox-scs-observer-every-15-minutes';
  END IF;
END $$;

-- Uma única lista permite resolver apenas as dependências entre os próprios
-- alvos. Sem CASCADE: qualquer dependência externa inesperada aborta a limpeza.
DROP TABLE IF EXISTS
  public."AiInboxKnowledge",
  public."AiInboxObservation",
  public."AiInboxOperation",
  public."AiKnowledgeProcedure",
  public."AiKnowledgeSuggestion",
  public."AiPublicTestLink",
  public."AiPublicTestMessage",
  public."AiPublicTestSession",
  public."AiShadowBatchJob",
  public."AiShadowDraft",
  public."AiShadowReview",
  public."AiShadowRun",
  public."AiShadowSetting",
  public."AiTrainingCampaignCreative",
  public."AiTrainingConversation",
  public."AiTrainingMemory",
  public."AiTrainingMessage",
  public."AiUnitKnowledge",
  public."CrmConversationInsight",
  public."CrmSilentAnalysisSetting",
  public."InsumoUpload",
  public."WhatsAppMessageTranscript"
RESTRICT;

DELETE FROM public."AppSetting"
WHERE key = 'ai_inbox_scs_v1'
   OR starts_with(key, 'ai_inbox_scs_v1:budget:');

UPDATE public."User"
SET permissions = permissions - 'crmSilentAnalysis'
WHERE jsonb_typeof(permissions) = 'object'
  AND permissions ? 'crmSilentAnalysis';

DO $$
BEGIN
  DROP EXTENSION IF EXISTS vector RESTRICT;
EXCEPTION WHEN dependent_objects_still_exist THEN
  RAISE NOTICE 'Extensão compartilhada preservada: existem outras dependências.';
END $$;
COMMIT;
