import { prisma } from "@/lib/db";
import { findConversationByPhone } from "@/lib/whatsapp/conversation-starter";
import { ensureEvaluationRescheduleAutomation } from "@/lib/whatsapp/evaluation-reschedule-automation";
import {
  DEFAULT_EVALUATION_RESCHEDULED_TEMPLATE,
  EVALUATION_RESCHEDULED_AUTOMATION_TRIGGER,
  buildEvaluationRescheduledMessage,
  getEvaluationScheduleAutomationMessage,
  getEvaluationScheduleUnitConfigByUnit,
} from "@/lib/whatsapp/evaluation-schedule-confirmation-message";
import { sendAutomationText } from "@/lib/whatsapp/automation-sender";

export type EvaluationRescheduleNotificationResult = {
  status: "not_applicable" | "already_sent" | "sent" | "failed";
};

function rescheduleExecutionKey(
  appointmentId: string,
  previousStartTime: Date,
  startTime: Date,
) {
  return `${appointmentId}:${previousStartTime.toISOString()}:${startTime.toISOString()}`;
}

async function rescheduleMessageWasSent(automationId: string, executionKey: string) {
  const log = await prisma.automationLog.findFirst({
    where: {
      automationId,
      result: "success",
      triggerData: {
        path: ["executionKey"],
        equals: executionKey,
      },
    },
    select: { id: true },
  });
  return Boolean(log);
}

export async function sendEvaluationRescheduleNotification(params: {
  unit: string;
  appointmentId: string;
  clientName: string;
  clientPhone: string | null;
  previousStartTime: Date;
  startTime: Date;
  createdBy?: string | null;
}): Promise<EvaluationRescheduleNotificationResult> {
  const unitConfig = getEvaluationScheduleUnitConfigByUnit(params.unit);
  if (!unitConfig) return { status: "not_applicable" };
  if (params.previousStartTime.getTime() === params.startTime.getTime()) {
    return { status: "not_applicable" };
  }
  if (!params.clientPhone) return { status: "failed" };

  const executionKey = rescheduleExecutionKey(
    params.appointmentId,
    params.previousStartTime,
    params.startTime,
  );
  let automation: Awaited<ReturnType<typeof ensureEvaluationRescheduleAutomation>> | null = null;
  let conversationId: string | null = null;

  try {
    automation = await ensureEvaluationRescheduleAutomation(
      unitConfig.unit,
      params.createdBy,
    );
    if (!automation.isActive) return { status: "not_applicable" };
    if (await rescheduleMessageWasSent(automation.id, executionKey)) {
      return { status: "already_sent" };
    }

    const [instance, conversation] = await Promise.all([
      prisma.whatsAppInstance.findUnique({
        where: { id: unitConfig.instanceId },
        select: { id: true, name: true, provider: true, status: true },
      }),
      findConversationByPhone({
        phone: params.clientPhone,
        instanceIds: [unitConfig.instanceId],
      }),
    ]);

    if (!instance || instance.status !== "connected") {
      throw new Error(`A instância ${unitConfig.instanceDisplayName} não está conectada.`);
    }
    if (!conversation || conversation.instanceId !== instance.id) {
      throw new Error(`Conversa não encontrada na ${unitConfig.instanceDisplayName}.`);
    }
    conversationId = conversation.id;

    const messageTemplate = getEvaluationScheduleAutomationMessage(automation.steps)
      || DEFAULT_EVALUATION_RESCHEDULED_TEMPLATE;
    const message = buildEvaluationRescheduledMessage({
      unit: unitConfig.unit,
      clientName: params.clientName,
      startTime: params.startTime,
      template: messageTemplate,
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
        prisma.automationLog.create({
          data: {
            automationId: automation.id,
            contactPhone: conversation.contact.phone,
            contactName: params.clientName,
            triggerData: {
              topic: "AGENDA",
              action: EVALUATION_RESCHEDULED_AUTOMATION_TRIGGER,
              appointmentId: params.appointmentId,
              executionKey,
              conversationId: conversation.id,
              instanceId: instance.id,
              unit: unitConfig.unit,
              previousStartTime: params.previousStartTime.toISOString(),
              startTime: params.startTime.toISOString(),
            },
            result: "success",
          },
        }),
      ]);
    } catch (logError) {
      console.error("[Evaluation Reschedule] Mensagem enviada sem atualizar o histórico:", logError);
    }

    return { status: "sent" };
  } catch (error) {
    console.error("[Evaluation Reschedule] Falha ao enviar mensagem automática:", error);
    if (automation) {
      await prisma.automationLog.create({
        data: {
          automationId: automation.id,
          contactPhone: params.clientPhone,
          contactName: params.clientName,
          triggerData: {
            topic: "AGENDA",
            action: EVALUATION_RESCHEDULED_AUTOMATION_TRIGGER,
            appointmentId: params.appointmentId,
            executionKey,
            conversationId,
            instanceId: unitConfig.instanceId,
            unit: unitConfig.unit,
            previousStartTime: params.previousStartTime.toISOString(),
            startTime: params.startTime.toISOString(),
          },
          result: "failed",
          error: error instanceof Error ? error.message.slice(0, 1000) : "Erro desconhecido",
        },
      }).catch(() => {});
    }
    return { status: "failed" };
  }
}
