import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { getPipelineDealIdFromEvaluationNotes } from "@/lib/evaluation-scheduling";
import { phoneLookupKey } from "@/lib/phone";
import {
  ensureEvaluationConfirmationRequestAutomation,
  findEvaluationConfirmationRequestAutomation,
  getEvaluationConfirmationWindowHours,
} from "@/lib/whatsapp/evaluation-confirmation-automation";
import { evaluationConfirmationWindow } from "@/lib/whatsapp/evaluation-confirmation-window";
import {
  DEFAULT_EVALUATION_CONFIRMATION_REQUEST_TEMPLATE,
  EVALUATION_CONFIRMATION_REQUEST_AUTOMATION_TRIGGER,
  LEADS_OSASCO_INSTANCE_ID,
  LEADS_OSASCO_UNIT,
  buildLeadsOsascoEvaluationConfirmationRequestMessage,
  getEvaluationScheduleAutomationMessage,
} from "@/lib/whatsapp/evaluation-schedule-confirmation-message";
import { sendAutomationText } from "@/lib/whatsapp/automation-sender";
import { getInstancesForRequest } from "@/lib/whatsapp/instance-resolver";

type AccessibleInstance = Awaited<ReturnType<typeof getInstancesForRequest>>["instances"][number];

type EvaluationConfirmationContext = {
  instance: AccessibleInstance;
  conversation: {
    id: string;
    lastKnownJid: string | null;
    contact: { phone: string; name: string | null };
  };
  appointment: {
    id: string;
    clientName: string;
    startTime: Date;
  } | null;
};

async function confirmationWasSent(automationId: string, appointmentId: string) {
  const log = await prisma.automationLog.findFirst({
    where: {
      automationId,
      result: "success",
      triggerData: {
        path: ["appointmentId"],
        equals: appointmentId,
      },
    },
    orderBy: { executedAt: "desc" },
    select: { id: true },
  });
  return Boolean(log);
}

async function resolveEvaluationConfirmationContext(
  req: Request,
  conversationId: string,
): Promise<EvaluationConfirmationContext | null> {
  const { instances } = await getInstancesForRequest(req);
  const instance = instances.find((candidate) => (
    candidate.id === LEADS_OSASCO_INSTANCE_ID
    && candidate.unit === LEADS_OSASCO_UNIT
    && candidate.canReply === true
  ));
  if (!instance) return null;

  const conversation = await prisma.whatsAppConversation.findFirst({
    where: {
      id: conversationId,
      instanceId: instance.id,
    },
    select: {
      id: true,
      lastKnownJid: true,
      contact: { select: { phone: true, name: true } },
    },
  });
  if (!conversation) return null;

  const phoneKey = phoneLookupKey(conversation.contact.phone);
  const phoneSuffix = phoneKey?.slice(-8) || "";
  if (phoneSuffix.length < 8) {
    return { instance, conversation, appointment: null };
  }

  const appointmentCandidates = await prisma.agendamento.findMany({
    where: {
      unit: LEADS_OSASCO_UNIT,
      clientPhone: { contains: phoneSuffix },
      procedimento: { contains: "avalia", mode: "insensitive" },
      status: "pendente",
      startTime: { gt: new Date() },
      notes: { contains: "[pipelineDealId:" },
    },
    select: {
      id: true,
      clientName: true,
      clientPhone: true,
      startTime: true,
      notes: true,
    },
    orderBy: { startTime: "asc" },
    take: 10,
  });
  const exactAppointments = appointmentCandidates.filter((appointment) => (
    phoneLookupKey(appointment.clientPhone) === phoneKey
  ));
  const dealIds = exactAppointments
    .map((appointment) => getPipelineDealIdFromEvaluationNotes(appointment.notes))
    .filter((dealId): dealId is string => Boolean(dealId));
  if (dealIds.length === 0) {
    return { instance, conversation, appointment: null };
  }

  const scheduledDeals = await prisma.salesPipeline.findMany({
    where: {
      id: { in: dealIds },
      unit: LEADS_OSASCO_UNIT,
      stage: "agendado",
    },
    select: { id: true },
  });
  const scheduledDealIds = new Set(scheduledDeals.map((deal) => deal.id));
  const appointment = exactAppointments.find((candidate) => {
    const dealId = getPipelineDealIdFromEvaluationNotes(candidate.notes);
    return Boolean(dealId && scheduledDealIds.has(dealId));
  });

  return {
    instance,
    conversation,
    appointment: appointment
      ? {
          id: appointment.id,
          clientName: appointment.clientName,
          startTime: appointment.startTime,
        }
      : null,
  };
}

function hiddenConfirmation(reason: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ visible: false, alreadySent: false, reason, ...extra });
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const context = await resolveEvaluationConfirmationContext(req, id);
    if (!context) return hiddenConfirmation("not_applicable");
    if (!context.appointment) return hiddenConfirmation("not_scheduled");

    const automation = await findEvaluationConfirmationRequestAutomation();
    if (automation && !automation.isActive) return hiddenConfirmation("automation_inactive");

    const windowHours = getEvaluationConfirmationWindowHours(automation?.triggerConfig);
    const window = evaluationConfirmationWindow({
      startTime: context.appointment.startTime,
      windowHours,
    });
    const alreadySent = automation
      ? await confirmationWasSent(automation.id, context.appointment.id)
      : false;

    return NextResponse.json({
      visible: window.state === "available",
      alreadySent,
      reason: window.state,
      appointmentId: context.appointment.id,
      startTime: context.appointment.startTime.toISOString(),
      eligibleAt: window.eligibleAt.toISOString(),
      windowHours,
    });
  } catch (error) {
    console.error("[Evaluation Confirmation Eligibility API Error]:", error);
    return NextResponse.json({ error: "Erro ao verificar a confirmação da avaliação" }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let automation: Awaited<ReturnType<typeof ensureEvaluationConfirmationRequestAutomation>> | null = null;
  let context: EvaluationConfirmationContext | null = null;

  try {
    const { id } = await params;
    context = await resolveEvaluationConfirmationContext(req, id);
    if (!context?.appointment) {
      return NextResponse.json({ error: "Não há uma avaliação agendada para confirmar nesta conversa." }, { status: 409 });
    }

    automation = await ensureEvaluationConfirmationRequestAutomation(
      req.headers.get("x-user-name") || "Sistema",
    );
    if (!automation.isActive) {
      return NextResponse.json({ error: "A automação de confirmação está desativada." }, { status: 409 });
    }

    const windowHours = getEvaluationConfirmationWindowHours(automation.triggerConfig);
    const window = evaluationConfirmationWindow({
      startTime: context.appointment.startTime,
      windowHours,
    });
    if (window.state !== "available") {
      return NextResponse.json({
        error: `A confirmação só pode ser enviada nas ${windowHours} hora${windowHours === 1 ? "" : "s"} anteriores à avaliação.`,
      }, { status: 409 });
    }
    if (context.instance.status !== "connected") {
      return NextResponse.json({ error: "A instância Leads Osasco não está conectada." }, { status: 409 });
    }

    if (await confirmationWasSent(automation.id, context.appointment.id)) {
      return NextResponse.json({
        status: "already_sent",
        appointmentId: context.appointment.id,
        startTime: context.appointment.startTime.toISOString(),
      });
    }

    const messageTemplate = getEvaluationScheduleAutomationMessage(automation.steps)
      || DEFAULT_EVALUATION_CONFIRMATION_REQUEST_TEMPLATE;
    const message = buildLeadsOsascoEvaluationConfirmationRequestMessage({
      clientName: context.appointment.clientName,
      startTime: context.appointment.startTime,
      template: messageTemplate,
    });

    await sendAutomationText({
      dbInstance: context.instance,
      conversationId: context.conversation.id,
      contactPhone: context.conversation.contact.phone,
      lastKnownJid: context.conversation.lastKnownJid,
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
            contactPhone: context.conversation.contact.phone,
            contactName: context.appointment.clientName,
            triggerData: {
              topic: "AGENDA",
              action: EVALUATION_CONFIRMATION_REQUEST_AUTOMATION_TRIGGER,
              appointmentId: context.appointment.id,
              conversationId: context.conversation.id,
              instanceId: context.instance.id,
              unit: LEADS_OSASCO_UNIT,
              startTime: context.appointment.startTime.toISOString(),
            },
            result: "success",
          },
        }),
      ]);
    } catch (logError) {
      console.error("[Evaluation Confirmation] Mensagem enviada sem atualizar o histórico:", logError);
    }

    return NextResponse.json({
      status: "sent",
      appointmentId: context.appointment.id,
      startTime: context.appointment.startTime.toISOString(),
    });
  } catch (error) {
    console.error("[Evaluation Confirmation Send API Error]:", error);
    if (automation) {
      await prisma.automationLog.create({
        data: {
          automationId: automation.id,
          contactPhone: context?.conversation.contact.phone || null,
          contactName: context?.appointment?.clientName || context?.conversation.contact.name || null,
          triggerData: {
            topic: "AGENDA",
            action: EVALUATION_CONFIRMATION_REQUEST_AUTOMATION_TRIGGER,
            appointmentId: context?.appointment?.id || null,
            conversationId: context?.conversation.id || null,
            instanceId: context?.instance.id || null,
            unit: LEADS_OSASCO_UNIT,
            startTime: context?.appointment?.startTime.toISOString() || null,
          },
          result: "failed",
          error: error instanceof Error ? error.message.slice(0, 1000) : "Erro desconhecido",
        },
      }).catch(() => {});
    }
    return NextResponse.json({ error: "Não foi possível enviar a confirmação da avaliação." }, { status: 500 });
  }
}
