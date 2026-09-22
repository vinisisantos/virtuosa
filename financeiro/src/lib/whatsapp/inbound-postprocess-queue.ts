import { randomUUID } from "node:crypto";
import { Prisma, type WhatsAppInboundPostProcessJob } from "@prisma/client";
import { prisma } from "@/lib/db";

export const INBOUND_POSTPROCESS_CRON_JOB = "whatsapp-inbound-postprocess-every-5-seconds";
export const INBOUND_POSTPROCESS_EVENT = "internal.whatsapp-postprocess";
export const INBOUND_POSTPROCESS_MAX_ATTEMPTS = 4;
const STALE_CLAIM_MS = 2 * 60_000;

type Database = typeof prisma | Prisma.TransactionClient;

export type InboundPostProcessPayload = {
  message: Record<string, unknown>;
  webhook: {
    event: unknown;
    type: unknown;
    dataType: unknown;
  };
  conversationWasCreated: boolean;
  receivedAt: string;
};

function compactValue(value: unknown, key = "", depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (depth > 12) return undefined;
  if (typeof value === "string") {
    const normalizedKey = key.toLowerCase();
    if (
      normalizedKey.includes("base64") ||
      normalizedKey.includes("thumbnail") ||
      value.startsWith("data:")
    ) return undefined;
    return value.length > 24_000 ? value.slice(0, 24_000) : value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(value)) return undefined;
  if (value instanceof Uint8Array) return undefined;
  if (Array.isArray(value)) {
    return value.slice(0, 100).map((item) => compactValue(item, key, depth + 1));
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .map(([entryKey, entryValue]) => [entryKey, compactValue(entryValue, entryKey, depth + 1)] as const)
        .filter(([, entryValue]) => entryValue !== undefined),
    );
  }
  return undefined;
}

export function compactInboundPostProcessPayload(params: {
  message: Record<string, unknown>;
  webhook: Record<string, unknown>;
  conversationWasCreated: boolean;
  receivedAt: Date;
}): InboundPostProcessPayload {
  return {
    message: compactValue(params.message) as Record<string, unknown>,
    webhook: {
      event: params.webhook.event ?? params.webhook.EventType ?? params.webhook.action ?? null,
      type: params.webhook.type ?? null,
      dataType: (params.webhook.data as Record<string, unknown> | undefined)?.type ?? null,
    },
    conversationWasCreated: params.conversationWasCreated,
    receivedAt: params.receivedAt.toISOString(),
  };
}

export async function enqueueInboundPostProcessJob(
  params: {
    instanceId: string;
    conversationId: string;
    messageId: string;
    payload: InboundPostProcessPayload;
  },
  database: Database = prisma,
) {
  await database.whatsAppInboundPostProcessJob.upsert({
    where: {
      instanceId_messageId: {
        instanceId: params.instanceId,
        messageId: params.messageId,
      },
    },
    create: {
      id: randomUUID(),
      instanceId: params.instanceId,
      conversationId: params.conversationId,
      messageId: params.messageId,
      payload: params.payload as Prisma.InputJsonValue,
    },
    update: {},
  });
}

export async function recoverStaleInboundPostProcessJobs(database: typeof prisma = prisma) {
  const staleBefore = new Date(Date.now() - STALE_CLAIM_MS);
  const [retried, failed] = await database.$transaction([
    database.whatsAppInboundPostProcessJob.updateMany({
      where: {
        status: "processing",
        claimedAt: { lt: staleBefore },
        attempts: { lt: INBOUND_POSTPROCESS_MAX_ATTEMPTS },
      },
      data: {
        status: "pending",
        claimToken: null,
        claimedAt: null,
        availableAt: new Date(),
        lastError: "worker_interrompido_antes_da_conclusao",
      },
    }),
    database.whatsAppInboundPostProcessJob.updateMany({
      where: {
        status: "processing",
        claimedAt: { lt: staleBefore },
        attempts: { gte: INBOUND_POSTPROCESS_MAX_ATTEMPTS },
      },
      data: {
        status: "failed",
        claimToken: null,
        claimedAt: null,
        lastError: "worker_interrompido_no_limite_de_tentativas",
      },
    }),
  ]);
  return { retried: retried.count, failed: failed.count };
}

export async function claimInboundPostProcessJob(database: typeof prisma = prisma) {
  const token = randomUUID();
  const rows = await database.$queryRaw<WhatsAppInboundPostProcessJob[]>(Prisma.sql`
    WITH candidate AS (
      SELECT id
      FROM "WhatsAppInboundPostProcessJob"
      WHERE status = 'pending'
        AND "availableAt" <= NOW()
        AND attempts < ${INBOUND_POSTPROCESS_MAX_ATTEMPTS}
      ORDER BY "availableAt" ASC, "createdAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE "WhatsAppInboundPostProcessJob" job
    SET status = 'processing',
        attempts = attempts + 1,
        "claimToken" = ${token},
        "claimedAt" = NOW(),
        "updatedAt" = NOW()
    FROM candidate
    WHERE job.id = candidate.id
    RETURNING job.*
  `);
  return rows[0] ? { job: rows[0], token } : null;
}

export async function completeInboundPostProcessJob(
  id: string,
  token: string,
  database: typeof prisma = prisma,
) {
  return database.whatsAppInboundPostProcessJob.updateMany({
    where: { id, claimToken: token, status: "processing" },
    data: {
      status: "completed",
      completedAt: new Date(),
      claimToken: null,
      claimedAt: null,
      lastError: null,
      payload: Prisma.JsonNull,
    },
  });
}

export async function retryInboundPostProcessJob(
  job: WhatsAppInboundPostProcessJob,
  token: string,
  error: unknown,
  database: typeof prisma = prisma,
) {
  const terminal = job.attempts >= INBOUND_POSTPROCESS_MAX_ATTEMPTS;
  const retryDelayMs = Math.min(5 * 60_000, 15_000 * 2 ** Math.max(0, job.attempts - 1));
  return database.whatsAppInboundPostProcessJob.updateMany({
    where: { id: job.id, claimToken: token, status: "processing" },
    data: {
      status: terminal ? "failed" : "pending",
      availableAt: terminal ? job.availableAt : new Date(Date.now() + retryDelayMs),
      claimToken: null,
      claimedAt: null,
      lastError: error instanceof Error ? error.message.slice(0, 1000) : "Falha no pós-processamento",
    },
  });
}

const sqlLiteral = (value: string) => `'${value.replaceAll("'", "''")}'`;

export function inboundPostProcessDispatchCommand(secret: string) {
  return `SELECT net.http_post(
    url := 'https://clinicasgestao.com.br/api/whatsapp/webhook',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', ${sqlLiteral(`Bearer ${secret}`)}),
    body := jsonb_build_object('event', '${INBOUND_POSTPROCESS_EVENT}'), timeout_milliseconds := 55000)
  WHERE (
    EXISTS (SELECT 1 FROM public."WhatsAppInboundPostProcessJob" WHERE status = 'pending' AND "availableAt" <= now() AND attempts < ${INBOUND_POSTPROCESS_MAX_ATTEMPTS})
    OR EXISTS (SELECT 1 FROM public."WhatsAppInboundPostProcessJob" WHERE status = 'processing' AND "claimedAt" < now() - interval '2 minutes')
  )
  AND NOT EXISTS (
    SELECT 1 FROM public."WhatsAppInboundPostProcessJob"
    WHERE status = 'processing' AND "claimedAt" >= now() - interval '2 minutes'
  );`;
}
