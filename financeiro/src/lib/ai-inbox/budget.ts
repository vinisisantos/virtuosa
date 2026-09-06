import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { budgetAllows, CONFIG_KEY, dayKey, InboxAiError } from "./policy";

export type Operation = {
  id: string;
  status: string;
  snapshot: string;
  userId: string | null;
  conversationId: string | null;
  result: unknown;
  knowledgeVersions: unknown;
  createdAt: Date;
};
export type Usage = { input: number; output: number; embedding: number };
export const zeroUsage = (): Usage => ({ input: 0, output: 0, embedding: 0 });

export async function reserveOperation(params: {
  key: string;
  kind: string;
  amount: number;
  snapshot: string;
  userId?: string;
  conversationId?: string;
}) {
  return prisma.$transaction(
    async (tx) => {
      const key = `${CONFIG_KEY}:budget:${dayKey()}`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
      const existing = await tx.$queryRaw<
        Operation[]
      >`SELECT * FROM "AiInboxOperation" WHERE "idempotencyKey" = ${params.key}`;
      if (existing[0]) return { operation: existing[0], reused: true };
      const setting = await tx.appSetting.findUnique({
        where: { key },
        select: { value: true },
      });
      const budget = setting
        ? (JSON.parse(setting.value) as {
            reserved: number;
            suggestions: number;
            batches: number;
          })
        : { reserved: 0, suggestions: 0, batches: 0 };
      if (!budgetAllows(budget, params.amount, params.kind))
        throw new InboxAiError(
          "Limite diário da IA atingido. Continue pelo envio manual; a fila será preservada.",
          429,
        );
      budget.reserved += params.amount;
      if (params.kind === "suggestion") budget.suggestions++;
      if (params.kind === "observation") budget.batches++;
      await tx.appSetting.upsert({
        where: { key },
        create: { key, value: JSON.stringify(budget) },
        update: { value: JSON.stringify(budget) },
      });
      const id = randomUUID();
      const rows = await tx.$queryRaw<
        Operation[]
      >`INSERT INTO "AiInboxOperation" ("id", "kind", "idempotencyKey", "userId", "conversationId", "snapshot", "reservedMicroUsd")
      VALUES (${id}, ${params.kind}, ${params.key}, ${params.userId ?? null}, ${params.conversationId ?? null}, ${params.snapshot}, ${params.amount}) RETURNING *`;
      return { operation: rows[0], reused: false };
    },
    { timeout: 10000 },
  );
}

export async function finishOperation(
  id: string,
  result: unknown,
  usage: Usage,
  versions: unknown = [],
  replyHash: string | null = null,
) {
  // Keep conservative reservations for the whole day, including failed/time-out
  // operations. Reporting actual spend must never release uncertain capacity.
  const cost = Math.ceil(
    usage.input * 2 + usage.output * 12 + usage.embedding * 0.02,
  );
  await prisma.$executeRaw`UPDATE "AiInboxOperation" SET "status" = 'completed', "result" = ${JSON.stringify(result)}::jsonb,
    "usage" = ${JSON.stringify(usage)}::jsonb, "actualMicroUsd" = ${cost}, "knowledgeVersions" = ${JSON.stringify(versions)}::jsonb,
    "replyHash" = ${replyHash}, "completedAt" = NOW() WHERE "id" = ${id} AND "status" = 'running'`;
}

export async function failOperation(id: string) {
  await prisma.$executeRaw`UPDATE "AiInboxOperation" SET "status" = 'failed', "error" = 'Não concluído; reserva mantida', "completedAt" = NOW() WHERE "id" = ${id} AND "status" = 'running'`;
}

export async function loadOperation(id: string) {
  const rows = await prisma.$queryRaw<Operation[]>(
    Prisma.sql`SELECT * FROM "AiInboxOperation" WHERE "id" = ${id}`,
  );
  return rows[0];
}
