import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import {
  AI_ASSISTANT_CONFIG_KEY,
  AI_ASSISTANT_MAX_DAILY_REQUESTS,
  AI_ASSISTANT_UNIT,
  AiAssistantError,
  aiAssistantActualCost,
  aiAssistantDayKey,
} from "@/lib/ai-assistant/policy";
import type { AiAssistantUsage } from "@/lib/ai-assistant/provider";

export async function reserveAiAssistantOperation(params: {
  conversationId?: string | null;
  kind: "suggestion" | "test";
  reservedMicroUsd: number;
  dailyLimit: number;
}) {
  return prisma.$transaction(async (tx) => {
    const day = aiAssistantDayKey();
    const budgetKey = `${AI_ASSISTANT_CONFIG_KEY}:budget:${day}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${budgetKey}))`;
    const setting = await tx.appSetting.findUnique({ where: { key: budgetKey }, select: { value: true } });
    let budget = { reserved: 0, requests: 0 };
    try {
      budget = setting ? JSON.parse(setting.value) : budget;
    } catch {}
    if (
      budget.requests >= AI_ASSISTANT_MAX_DAILY_REQUESTS
      || budget.reserved + params.reservedMicroUsd > params.dailyLimit
    ) {
      throw new AiAssistantError("O limite diário de sugestões foi atingido", 429);
    }
    budget.reserved += params.reservedMicroUsd;
    budget.requests += 1;
    await tx.appSetting.upsert({
      where: { key: budgetKey },
      create: { key: budgetKey, value: JSON.stringify(budget) },
      update: { value: JSON.stringify(budget) },
    });
    return tx.aiAssistantOperation.create({
      data: {
        id: randomUUID(),
        unit: AI_ASSISTANT_UNIT,
        kind: params.kind,
        conversationId: params.conversationId || null,
        reservedMicroUsd: params.reservedMicroUsd,
      },
      select: { id: true },
    });
  }, { timeout: 10_000 });
}
export async function finishAiAssistantOperation(
  id: string,
  usage: AiAssistantUsage,
  draft?: { id: string; version: number },
) {
  await prisma.aiAssistantOperation.updateMany({
    where: { id, status: "running" },
    data: {
      status: "completed",
      actualMicroUsd: aiAssistantActualCost(usage.input, usage.output),
      usage,
      completedAt: new Date(),
      ...(draft ? {
        draftId: draft.id,
        draftVersion: draft.version,
        draftOutcome: "pending",
      } : {}),
    },
  });
}

export async function failAiAssistantOperation(id: string) {
  await prisma.aiAssistantOperation.updateMany({
    where: { id, status: "running" },
    data: {
      status: "failed",
      error: "Não concluído; reserva diária preservada",
      completedAt: new Date(),
    },
  });
}
