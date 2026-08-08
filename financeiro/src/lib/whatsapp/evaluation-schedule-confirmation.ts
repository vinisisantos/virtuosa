import { prisma } from "@/lib/db";
import { phoneLookupKey } from "@/lib/phone";
import { getInstancesForRequest } from "@/lib/whatsapp/instance-resolver";
import { sendAutomationText } from "@/lib/whatsapp/automation-sender";
import {
  buildLeadsOsascoScheduleConfirmationMessage,
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

  try {
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
      }),
      respondedByName: "Automação de agendamento",
    });

    return { status: "sent" };
  } catch (error) {
    console.error("[Pipeline] Falha ao enviar confirmação automática do agendamento:", error);
    return { status: "failed" };
  }
}
