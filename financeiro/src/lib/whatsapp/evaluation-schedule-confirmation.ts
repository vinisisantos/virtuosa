import { prisma } from "@/lib/db";
import { phoneLookupKey } from "@/lib/phone";
import { getInstancesForRequest } from "@/lib/whatsapp/instance-resolver";
import { sendAutomationText } from "@/lib/whatsapp/automation-sender";
import { ALICE_ATTENDANT_NAME } from "@/lib/whatsapp/inbox-attendant";
import { validateAliceBookingClaim, type AliceBookingClaim } from "@/lib/ai-assistant/autonomy/booking-authorization";
import {
  EVALUATION_SCHEDULED_AUTOMATION_TRIGGER,
  buildEvaluationScheduleConfirmationMessage,
  getEvaluationScheduleUnitConfig,
  getEvaluationScheduleUnitConfigByUnit,
  getEvaluationScheduleAutomationMessage,
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
  allowAuthorizedSbcInstance?: boolean;
  requireProviderMessageId?: boolean;
  autonomyClaim?: AliceBookingClaim;
  evaluationCostQuestion?: boolean;
}): Promise<EvaluationScheduleConfirmationResult> {
  const unitConfig = getEvaluationScheduleUnitConfig({
    unit: params.unit,
    instanceId: params.instanceId,
  }) || (params.unit === "SBC" && params.allowAuthorizedSbcInstance ? getEvaluationScheduleUnitConfigByUnit("SBC") : null);
  if (!unitConfig) {
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
      : unitConfig.scheduledTemplate;
    if (!messageTemplate) {
      console.error("[Pipeline] Automação de agenda sem mensagem configurada.");
      return { status: "failed" };
    }

    const proof = params.autonomyClaim;
    if (proof && (params.unit !== "SBC" || !params.instanceId || !await validateAliceBookingClaim({
      claim: proof, conversationId: params.conversationId, instanceId: params.instanceId,
    }))) return { status: "failed" };
    const instance = proof
      ? await prisma.whatsAppInstance.findFirst({ where: { id: params.instanceId!, unit: "SBC", status: "connected" },
        select: { id: true, name: true, unit: true, provider: true, status: true } })
      : (await getInstancesForRequest(params.request)).instances.find((candidate) => candidate.id === params.instanceId);
    if (!instance || (!proof && (!("canReply" in instance) || instance.canReply !== true)) || instance.status !== "connected") {
      return { status: "failed" };
    }
    if (params.allowAuthorizedSbcInstance && params.unit === "SBC" && !["SBC", "Todas"].includes(instance.unit)) return { status: "failed" };

    const conversation = await prisma.whatsAppConversation.findFirst({
      where: {
        id: params.conversationId,
        instanceId: instance.id,
      },
      select: {
        id: true,
        status: true,
        lastKnownJid: true,
        contact: {
          select: {
            phone: true,
            unit: true,
          },
        },
      },
    });
    if (!conversation) return { status: "failed" };
    if (params.allowAuthorizedSbcInstance && instance.unit === "Todas" && conversation.contact.unit !== "SBC") return { status: "failed" };

    const contactPhoneKey = phoneLookupKey(conversation.contact.phone);
    const clientPhoneKey = phoneLookupKey(params.clientPhone);
    if (!contactPhoneKey || !clientPhoneKey || contactPhoneKey !== clientPhoneKey) {
      return { status: "failed" };
    }

    const sent = await sendAutomationText({
      dbInstance: instance,
      conversationId: conversation.id,
      contactPhone: conversation.contact.phone,
      lastKnownJid: conversation.lastKnownJid,
      message: buildEvaluationScheduleConfirmationMessage({
        unit: unitConfig.unit,
        clientName: params.clientName,
        startTime: params.startTime,
        template: messageTemplate,
        evaluationCostQuestion: params.evaluationCostQuestion,
      }),
      respondedByName: proof ? ALICE_ATTENDANT_NAME : "Automação de agendamento",
      requireProviderMessageId: params.requireProviderMessageId,
      beforeSend: proof ? async () => {
        if (!await validateAliceBookingClaim({ claim: proof, conversationId: conversation.id, instanceId: instance.id })) {
          throw new Error("A conversa mudou antes da confirmação; não reenviar automaticamente.");
        }
      } : undefined,
    });
    if (proof) await prisma.whatsAppConversation.updateMany({
      where: { id: conversation.id, instanceId: instance.id, aiMode: "agent", status: conversation.status },
      data: { lastOutboundAt: sent.sentAt, ...(conversation.status === "waiting_response" ? { status: "open" } : {}) },
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
