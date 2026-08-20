import { prisma } from "@/lib/db";
import { saoPauloDayRange } from "@/lib/date-filter";
import { findConversationByPhone } from "@/lib/whatsapp/conversation-starter";
import { ensureEvaluationDayReminderAutomations } from "@/lib/whatsapp/evaluation-day-reminder-automation";
import { evaluationDayReminderWindow } from "@/lib/whatsapp/evaluation-day-reminder-window";
import {
  claimEvaluationMessageExecution,
  evaluationMessageExecutionKey,
  markEvaluationMessageFailed,
} from "@/lib/whatsapp/evaluation-message-execution";
import {
  DEFAULT_EVALUATION_DAY_REMINDER_TEMPLATE,
  EVALUATION_DAY_REMINDER_AUTOMATION_TRIGGER,
  EVALUATION_SCHEDULE_UNIT_CONFIGS,
  buildEvaluationDayReminderMessage,
  getEvaluationScheduleAutomationMessage,
  getEvaluationScheduleUnitConfigByUnit,
} from "@/lib/whatsapp/evaluation-schedule-confirmation-message";
import { sendAutomationText } from "@/lib/whatsapp/automation-sender";

const REMINDER_BATCH_SIZE = 3;
const SAO_PAULO_TIME_ZONE = "America/Sao_Paulo";

type ReminderAutomation = Awaited<ReturnType<typeof ensureEvaluationDayReminderAutomations>>[number];

export type EvaluationDayReminderAppointment = {
  id: string;
  clientName: string;
  clientPhone: string | null;
  unit: string;
  startTime: Date;
};

export type EvaluationDayReminderInstance = {
  id: string;
  name: string;
  provider: string;
  status: string;
};

export type EvaluationDayReminderConversation = {
  id: string;
  instanceId: string;
  lastKnownJid: string | null;
  contact: { phone: string };
};

export type EvaluationDayReminderProcessingResult = {
  checked: number;
  due: number;
  sent: number;
  failed: number;
  skipped: number;
};

function saoPauloHour(date: Date) {
  const hour = new Intl.DateTimeFormat("en-US", {
    timeZone: SAO_PAULO_TIME_ZONE,
    hour: "2-digit",
    hourCycle: "h23",
  }).format(date);
  return Number(hour);
}

function executionKeyFromTriggerData(triggerData: unknown) {
  if (!triggerData || typeof triggerData !== "object" || Array.isArray(triggerData)) return null;
  const executionKey = (triggerData as Record<string, unknown>).executionKey;
  return typeof executionKey === "string" ? executionKey : null;
}

export async function sendEvaluationDayReminder(params: {
  automation: ReminderAutomation;
  appointment: EvaluationDayReminderAppointment;
  instance: EvaluationDayReminderInstance;
  conversation?: EvaluationDayReminderConversation | null;
  source: "automatic" | "manual";
  respondedByName?: string;
}) {
  const { automation, appointment } = params;
  const unitConfig = getEvaluationScheduleUnitConfigByUnit(appointment.unit);
  if (!unitConfig) return "failed" as const;

  try {
    if (!appointment.clientPhone) {
      throw new Error("A avaliação confirmada não possui telefone para o lembrete.");
    }
    const instance = params.instance;
    if (instance.id !== unitConfig.instanceId || instance.status !== "connected") {
      throw new Error(`A instância ${unitConfig.instanceDisplayName} não está conectada.`);
    }

    const conversation = params.conversation || await findConversationByPhone({
      phone: appointment.clientPhone,
      instanceIds: [instance.id],
    });
    if (!conversation || conversation.instanceId !== instance.id) {
      throw new Error(`Conversa não encontrada na ${unitConfig.instanceDisplayName}.`);
    }

    const template = getEvaluationScheduleAutomationMessage(automation.steps)
      || DEFAULT_EVALUATION_DAY_REMINDER_TEMPLATE;
    const message = buildEvaluationDayReminderMessage({
      unit: unitConfig.unit,
      clientName: appointment.clientName,
      startTime: appointment.startTime,
      template,
    });

    const executionKey = evaluationMessageExecutionKey(appointment.id, appointment.startTime);
    const triggerData = {
      topic: "AGENDA",
      action: EVALUATION_DAY_REMINDER_AUTOMATION_TRIGGER,
      appointmentId: appointment.id,
      executionKey,
      conversationId: conversation.id,
      instanceId: instance.id,
      unit: unitConfig.unit,
      startTime: appointment.startTime.toISOString(),
      source: params.source,
    };
    const claim = await claimEvaluationMessageExecution({
      automationId: automation.id,
      action: EVALUATION_DAY_REMINDER_AUTOMATION_TRIGGER,
      appointmentId: appointment.id,
      startTime: appointment.startTime,
      contactPhone: conversation.contact.phone,
      contactName: appointment.clientName,
      triggerData,
    });
    if (claim.status === "already_sent") return "already_sent" as const;

    try {
      await sendAutomationText({
        dbInstance: instance,
        conversationId: conversation.id,
        contactPhone: conversation.contact.phone,
        lastKnownJid: conversation.lastKnownJid,
        message,
        respondedByName: params.respondedByName || "Automação de agenda",
      });
    } catch (error) {
      await markEvaluationMessageFailed(claim.logId, error);
      throw error;
    }

    try {
      await prisma.$transaction([
        prisma.automation.update({
          where: { id: automation.id },
          data: {
            executionCount: { increment: 1 },
            lastExecutedAt: new Date(),
          },
        }),
        prisma.automationLog.update({
          where: { id: claim.logId },
          data: {
            result: "success",
            error: null,
            triggerData,
          },
        }),
      ]);
    } catch (logError) {
      console.error("[Evaluation Day Reminder] Lembrete enviado sem atualizar o histórico:", logError);
    }
    return "sent" as const;
  } catch (error) {
    console.error("[Evaluation Day Reminder] Falha ao enviar lembrete:", error);
    return "failed" as const;
  }
}

export async function processEvaluationDayReminders(
  now = new Date(),
): Promise<EvaluationDayReminderProcessingResult> {
  const result: EvaluationDayReminderProcessingResult = {
    checked: 0,
    due: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
  };
  const currentHour = saoPauloHour(now);
  if (currentHour < 8 || currentHour >= 21) return result;

  const automations = await ensureEvaluationDayReminderAutomations();
  const activeAutomationByUnit = new Map(
    automations
      .filter((automation) => automation.isActive && automation.unit)
      .map((automation) => [automation.unit as string, automation]),
  );
  if (activeAutomationByUnit.size === 0) return result;

  const { start, end } = saoPauloDayRange(now);
  const appointments = await prisma.agendamento.findMany({
    where: {
      unit: { in: EVALUATION_SCHEDULE_UNIT_CONFIGS.map((config) => config.unit) },
      procedimento: { contains: "avalia", mode: "insensitive" },
      status: { equals: "confirmado", mode: "insensitive" },
      startTime: { gte: start, lt: end },
    },
    select: {
      id: true,
      clientName: true,
      clientPhone: true,
      unit: true,
      startTime: true,
    },
    orderBy: { startTime: "asc" },
    take: 100,
  });
  result.checked = appointments.length;

  const eligible = appointments.filter((appointment) => (
    activeAutomationByUnit.has(appointment.unit)
    && evaluationDayReminderWindow({ startTime: appointment.startTime, now }).state === "available"
  ));
  if (eligible.length === 0) return result;

  const protectedLogs = await prisma.automationLog.findMany({
    where: {
      automationId: { in: [...activeAutomationByUnit.values()].map((automation) => automation.id) },
      result: { in: ["processing", "success"] },
      executedAt: { gte: start },
    },
    select: { triggerData: true },
  });
  const protectedExecutionKeys = new Set(
    protectedLogs
      .map((log) => executionKeyFromTriggerData(log.triggerData))
      .filter((executionKey): executionKey is string => Boolean(executionKey)),
  );
  const due = eligible.filter((appointment) => !protectedExecutionKeys.has(
    evaluationMessageExecutionKey(appointment.id, appointment.startTime),
  ));
  result.skipped = eligible.length - due.length;
  result.due = due.length;
  if (due.length === 0) return result;

  const instances = await prisma.whatsAppInstance.findMany({
    where: {
      id: { in: EVALUATION_SCHEDULE_UNIT_CONFIGS.map((config) => config.instanceId) },
    },
    select: { id: true, name: true, provider: true, status: true },
  });
  const instanceById = new Map(instances.map((instance) => [instance.id, instance]));

  for (const appointment of due.slice(0, REMINDER_BATCH_SIZE)) {
    const automation = activeAutomationByUnit.get(appointment.unit);
    if (!automation) {
      result.skipped += 1;
      continue;
    }
    const instance = instanceById.get(getEvaluationScheduleUnitConfigByUnit(appointment.unit)?.instanceId || "");
    if (!instance) {
      result.failed += 1;
      continue;
    }
    const status = await sendEvaluationDayReminder({
      automation,
      appointment,
      instance,
      source: "automatic",
    });
    if (status === "already_sent") result.skipped += 1;
    else result[status] += 1;
  }

  return result;
}
