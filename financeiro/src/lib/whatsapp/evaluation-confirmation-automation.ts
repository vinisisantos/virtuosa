import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import {
  DEFAULT_EVALUATION_CONFIRMATION_REQUEST_TEMPLATE,
  EVALUATION_CONFIRMATION_REQUEST_AUTOMATION_TRIGGER,
  LEADS_OSASCO_INSTANCE_ID,
  LEADS_OSASCO_UNIT,
} from "@/lib/whatsapp/evaluation-schedule-confirmation-message";

type EvaluationConfirmationAutomationDatabase = Pick<Prisma.TransactionClient, "automation">;

export async function findEvaluationConfirmationRequestAutomation(
  database: EvaluationConfirmationAutomationDatabase = prisma,
) {
  return database.automation.findFirst({
    where: {
      triggerType: EVALUATION_CONFIRMATION_REQUEST_AUTOMATION_TRIGGER,
      unit: LEADS_OSASCO_UNIT,
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function ensureEvaluationConfirmationRequestAutomation(
  createdBy?: string | null,
  database: EvaluationConfirmationAutomationDatabase = prisma,
) {
  const existing = await findEvaluationConfirmationRequestAutomation(database);
  if (existing) return existing;

  return database.automation.create({
    data: {
      name: "Confirmação de presença — 48h",
      description: "Disponibiliza no Inbox a confirmação de presença durante as 48 horas anteriores à avaliação.",
      triggerType: EVALUATION_CONFIRMATION_REQUEST_AUTOMATION_TRIGGER,
      triggerConfig: {
        topic: "AGENDA",
        units: [LEADS_OSASCO_UNIT],
        instanceIds: [LEADS_OSASCO_INSTANCE_ID],
        windowHours: 48,
        manualAction: true,
      },
      steps: [
        {
          type: "send_message",
          config: { message: DEFAULT_EVALUATION_CONFIRMATION_REQUEST_TEMPLATE },
        },
      ],
      isActive: true,
      createdBy: createdBy || "Sistema",
      unit: LEADS_OSASCO_UNIT,
    },
  });
}
