import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import {
  DEFAULT_EVALUATION_RESCHEDULED_TEMPLATE,
  EVALUATION_RESCHEDULED_AUTOMATION_TRIGGER,
  EVALUATION_SCHEDULE_UNIT_CONFIGS,
  getEvaluationScheduleUnitConfigByUnit,
  type EvaluationScheduleUnit,
  type EvaluationScheduleUnitConfig,
} from "@/lib/whatsapp/evaluation-schedule-confirmation-message";

type EvaluationRescheduleAutomationDatabase = Pick<Prisma.TransactionClient, "automation">;

export async function findEvaluationRescheduleAutomation(
  unit: EvaluationScheduleUnit,
  database: EvaluationRescheduleAutomationDatabase = prisma,
) {
  return database.automation.findFirst({
    where: {
      triggerType: EVALUATION_RESCHEDULED_AUTOMATION_TRIGGER,
      unit,
    },
    orderBy: { createdAt: "asc" },
  });
}

function rescheduleAutomationData(
  config: EvaluationScheduleUnitConfig,
  createdBy?: string | null,
) {
  return {
    name: `Confirmação de avaliação reagendada — ${config.unit}`,
    description: `Informa a nova data e o novo horário quando uma avaliação é reagendada na ${config.instanceDisplayName}.`,
    triggerType: EVALUATION_RESCHEDULED_AUTOMATION_TRIGGER,
    triggerConfig: {
      topic: "AGENDA",
      units: [config.unit],
      instanceIds: [config.instanceId],
      automaticAction: true,
    },
    steps: [
      {
        type: "send_message",
        config: { message: DEFAULT_EVALUATION_RESCHEDULED_TEMPLATE },
      },
    ],
    isActive: true,
    createdBy: createdBy || "Sistema",
    unit: config.unit,
  };
}

export async function ensureEvaluationRescheduleAutomation(
  unit: EvaluationScheduleUnit,
  createdBy?: string | null,
  database: EvaluationRescheduleAutomationDatabase = prisma,
) {
  const existing = await findEvaluationRescheduleAutomation(unit, database);
  if (existing) return existing;

  const config = getEvaluationScheduleUnitConfigByUnit(unit);
  if (!config) throw new Error(`Unidade sem automação de reagendamento: ${unit}`);

  return database.automation.create({
    data: rescheduleAutomationData(config, createdBy),
  });
}

export async function ensureEvaluationRescheduleAutomations(
  createdBy?: string | null,
  database: EvaluationRescheduleAutomationDatabase = prisma,
) {
  const units = EVALUATION_SCHEDULE_UNIT_CONFIGS.map((config) => config.unit);
  const existing = await database.automation.findMany({
    where: {
      triggerType: EVALUATION_RESCHEDULED_AUTOMATION_TRIGGER,
      unit: { in: units },
    },
  });
  const existingUnits = new Set(existing.map((automation) => automation.unit));
  const created = await Promise.all(
    EVALUATION_SCHEDULE_UNIT_CONFIGS
      .filter((config) => !existingUnits.has(config.unit))
      .map((config) => database.automation.create({
        data: rescheduleAutomationData(config, createdBy),
      })),
  );
  return [...existing, ...created];
}
