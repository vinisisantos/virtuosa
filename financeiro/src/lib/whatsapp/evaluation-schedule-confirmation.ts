import { prisma } from "@/lib/db";
import { phoneLookupKey } from "@/lib/phone";
import { getInstancesForRequest } from "@/lib/whatsapp/instance-resolver";
import { sendAutomationText } from "@/lib/whatsapp/automation-sender";
import {
  DEFAULT_EVALUATION_SCHEDULE_CONFIRMATION_TEMPLATE,
  EVALUATION_SCHEDULED_AUTOMATION_TRIGGER,
  buildLeadsOsascoScheduleConfirmationMessage,
  getEvaluationScheduleAutomationMessage,
  shouldSendLeadsOsascoScheduleConfirmation,
} from "@/lib/whatsapp/evaluation-schedule-confirmation-message";

export type EvaluationScheduleConfirmationResult = {
  status: "not_applicable" | "sent" | "failed";
};

export async function sendEvaluationScheduleConfirmation(params: {
  request: Request;
  unit: string;
  instanceId?: string | null;
  conversationId?: string | null;
  clientName: string;
  clientPhone?: string | null;
  startTime: Date;
}): Promise<EvaluationScheduleConfirmationResult> {
  if (!shouldSendLeadsOsascoScheduleConfirmation({
    unit: params.unit,
    instanceId: params.instanceId,
  })) {
    return { status: "not_applicable" };
  }

  if (!params.conversationId || !params.clientName.trim()) {
    return { status: "failed" };
  }

  let automation: {
    id: string;
    isActive: boolean;
    steps: unknown;
  } | null = null;

  try {
    automation = await prisma.automation.findFirst({
      where: {
        triggerType: EVALUATION_SCHEDULED_AUTOMATION_TRIGGER,
        unit: params.unit,
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        isActive: true,
        steps: true,
      },
    });
    if (automation && !automation.isActive) {
      return { status: "not_applicable" };
    }

    const messageTemplate = automation
      ? getEvaluationScheduleAutomationMessage(automation.steps)
      : DEFAULT_EVALUATION_SCHEDULE_CONFIRMATION_TEMPLATE;
    if (!messageTemplate) {
      console.error("[Pipeline] Automação de agenda sem mensagem configurada.");
      return { status: "failed" };
    }

    const { instances } = await getInstancesForRequest(params.request);
    const instance = instances.find((candidate) => candidate.id === params.instanceId);
    if (!instance || instance.canReply !== true || instance.status !== "connected") {
      return { status: "failed" };
    }

    const conversation = await prisma.whatsAppConversation.findFirst({
      where: {
        id: params.conversationId,
        instanceId: instance.id,
      },
      select: {
        id: true,
        lastKnownJid: true,
        contact: {
          select: {
            phone: true,
          },
        },
      },
    });
    if (!conversation) return { status: "failed" };

    const contactPhoneKey = phoneLookupKey(conversation.contact.phone);
    const clientPhoneKey = phoneLookupKey(params.clientPhone);
    if (!contactPhoneKey || !clientPhoneKey || contactPhoneKey !== clientPhoneKey) {
      return { status: "failed" };
    }

    await sendAutomationText({
      dbInstance: instance,
      conversationId: conversation.id,
      contactPhone: conversation.contact.phone,
      lastKnownJid: conversation.lastKnownJid,
      message: buildLeadsOsascoScheduleConfirmationMessage({
        clientName: params.clientName,
        startTime: params.startTime,
        template: messageTemplate,
      }),
      respondedByName: "Automação de agendamento",
    });

    if (automation) {
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
                conversationId: conversation.id,
                instanceId: instance.id,
                unit: params.unit,
                startTime: params.startTime.toISOString(),
              },
              result: "success",
            },
          }),
        ]);
      } catch (logError) {
        console.error("[Pipeline] Confirmação enviada, mas o histórico da automação não foi atualizado:", logError);
      }
    }

    return { status: "sent" };
  } catch (error) {
    console.error("[Pipeline] Falha ao enviar confirmação automática do agendamento:", error);
    if (automation) {
      await prisma.automationLog.create({
        data: {
          automationId: automation.id,
          contactPhone: params.clientPhone || null,
          contactName: params.clientName,
          triggerData: {
            topic: "AGENDA",
            conversationId: params.conversationId,
            instanceId: params.instanceId,
            unit: params.unit,
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
