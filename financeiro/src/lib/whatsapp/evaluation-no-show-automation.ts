import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import {
  DEFAULT_EVALUATION_NO_SHOW_TEMPLATE,
  EVALUATION_NO_SHOW_AUTOMATION_TRIGGER,
  EVALUATION_SCHEDULE_UNIT_CONFIGS,
  getEvaluationScheduleUnitConfigByUnit,
  type EvaluationScheduleUnit,
  type EvaluationScheduleUnitConfig,
} from "@/lib/whatsapp/evaluation-schedule-confirmation-message";

type EvaluationNoShowAutomationDatabase = Pick<Prisma.TransactionClient, "automation">;

export async function findEvaluationNoShowAutomation(
  unit: EvaluationScheduleUnit,
  database: EvaluationNoShowAutomationDatabase = prisma,
) {
  return database.automation.findFirst({
    where: {
      triggerType: EVALUATION_NO_SHOW_AUTOMATION_TRIGGER,
      unit,
    },
    orderBy: { createdAt: "asc" },
  });
}

function noShowAutomationData(
  config: EvaluationScheduleUnitConfig,
  createdBy?: string | null,
) {
  return {
    name: `Mensagem após ausência — ${config.unit}`,
    description: `Envia uma mensagem de reagendamento quando a avaliação é marcada como Não compareceu na ${config.instanceDisplayName}.`,
    triggerType: EVALUATION_NO_SHOW_AUTOMATION_TRIGGER,
    triggerConfig: {
      topic: "AGENDA",
      units: [config.unit],
      instanceIds: [config.instanceId],
      automaticAction: true,
    },
    steps: [
      {
        type: "send_message",
        config: { message: DEFAULT_EVALUATION_NO_SHOW_TEMPLATE },
      },
    ],
    isActive: true,
    createdBy: createdBy || "Sistema",
    unit: config.unit,
  };
}

export async function ensureEvaluationNoShowAutomation(
  unit: EvaluationScheduleUnit,
  createdBy?: string | null,
  database: EvaluationNoShowAutomationDatabase = prisma,
) {
  const existing = await findEvaluationNoShowAutomation(unit, database);
  if (existing) return existing;

  const config = getEvaluationScheduleUnitConfigByUnit(unit);
  if (!config) throw new Error(`Unidade sem automação de ausência: ${unit}`);

  return database.automation.create({
    data: noShowAutomationData(config, createdBy),
  });
}

export async function ensureEvaluationNoShowAutomations(
  createdBy?: string | null,
  database: EvaluationNoShowAutomationDatabase = prisma,
) {
  const units = EVALUATION_SCHEDULE_UNIT_CONFIGS.map((config) => config.unit);
  const existing = await database.automation.findMany({
    where: {
      triggerType: EVALUATION_NO_SHOW_AUTOMATION_TRIGGER,
      unit: { in: units },
    },
  });
  const existingUnits = new Set(existing.map((automation) => automation.unit));
  const created = await Promise.all(
    EVALUATION_SCHEDULE_UNIT_CONFIGS
      .filter((config) => !existingUnits.has(config.unit))
      .map((config) => database.automation.create({
        data: noShowAutomationData(config, createdBy),
      })),
  );
  return [...existing, ...created];
}
