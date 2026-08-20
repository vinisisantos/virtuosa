import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { phoneLookupKey } from "@/lib/phone";
import {
  ensureEvaluationDayReminderAutomations,
  findEvaluationDayReminderAutomation,
} from "@/lib/whatsapp/evaluation-day-reminder-automation";
import {
  EVALUATION_DAY_REMINDER_MANUAL_EARLIEST_HOUR,
  EVALUATION_DAY_REMINDER_MANUAL_HOURS_BEFORE,
  evaluationDayReminderWindow,
} from "@/lib/whatsapp/evaluation-day-reminder-window";
import { sendEvaluationDayReminder } from "@/lib/whatsapp/evaluation-day-reminder";
import { evaluationMessageWasProtected } from "@/lib/whatsapp/evaluation-message-execution";
import {
  EVALUATION_DAY_REMINDER_AUTOMATION_TRIGGER,
  getEvaluationScheduleUnitConfig,
  type EvaluationScheduleUnitConfig,
} from "@/lib/whatsapp/evaluation-schedule-confirmation-message";
import { getInstancesForRequest } from "@/lib/whatsapp/instance-resolver";

type AccessibleInstance = Awaited<ReturnType<typeof getInstancesForRequest>>["instances"][number];

type DayReminderContext = {
  instance: AccessibleInstance;
  unitConfig: EvaluationScheduleUnitConfig;
  conversation: {
    id: string;
    instanceId: string;
    lastKnownJid: string | null;
    contact: { phone: string; name: string | null };
  };
  appointment: {
    id: string;
    clientName: string;
    clientPhone: string | null;
    unit: string;
    startTime: Date;
  } | null;
};

async function resolveDayReminderContext(req: Request, conversationId: string): Promise<DayReminderContext | null> {
  const appointmentId = new URL(req.url).searchParams.get("appointmentId")?.trim() || null;
  const { instances } = await getInstancesForRequest(req);
  const eligibleInstances = instances.filter((candidate) => (
    candidate.canReply === true
    && Boolean(getEvaluationScheduleUnitConfig({ unit: candidate.unit, instanceId: candidate.id }))
  ));
  if (eligibleInstances.length === 0) return null;

  const conversation = await prisma.whatsAppConversation.findFirst({
    where: {
      id: conversationId,
      instanceId: { in: eligibleInstances.map((instance) => instance.id) },
    },
    select: {
      id: true,
      instanceId: true,
      lastKnownJid: true,
      contact: { select: { phone: true, name: true } },
    },
  });
  if (!conversation) return null;

  const instance = eligibleInstances.find((candidate) => candidate.id === conversation.instanceId);
  const unitConfig = getEvaluationScheduleUnitConfig({
    unit: instance?.unit,
    instanceId: instance?.id,
  });
  if (!instance || !unitConfig) return null;

  const phoneKey = phoneLookupKey(conversation.contact.phone);
  const phoneSuffix = phoneKey?.slice(-8) || "";
  if (!appointmentId || phoneSuffix.length < 8) {
    return { instance, unitConfig, conversation, appointment: null };
  }

  const appointment = await prisma.agendamento.findFirst({
    where: {
      id: appointmentId,
      unit: unitConfig.unit,
      clientPhone: { contains: phoneSuffix },
      procedimento: { contains: "avalia", mode: "insensitive" },
      status: { equals: "confirmado", mode: "insensitive" },
      startTime: { gt: new Date() },
    },
    select: {
      id: true,
      clientName: true,
      clientPhone: true,
      unit: true,
      startTime: true,
    },
  });
  const exactAppointment = appointment && phoneLookupKey(appointment.clientPhone) === phoneKey
    ? appointment
    : null;

  return { instance, unitConfig, conversation, appointment: exactAppointment };
}

function hiddenReminder(reason: string) {
  return NextResponse.json({ visible: false, alreadySent: false, reason });
}

function manualReminderWindow(startTime: Date) {
  return evaluationDayReminderWindow({
    startTime,
    hoursBefore: EVALUATION_DAY_REMINDER_MANUAL_HOURS_BEFORE,
    earliestHour: EVALUATION_DAY_REMINDER_MANUAL_EARLIEST_HOUR,
  });
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const context = await resolveDayReminderContext(req, id);
    if (!context) return hiddenReminder("not_applicable");
    if (!context.appointment) return hiddenReminder("not_confirmed");

    const automation = await findEvaluationDayReminderAutomation(context.unitConfig.unit);
    if (!automation || !automation.isActive) return hiddenReminder("automation_inactive");

    const window = manualReminderWindow(context.appointment.startTime);
    const alreadySent = await evaluationMessageWasProtected({
      automationId: automation.id,
      action: EVALUATION_DAY_REMINDER_AUTOMATION_TRIGGER,
      appointmentId: context.appointment.id,
      startTime: context.appointment.startTime,
    });

    return NextResponse.json({
      visible: window.state === "available",
      alreadySent,
      reason: window.state,
      appointmentId: context.appointment.id,
      startTime: context.appointment.startTime.toISOString(),
      eligibleAt: window.reminderAt.toISOString(),
      windowHours: EVALUATION_DAY_REMINDER_MANUAL_HOURS_BEFORE,
    });
  } catch (error) {
    console.error("[Evaluation Day Reminder Eligibility API Error]:", error);
    return NextResponse.json({ error: "Erro ao verificar o lembrete da avaliação" }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const context = await resolveDayReminderContext(req, id);
    if (!context?.appointment) {
      return NextResponse.json({ error: "A avaliação precisa estar confirmada para enviar este lembrete." }, { status: 409 });
    }

    const automations = await ensureEvaluationDayReminderAutomations(
      req.headers.get("x-user-name") || "Sistema",
    );
    const automation = automations.find((candidate) => candidate.unit === context.unitConfig.unit);
    if (!automation?.isActive) {
      return NextResponse.json({ error: "A automação de lembrete está desativada." }, { status: 409 });
    }

    const window = manualReminderWindow(context.appointment.startTime);
    if (window.state !== "available") {
      return NextResponse.json({
        error: `O lembrete manual fica disponível nas ${EVALUATION_DAY_REMINDER_MANUAL_HOURS_BEFORE} horas anteriores à avaliação, no próprio dia.`,
      }, { status: 409 });
    }

    const status = await sendEvaluationDayReminder({
      automation,
      appointment: context.appointment,
      instance: context.instance,
      conversation: context.conversation,
      source: "manual",
      respondedByName: req.headers.get("x-user-name") || "Equipe da agenda",
    });
    if (status === "failed") {
      return NextResponse.json({ error: "Não foi possível enviar o lembrete pelo WhatsApp." }, { status: 500 });
    }

    return NextResponse.json({
      status: status === "already_sent" ? "already_sent" : "sent",
      appointmentId: context.appointment.id,
      startTime: context.appointment.startTime.toISOString(),
    });
  } catch (error) {
    console.error("[Evaluation Day Reminder Send API Error]:", error);
    return NextResponse.json({ error: "Não foi possível enviar o lembrete da avaliação." }, { status: 500 });
  }
}
