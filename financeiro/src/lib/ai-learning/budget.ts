import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import {
  AI_LEARNING_CONFIG_KEY,
  AI_LEARNING_UNIT,
  AiLearningError,
  aiLearningBudgetAllows,
  aiLearningDayKey,
} from "@/lib/ai-learning/policy";

export type AiLearningUsage = { input: number; output: number };
export const emptyAiLearningUsage = (): AiLearningUsage => ({ input: 0, output: 0 });

type OperationRow = {
  id: string;
  status: string;
  result: unknown;
};

export async function reserveAiLearningOperation(params: {
  idempotencyKey: string;
  snapshot: string;
  reservedMicroUsd: number;
  dailyLimit: number;
}) {
  return prisma.$transaction(async (tx) => {
    const budgetKey = `${AI_LEARNING_CONFIG_KEY}:budget:${aiLearningDayKey()}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${budgetKey}))`;
    const existing = await tx.$queryRaw<OperationRow[]>`
      SELECT id, status, result FROM "AiLearningOperation"
      WHERE "idempotencyKey" = ${params.idempotencyKey}`;
    if (existing[0]) return { operation: existing[0], reused: true };

    const setting = await tx.appSetting.findUnique({
      where: { key: budgetKey },
      select: { value: true },
    });
    let budget = { reserved: 0, batches: 0 };
    try {
      budget = setting ? JSON.parse(setting.value) : budget;
    } catch {}
    if (!aiLearningBudgetAllows(budget, params.reservedMicroUsd, params.dailyLimit)) {
      throw new AiLearningError("Limite diário do aprendizado atingido; a fila foi preservada", 429);
    }
    budget.reserved += params.reservedMicroUsd;
    budget.batches += 1;
    await tx.appSetting.upsert({
      where: { key: budgetKey },
      create: { key: budgetKey, value: JSON.stringify(budget) },
      update: { value: JSON.stringify(budget) },
    });
    const id = randomUUID();
    const rows = await tx.$queryRaw<OperationRow[]>`
      INSERT INTO "AiLearningOperation" (id, unit, kind, "idempotencyKey", snapshot, "reservedMicroUsd")
      VALUES (${id}, ${AI_LEARNING_UNIT}, 'observation', ${params.idempotencyKey}, ${params.snapshot}, ${params.reservedMicroUsd})
      RETURNING id, status, result`;
    return { operation: rows[0], reused: false };
  }, { timeout: 10_000 });
}

export async function finishAiLearningOperation(id: string, result: unknown, usage: AiLearningUsage) {
  const actualMicroUsd = Math.ceil(usage.input * 0.3 + usage.output * 1.2);
  await prisma.$executeRaw`UPDATE "AiLearningOperation"
    SET status = 'completed', result = ${JSON.stringify(result)}::jsonb,
      usage = ${JSON.stringify(usage)}::jsonb, "actualMicroUsd" = ${actualMicroUsd}, "completedAt" = NOW()
    WHERE id = ${id} AND status = 'running'`;
}

export async function failAiLearningOperation(id: string) {
  await prisma.$executeRaw`UPDATE "AiLearningOperation"
    SET status = 'failed', error = 'Não concluído; reserva diária mantida', "completedAt" = NOW()
    WHERE id = ${id} AND status = 'running'`;
}
