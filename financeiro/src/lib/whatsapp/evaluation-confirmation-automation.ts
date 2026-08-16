import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import {
  EVALUATION_SCHEDULE_UNIT_CONFIGS,
  EVALUATION_CONFIRMATION_REQUEST_AUTOMATION_TRIGGER,
  getEvaluationScheduleUnitConfigByUnit,
  type EvaluationScheduleUnit,
  type EvaluationScheduleUnitConfig,
} from "@/lib/whatsapp/evaluation-schedule-confirmation-message";
import {
  DEFAULT_EVALUATION_CONFIRMATION_WINDOW_HOURS,
  normalizeEvaluationConfirmationWindowHours,
} from "@/lib/whatsapp/evaluation-confirmation-window";

type EvaluationConfirmationAutomationDatabase = Pick<Prisma.TransactionClient, "automation">;

export function getEvaluationConfirmationWindowHours(triggerConfig: unknown) {
  if (!triggerConfig || typeof triggerConfig !== "object" || Array.isArray(triggerConfig)) {
    return DEFAULT_EVALUATION_CONFIRMATION_WINDOW_HOURS;
  }

  return normalizeEvaluationConfirmationWindowHours(
    (triggerConfig as Record<string, unknown>).windowHours,
  );
}

export async function findEvaluationConfirmationRequestAutomation(
  unit: EvaluationScheduleUnit,
  database: EvaluationConfirmationAutomationDatabase = prisma,
) {
  return database.automation.findFirst({
    where: {
      triggerType: EVALUATION_CONFIRMATION_REQUEST_AUTOMATION_TRIGGER,
      unit,
    },
    orderBy: { createdAt: "asc" },
  });
}

function confirmationAutomationData(
  config: EvaluationScheduleUnitConfig,
  createdBy?: string | null,
) {
  return {
    name: `Confirmação de presença — ${config.unit}`,
    description: `Disponibiliza no Inbox a confirmação de presença antes da avaliação da ${config.clinicName}.`,
    triggerType: EVALUATION_CONFIRMATION_REQUEST_AUTOMATION_TRIGGER,
    triggerConfig: {
      topic: "AGENDA",
      units: [config.unit],
      instanceIds: [config.instanceId],
      windowHours: DEFAULT_EVALUATION_CONFIRMATION_WINDOW_HOURS,
      manualAction: true,
    },
    steps: [
      {
        type: "send_message",
        config: { message: config.confirmationRequestTemplate },
      },
    ],
    isActive: true,
    createdBy: createdBy || "Sistema",
    unit: config.unit,
  };
}

export async function ensureEvaluationConfirmationRequestAutomation(
  unit: EvaluationScheduleUnit,
  createdBy?: string | null,
  database: EvaluationConfirmationAutomationDatabase = prisma,
) {
  const existing = await findEvaluationConfirmationRequestAutomation(unit, database);
  if (existing) return existing;

  const config = getEvaluationScheduleUnitConfigByUnit(unit);
  if (!config) throw new Error(`Unidade sem automação de confirmação: ${unit}`);

  return database.automation.create({
    data: confirmationAutomationData(config, createdBy),
  });
}

export async function ensureEvaluationConfirmationRequestAutomations(
  createdBy?: string | null,
  database: EvaluationConfirmationAutomationDatabase = prisma,
) {
  const units = EVALUATION_SCHEDULE_UNIT_CONFIGS.map((config) => config.unit);
  const existing = await database.automation.findMany({
    where: {
      triggerType: EVALUATION_CONFIRMATION_REQUEST_AUTOMATION_TRIGGER,
      unit: { in: units },
    },
  });
  const existingUnits = new Set(existing.map((automation) => automation.unit));
  const created = await Promise.all(
    EVALUATION_SCHEDULE_UNIT_CONFIGS
      .filter((config) => !existingUnits.has(config.unit))
      .map((config) => database.automation.create({
        data: confirmationAutomationData(config, createdBy),
      })),
  );
  return [...existing, ...created];
}
