import { createHash, timingSafeEqual } from "node:crypto";
import { ALICE_AUTONOMY_CONFIG_KEY, ALICE_AUTONOMY_INSTANCE_ID } from "@/lib/ai-assistant/autonomy/policy";

export const ALICE_AUTONOMY_CRON_JOB = "alice-autonomous-sbc-every-10-seconds";
export const ALICE_AUTONOMY_WORKER_STATE_KEY = "alice_autonomous_sbc_worker_state_v1";
const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;

export function validAliceAutonomyCronAuthorization(value: string | null, secret = process.env.CRON_SECRET?.trim()) {
  if (!secret || secret.length < 32) return false;
  const digest = (input: string) => createHash("sha256").update(input).digest();
  return timingSafeEqual(digest(value || ""), digest(`Bearer ${secret}`));
}

export function aliceAutonomyDispatchCommand(secret: string) {
  return `SELECT net.http_post(
    url := 'https://clinicasgestao.com.br/api/crm/ai-assistant/autonomy/worker',
    headers := jsonb_build_object('Content-Type','application/json','Authorization',${literal(`Bearer ${secret}`)}),
    body := '{}'::jsonb, timeout_milliseconds := 10000)
  WHERE EXISTS (SELECT 1 FROM public."AppSetting" WHERE key=${literal(ALICE_AUTONOMY_CONFIG_KEY)}
    AND value::jsonb->>'enabled'='true' AND value::jsonb->>'instanceId'=${literal(ALICE_AUTONOMY_INSTANCE_ID)})
  AND EXISTS (SELECT 1 FROM public."AppSetting" WHERE key='ai_assistant_alice_v1' AND value::jsonb->>'enabled'='true')
  AND NOT EXISTS (SELECT 1 FROM public."AppSetting" WHERE key=${literal(ALICE_AUTONOMY_WORKER_STATE_KEY)}
    AND NULLIF(value::jsonb->>'blockedUntil','')::timestamptz>now())
  AND (EXISTS (SELECT 1 FROM public."AliceAutonomousTurn" WHERE "instanceId"=${literal(ALICE_AUTONOMY_INSTANCE_ID)}
      AND status='queued' AND "availableAt"<=now())
    OR EXISTS (SELECT 1 FROM public."AliceAutonomousTurn" WHERE "instanceId"=${literal(ALICE_AUTONOMY_INSTANCE_ID)}
      AND status IN ('processing','sending') AND "claimedAt"<now()-interval '2 minutes'))
  AND NOT EXISTS (SELECT 1 FROM public."AliceAutonomousTurn" WHERE "instanceId"=${literal(ALICE_AUTONOMY_INSTANCE_ID)}
    AND status IN ('processing','sending') AND "claimedAt">=now()-interval '2 minutes');`;
}
