import { randomUUID } from "node:crypto";
import { Prisma, type WhatsAppStatusReceipt } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  normalizeWhatsAppMessageStatus,
  type WhatsAppMessageStatus,
} from "@/lib/whatsapp/message-status";

export const STATUS_RECEIPT_MAX_ATTEMPTS = 6;
export const STATUS_RECEIPT_STALE_CLAIM_MS = 2 * 60_000;
export const STATUS_RECEIPT_RECOVERY_BATCH_SIZE = 20;

type Database = typeof prisma | Prisma.TransactionClient;
export type StatusReceiptClaim = { receipt: WhatsAppStatusReceipt; token: string };

export type StatusReceiptInput = {
  messageId: string;
  remoteJid: string;
  status: WhatsAppMessageStatus;
};

export async function retainStatusReceipts(
  params: { instanceId: string; receipts: StatusReceiptInput[]; receivedAt: Date },
  database: Database = prisma,
): Promise<StatusReceiptClaim[]> {
  if (!params.receipts.length) return [];
  if (!params.instanceId.trim() || !Number.isFinite(params.receivedAt.getTime())) {
    throw new Error("Identificação ou horário do recibo inválido.");
  }
  const now = new Date();
  const data = params.receipts.map((receipt) => {
    const receiptStatus = normalizeWhatsAppMessageStatus(receipt.status);
    const messageId = receipt.messageId.trim();
    const remoteJid = receipt.remoteJid.trim();
    if (!messageId || !remoteJid || !receiptStatus) {
      throw new Error("Recibo de status inválido.");
    }
    return {
      id: randomUUID(),
      instanceId: params.instanceId,
      messageId,
      remoteJid,
      receiptStatus,
      state: "processing",
      attempts: 1,
      availableAt: now,
      claimToken: `inline:${randomUUID()}`,
      claimedAt: now,
      receivedAt: params.receivedAt,
    };
  });
  // O INSERT durável precede o HTTP 200. Replays não reiniciam claims ou tentativas.
  const receipts = await database.whatsAppStatusReceipt.createManyAndReturn({
    data,
    skipDuplicates: true,
  });
  return receipts.map((receipt) => ({ receipt, token: receipt.claimToken! }));
}

export async function claimStatusReceipt(database: Database = prisma): Promise<StatusReceiptClaim | null> {
  const token = `worker:${randomUUID()}`;
  const receipts = await database.$queryRaw<WhatsAppStatusReceipt[]>(Prisma.sql`
    WITH candidate AS (
      SELECT id
      FROM "WhatsAppStatusReceipt"
      WHERE state = 'pending'
        AND "availableAt" <= NOW()
        AND attempts < ${STATUS_RECEIPT_MAX_ATTEMPTS}
      ORDER BY "availableAt" ASC, "receivedAt" ASC, id ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE "WhatsAppStatusReceipt" receipt
    SET state = 'processing',
        attempts = attempts + 1,
        "claimToken" = ${token},
        "claimedAt" = NOW(),
        "updatedAt" = NOW()
    FROM candidate
    WHERE receipt.id = candidate.id
    RETURNING receipt.*
  `);
  return receipts[0] ? { receipt: receipts[0], token } : null;
}

export async function recoverStaleStatusReceipts(database: Database = prisma) {
  const staleBefore = new Date(Date.now() - STATUS_RECEIPT_STALE_CLAIM_MS);
  const recovered = await database.$queryRaw<Array<{ state: string }>>(Prisma.sql`
    WITH stale AS (
      SELECT id
      FROM "WhatsAppStatusReceipt"
      WHERE state = 'processing' AND "claimedAt" < ${staleBefore}
      ORDER BY "claimedAt" ASC, id ASC
      FOR UPDATE SKIP LOCKED
      LIMIT ${STATUS_RECEIPT_RECOVERY_BATCH_SIZE}
    )
    UPDATE "WhatsAppStatusReceipt" receipt
    SET state = CASE WHEN attempts >= ${STATUS_RECEIPT_MAX_ATTEMPTS} THEN 'failed' ELSE 'pending' END,
        "availableAt" = NOW(),
        "claimToken" = NULL,
        "claimedAt" = NULL,
        "completedAt" = CASE WHEN attempts >= ${STATUS_RECEIPT_MAX_ATTEMPTS} THEN NOW() ELSE NULL END,
        "lastError" = 'status_worker_interrompido',
        "updatedAt" = NOW()
    FROM stale
    WHERE receipt.id = stale.id
    RETURNING receipt.state
  `);
  return {
    retried: recovered.filter((receipt) => receipt.state === "pending").length,
    failed: recovered.filter((receipt) => receipt.state === "failed").length,
  };
}

export async function completeStatusReceipt(
  id: string,
  token: string,
  result: { outcome: "completed" | "ambiguous"; error?: string },
  database: Database = prisma,
) {
  return database.whatsAppStatusReceipt.updateMany({
    where: { id, claimToken: token, state: "processing" },
    data: {
      state: result.outcome,
      completedAt: new Date(),
      claimToken: null,
      claimedAt: null,
      lastError: result.error?.slice(0, 1000) || null,
    },
  });
}

export async function deferStatusReceiptClaims(
  claims: StatusReceiptClaim[],
  reason: string,
  database: Database = prisma,
) {
  if (!claims.length) return { count: 0 };
  // Um lote sem orçamento é liberado junto; claims já concluídos ou retomados
  // por outro worker não podem voltar para a fila com o token antigo.
  return database.whatsAppStatusReceipt.updateMany({
    where: {
      state: "processing",
      OR: claims.map(({ receipt, token }) => ({ id: receipt.id, claimToken: token })),
    },
    data: {
      state: "pending",
      availableAt: new Date(),
      claimToken: null,
      claimedAt: null,
      lastError: reason.slice(0, 1000),
    },
  });
}

export async function retryStatusReceipt(
  receipt: WhatsAppStatusReceipt,
  token: string,
  reason: string,
  database: Database = prisma,
) {
  const terminal = receipt.attempts >= STATUS_RECEIPT_MAX_ATTEMPTS;
  const now = new Date();
  const delayMs = Math.min(5 * 60_000, 15_000 * 2 ** Math.max(0, receipt.attempts - 1));
  return database.whatsAppStatusReceipt.updateMany({
    where: { id: receipt.id, claimToken: token, state: "processing" },
    data: {
      state: terminal ? "failed" : "pending",
      availableAt: terminal ? receipt.availableAt : new Date(now.getTime() + delayMs),
      completedAt: terminal ? now : null,
      claimToken: null,
      claimedAt: null,
      lastError: reason.slice(0, 1000),
    },
  });
}
