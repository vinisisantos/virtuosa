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
  EVALUATION_CONFIRMATION_WINDOW_CONFIG_VERSION,
  LEGACY_EVALUATION_CONFIRMATION_WINDOW_HOURS,
  normalizeEvaluationConfirmationWindowHours,
} from "@/lib/whatsapp/evaluation-confirmation-window";

type EvaluationConfirmationAutomationDatabase = Pick<Prisma.TransactionClient, "automation">;

type EvaluationConfirmationAutomationRecord = {
  id: string;
  name: string;
  description: string | null;
  triggerConfig: Prisma.JsonValue;
  steps: Prisma.JsonValue;
};

function jsonObject(value: Prisma.JsonValue) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...value }
    : {};
}

function isLegacyConfirmationWindow(triggerConfig: Prisma.JsonValue) {
  const config = jsonObject(triggerConfig);
  return Number(config.windowHours) === LEGACY_EVALUATION_CONFIRMATION_WINDOW_HOURS
    && Number(config.windowConfigVersion || 0) < EVALUATION_CONFIRMATION_WINDOW_CONFIG_VERSION;
}

function upgradeLegacyConfirmationSteps(steps: Prisma.JsonValue) {
  if (!Array.isArray(steps)) return steps as Prisma.InputJsonValue;

  return steps.map((step) => {
    if (!step || typeof step !== "object" || Array.isArray(step)) return step;
    const config = step.config;
    if (!config || typeof config !== "object" || Array.isArray(config)) return step;
    const message = config.message;
    if (typeof message !== "string") return step;

    return {
      ...step,
      config: {
        ...config,
        message: message.replace(
          /Passando para confirmar a sua avaliação de amanhã na ([^,\n]+), às (\*?\{\{hora\}\}\*?)\./,
          "Passando para confirmar a sua avaliação na $1, no dia *{{data}}*, às $2.",
        ),
      },
    };
  }) as Prisma.InputJsonValue;
}

async function upgradeLegacyConfirmationAutomation<T extends EvaluationConfirmationAutomationRecord>(
  automation: T,
  database: EvaluationConfirmationAutomationDatabase,
): Promise<T> {
  const hasLegacyWindow = isLegacyConfirmationWindow(automation.triggerConfig);
  const hasLegacyCopy = /(?:24|48)\s*(?:h|horas)/i.test(
    `${automation.name} ${automation.description || ""}`,
  );
  if (!hasLegacyWindow && !hasLegacyCopy) return automation;

  const updated = await database.automation.update({
    where: { id: automation.id },
    data: {
      name: automation.name.replace(/(?:24|48)\s*h/gi, "72h"),
      description: automation.description?.replace(/(?:24|48)\s*horas/gi, "72 horas"),
      ...(hasLegacyWindow ? {
        triggerConfig: {
          ...jsonObject(automation.triggerConfig),
          windowHours: DEFAULT_EVALUATION_CONFIRMATION_WINDOW_HOURS,
          windowConfigVersion: EVALUATION_CONFIRMATION_WINDOW_CONFIG_VERSION,
        } as Prisma.InputJsonValue,
        steps: upgradeLegacyConfirmationSteps(automation.steps),
      } : {}),
    },
  });
  return updated as unknown as T;
}

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
  const automation = await database.automation.findFirst({
    where: {
      triggerType: EVALUATION_CONFIRMATION_REQUEST_AUTOMATION_TRIGGER,
      unit,
    },
    orderBy: { createdAt: "asc" },
  });

  if (!automation) return null;
  return upgradeLegacyConfirmationAutomation(automation, database);
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
      windowConfigVersion: EVALUATION_CONFIRMATION_WINDOW_CONFIG_VERSION,
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
  const upgradedExisting = await Promise.all(
    existing.map((automation) => upgradeLegacyConfirmationAutomation(automation, database)),
  );
  const existingUnits = new Set(upgradedExisting.map((automation) => automation.unit));
  const created = await Promise.all(
    EVALUATION_SCHEDULE_UNIT_CONFIGS
      .filter((config) => !existingUnits.has(config.unit))
      .map((config) => database.automation.create({
        data: confirmationAutomationData(config, createdBy),
      })),
  );
  return [...upgradedExisting, ...created];
}
