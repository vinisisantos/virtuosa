import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import {
  DEFAULT_EVALUATION_DAY_REMINDER_TEMPLATE,
  EVALUATION_DAY_REMINDER_AUTOMATION_TRIGGER,
  EVALUATION_SCHEDULE_UNIT_CONFIGS,
  type EvaluationScheduleUnitConfig,
} from "@/lib/whatsapp/evaluation-schedule-confirmation-message";
import {
  EVALUATION_DAY_REMINDER_EARLIEST_HOUR,
  EVALUATION_DAY_REMINDER_HOURS_BEFORE,
} from "@/lib/whatsapp/evaluation-day-reminder-window";

type EvaluationDayReminderAutomationDatabase = Pick<Prisma.TransactionClient, "automation">;

export async function findEvaluationDayReminderAutomation(
  unit: string,
  database: EvaluationDayReminderAutomationDatabase = prisma,
) {
  return database.automation.findFirst({
    where: {
      triggerType: EVALUATION_DAY_REMINDER_AUTOMATION_TRIGGER,
      unit,
    },
    orderBy: { createdAt: "asc" },
  });
}

function dayReminderAutomationData(
  config: EvaluationScheduleUnitConfig,
  createdBy?: string | null,
) {
  return {
    name: `Lembrete da avaliação no dia — ${config.unit}`,
    description: `Envia um lembrete no dia da avaliação confirmada pela ${config.instanceDisplayName}.`,
    triggerType: EVALUATION_DAY_REMINDER_AUTOMATION_TRIGGER,
    triggerConfig: {
      topic: "AGENDA",
      units: [config.unit],
      instanceIds: [config.instanceId],
      hoursBefore: EVALUATION_DAY_REMINDER_HOURS_BEFORE,
      earliestHour: EVALUATION_DAY_REMINDER_EARLIEST_HOUR,
      automaticAction: true,
    },
    steps: [
      {
        type: "send_message",
        config: { message: DEFAULT_EVALUATION_DAY_REMINDER_TEMPLATE },
      },
    ],
    isActive: true,
    createdBy: createdBy || "Sistema",
    unit: config.unit,
  };
}

export async function ensureEvaluationDayReminderAutomations(
  createdBy?: string | null,
  database: EvaluationDayReminderAutomationDatabase = prisma,
) {
  const units = EVALUATION_SCHEDULE_UNIT_CONFIGS.map((config) => config.unit);
  const existing = await database.automation.findMany({
    where: {
      triggerType: EVALUATION_DAY_REMINDER_AUTOMATION_TRIGGER,
      unit: { in: units },
    },
  });
  const canonicalExisting = EVALUATION_SCHEDULE_UNIT_CONFIGS
    .map((config) => existing.find((automation) => automation.unit === config.unit))
    .filter((automation): automation is NonNullable<typeof automation> => Boolean(automation));
  const existingUnits = new Set(canonicalExisting.map((automation) => automation.unit));
  const created = await Promise.all(
    EVALUATION_SCHEDULE_UNIT_CONFIGS
      .filter((config) => !existingUnits.has(config.unit))
      .map((config) => database.automation.create({
        data: dayReminderAutomationData(config, createdBy),
      })),
  );
  return [...canonicalExisting, ...created];
}
