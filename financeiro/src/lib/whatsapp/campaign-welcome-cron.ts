import { WELCOME_SCHEDULER_KEY } from "@/lib/whatsapp/campaign-welcome-policy";

export const WELCOME_CRON_JOB = 'campaign-welcome-every-15-seconds';
export const cronSqlLiteral = (value: string) => `'${value.replaceAll("'", "''")}'`;

export function welcomeDispatchCommand(secret: string) {
  return `SELECT net.http_post(
    url := 'https://clinicasgestao.com.br/api/cron/campaign-welcome',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', ${cronSqlLiteral(`Bearer ${secret}`)}),
    body := '{}'::jsonb, timeout_milliseconds := 55000)
  WHERE EXISTS (SELECT 1 FROM public."AppSetting" WHERE key = ${cronSqlLiteral(WELCOME_SCHEDULER_KEY)} AND value::jsonb->>'readyAt' IS NULL
    AND (value::jsonb->>'installedAt')::timestamptz > now() - interval '15 minutes')
     OR EXISTS (SELECT 1 FROM public."WhatsAppWelcomeJob" WHERE status = 'pending' AND "dueAt" <= now())
     OR EXISTS (SELECT 1 FROM public."WhatsAppWelcomeJob" WHERE status IN ('processing','sending') AND "claimedAt" < now() - interval '2 minutes');`;
}
