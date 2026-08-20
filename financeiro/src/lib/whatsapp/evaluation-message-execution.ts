import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";

const STALE_PROCESSING_MS = 2 * 60 * 1000;

type EvaluationMessageExecutionParams = {
  automationId: string;
  action: string;
  appointmentId: string;
  startTime: Date;
};

type ClaimEvaluationMessageParams = EvaluationMessageExecutionParams & {
  contactPhone?: string | null;
  contactName?: string | null;
  triggerData: Record<string, unknown>;
};

function isUniqueConstraintError(error: unknown) {
  return Boolean(
    error
    && typeof error === "object"
    && "code" in error
    && error.code === "P2002",
  );
}

export function evaluationMessageExecutionKey(appointmentId: string, startTime: Date) {
  return `${appointmentId}:${startTime.toISOString()}`;
}

export function evaluationMessageExecutionLogId(params: EvaluationMessageExecutionParams) {
  return [
    "evaluation-message",
    params.action,
    params.automationId,
    evaluationMessageExecutionKey(params.appointmentId, params.startTime),
  ].join(":");
}

function protectedExecutionWhere(params: EvaluationMessageExecutionParams): Prisma.AutomationLogWhereInput {
  const executionKey = evaluationMessageExecutionKey(params.appointmentId, params.startTime);
  return {
    automationId: params.automationId,
    result: { in: ["processing", "success"] },
    OR: [
      { triggerData: { path: ["executionKey"], equals: executionKey } },
      {
        AND: [
          { triggerData: { path: ["appointmentId"], equals: params.appointmentId } },
          { triggerData: { path: ["startTime"], equals: params.startTime.toISOString() } },
        ],
      },
    ],
  };
}

export async function evaluationMessageWasProtected(params: EvaluationMessageExecutionParams) {
  const existing = await prisma.automationLog.findFirst({
    where: protectedExecutionWhere(params),
    select: { id: true },
  });
  return Boolean(existing);
}

export async function claimEvaluationMessageExecution(params: ClaimEvaluationMessageParams) {
  if (await evaluationMessageWasProtected(params)) {
    return { status: "already_sent" as const };
  }

  const id = evaluationMessageExecutionLogId(params);
  const triggerData = {
    ...params.triggerData,
    action: params.action,
    appointmentId: params.appointmentId,
    executionKey: evaluationMessageExecutionKey(params.appointmentId, params.startTime),
    startTime: params.startTime.toISOString(),
  };

  try {
    const log = await prisma.automationLog.create({
      data: {
        id,
        automationId: params.automationId,
        contactPhone: params.contactPhone || null,
        contactName: params.contactName || null,
        triggerData,
        result: "processing",
      },
      select: { id: true },
    });
    return { status: "claimed" as const, logId: log.id };
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
  }

  const retryableBefore = new Date(Date.now() - STALE_PROCESSING_MS);
  const retry = await prisma.automationLog.updateMany({
    where: {
      id,
      OR: [
        { result: "failed" },
        { result: "processing", executedAt: { lt: retryableBefore } },
      ],
    },
    data: {
      contactPhone: params.contactPhone || null,
      contactName: params.contactName || null,
      triggerData,
      result: "processing",
      error: null,
      executedAt: new Date(),
    },
  });
  if (retry.count === 0) return { status: "already_sent" as const };
  return { status: "claimed" as const, logId: id };
}

export async function markEvaluationMessageSuccess(logId: string, triggerData: Record<string, unknown>) {
  await prisma.automationLog.update({
    where: { id: logId },
    data: {
      result: "success",
      error: null,
      triggerData: triggerData as Prisma.InputJsonValue,
    },
  });
}

export async function markEvaluationMessageFailed(logId: string, error: unknown) {
  await prisma.automationLog.update({
    where: { id: logId },
    data: {
      result: "failed",
      error: error instanceof Error ? error.message.slice(0, 1000) : "Erro desconhecido",
    },
  }).catch(() => {});
}
