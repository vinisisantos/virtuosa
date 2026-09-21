import { AI_LEARNING_CONFIG_KEY } from "@/lib/ai-learning/policy";

export const AI_LEARNING_CRON_JOB = "ai-learning-sbc-hourly";

export const cronSqlLiteral = (value: string) => `'${value.replaceAll("'", "''")}'`;

export function aiLearningDispatchCommand(secret: string) {
  return `SELECT net.http_post(
    url := 'https://clinicasgestao.com.br/api/cron/ai-learning-observe',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', ${cronSqlLiteral(`Bearer ${secret}`)}),
    body := '{}'::jsonb, timeout_milliseconds := 55000)
  WHERE EXISTS (
    SELECT 1 FROM public."AppSetting" s
    JOIN public."AiLearningObservation" q ON q.unit = 'SBC'
    WHERE s.key = ${cronSqlLiteral(AI_LEARNING_CONFIG_KEY)}
      AND s.value::jsonb->>'enabled' = 'true'
      AND q.revision > q."processedRevision"
      AND q."dueAt" <= now()
      AND (q."leaseUntil" IS NULL OR q."leaseUntil" < now())
  );`;
}
