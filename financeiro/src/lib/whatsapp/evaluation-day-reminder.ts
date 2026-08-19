import { prisma } from "@/lib/db";
import { saoPauloDayRange } from "@/lib/date-filter";
import { findConversationByPhone } from "@/lib/whatsapp/conversation-starter";
import { ensureEvaluationDayReminderAutomations } from "@/lib/whatsapp/evaluation-day-reminder-automation";
import { evaluationDayReminderWindow } from "@/lib/whatsapp/evaluation-day-reminder-window";
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

function reminderExecutionKey(appointmentId: string, startTime: Date) {
  return `${appointmentId}:${startTime.toISOString()}`;
}

function executionKeyFromTriggerData(triggerData: unknown) {
  if (!triggerData || typeof triggerData !== "object" || Array.isArray(triggerData)) return null;
  const executionKey = (triggerData as Record<string, unknown>).executionKey;
  return typeof executionKey === "string" ? executionKey : null;
}

async function claimReminder(
  automation: ReminderAutomation,
  appointment: { id: string; clientName: string; clientPhone: string | null; unit: string; startTime: Date },
) {
  const executionKey = reminderExecutionKey(appointment.id, appointment.startTime);
  const existing = await prisma.automationLog.findFirst({
    where: {
      automationId: automation.id,
      triggerData: { path: ["executionKey"], equals: executionKey },
    },
    select: { id: true, result: true },
    orderBy: { executedAt: "desc" },
  });

  if (existing?.result === "success" || existing?.result === "processing") return null;

  const triggerData = {
    topic: "AGENDA",
    action: EVALUATION_DAY_REMINDER_AUTOMATION_TRIGGER,
    appointmentId: appointment.id,
    executionKey,
    instanceId: getEvaluationScheduleUnitConfigByUnit(appointment.unit)?.instanceId,
    unit: appointment.unit,
    startTime: appointment.startTime.toISOString(),
  };

  if (existing) {
    return prisma.automationLog.update({
      where: { id: existing.id },
      data: {
        contactPhone: appointment.clientPhone,
        contactName: appointment.clientName,
        triggerData,
        result: "processing",
        error: null,
        executedAt: new Date(),
      },
    });
  }

  return prisma.automationLog.create({
    data: {
      automationId: automation.id,
      contactPhone: appointment.clientPhone,
      contactName: appointment.clientName,
      triggerData,
      result: "processing",
    },
  });
}

async function markReminderFailed(logId: string, error: unknown) {
  await prisma.automationLog.update({
    where: { id: logId },
    data: {
      result: "failed",
      error: error instanceof Error ? error.message.slice(0, 1000) : "Erro desconhecido",
    },
  }).catch(() => {});
}

async function sendReminder(params: {
  automation: ReminderAutomation;
  appointment: { id: string; clientName: string; clientPhone: string | null; unit: string; startTime: Date };
  instances: Map<string, { id: string; name: string; provider: string; status: string }>;
}) {
  const { automation, appointment } = params;
  const unitConfig = getEvaluationScheduleUnitConfigByUnit(appointment.unit);
  if (!unitConfig) return "failed" as const;

  const log = await claimReminder(automation, appointment);
  if (!log) return "skipped" as const;

  try {
    if (!appointment.clientPhone) {
      throw new Error("A avaliação confirmada não possui telefone para o lembrete.");
    }
    const instance = params.instances.get(unitConfig.instanceId);
    if (!instance || instance.status !== "connected") {
      throw new Error(`A instância ${unitConfig.instanceDisplayName} não está conectada.`);
    }

    const conversation = await findConversationByPhone({
      phone: appointment.clientPhone,
      instanceIds: [unitConfig.instanceId],
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

    await sendAutomationText({
      dbInstance: instance,
      conversationId: conversation.id,
      contactPhone: conversation.contact.phone,
      lastKnownJid: conversation.lastKnownJid,
      message,
      respondedByName: "Automação de agenda",
    });

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
          where: { id: log.id },
          data: {
            result: "success",
            error: null,
            triggerData: {
              topic: "AGENDA",
              action: EVALUATION_DAY_REMINDER_AUTOMATION_TRIGGER,
              appointmentId: appointment.id,
              executionKey: reminderExecutionKey(appointment.id, appointment.startTime),
              conversationId: conversation.id,
              instanceId: instance.id,
              unit: unitConfig.unit,
              startTime: appointment.startTime.toISOString(),
            },
          },
        }),
      ]);
    } catch (logError) {
      console.error("[Evaluation Day Reminder] Lembrete enviado sem atualizar o histórico:", logError);
    }
    return "sent" as const;
  } catch (error) {
    console.error("[Evaluation Day Reminder] Falha ao enviar lembrete:", error);
    await markReminderFailed(log.id, error);
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
    reminderExecutionKey(appointment.id, appointment.startTime),
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
    const status = await sendReminder({ automation, appointment, instances: instanceById });
    result[status] += 1;
  }

  return result;
}
