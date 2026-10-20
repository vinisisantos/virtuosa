import { randomUUID } from "node:crypto";
import { enqueueEvaluationGroupReschedule } from "@/lib/whatsapp/evaluation-group-reschedule";
import { Prisma } from "@prisma/client";
import { normalizeAppointmentClientName } from "@/lib/appointment-client-name";
import { evaluationGroupConfirmationSourcePredicate } from "@/lib/whatsapp/evaluation-group-confirmation-source";
import {
  getEvaluationGroupUnitConfig, normalizeEvaluationGroupPhone, normalizeEvaluationGroupProcedure, parseEvaluationGroupConfig,
} from "@/lib/whatsapp/evaluation-group-notice-config";
import {
  isActiveGroupEvaluation, isFutureGroupEvaluation, isGroupEvaluationCancelled,
  type EvaluationGroupAppointment,
} from "@/lib/whatsapp/evaluation-group-snapshot";

type Database = Pick<Prisma.TransactionClient, "appSetting" | "whatsAppEvaluationGroupNotice" | "$queryRaw">;
type Params = { appointment: EvaluationGroupAppointment; previousStatus: string; previousStartTime?: Date; recoverMissingNotice?: boolean };
export type EvaluationGroupConfirmationSkipReason = "unchanged" | "not_confirmation" | "not_cancellation"
  | "not_reschedule" | "invalid_change"
  | "not_future_evaluation" | "disabled" | "unverified_source" | "missing_name" | "invalid_phone" | "missing_procedure";
export type EvaluationGroupConfirmationResult = {
  status: "queued" | "already_recorded" | "skipped";
  reason?: EvaluationGroupConfirmationSkipReason;
  noticeId?: string;
  state?: string;
};

async function enqueueStatusNotice(database: Database, params: Params, eventType: "confirmed" | "cancelled", now: Date) {
  const { appointment, previousStatus } = params;
  const skip = (reason: EvaluationGroupConfirmationSkipReason): EvaluationGroupConfirmationResult => ({ status: "skipped", reason });
  const scope = getEvaluationGroupUnitConfig(appointment.unit);
  if (!scope) return skip("not_future_evaluation");
  if (eventType === "confirmed") {
    if (previousStatus === "confirmado" && !params.recoverMissingNotice) return skip("unchanged");
    if (appointment.status !== "confirmado") return skip("not_confirmation");
    if (!isActiveGroupEvaluation(appointment, now)) return skip("not_future_evaluation");
  } else {
    if (!isGroupEvaluationCancelled(appointment.status)) return skip("not_cancellation");
    if (isGroupEvaluationCancelled(previousStatus)) return skip("unchanged");
    if (!isFutureGroupEvaluation(appointment, now)) return skip("not_future_evaluation");
  }
  const setting = await database.appSetting.findUnique({
    where: { key: scope.settingKey }, select: { value: true },
  });
  const config = parseEvaluationGroupConfig(setting?.value, scope.unit);
  const activatedAt = eventType === "confirmed" ? config?.confirmationsActivatedAt : config?.cancellationsActivatedAt;
  if (!config?.enabled || !activatedAt || new Date(activatedAt) > now) return skip("disabled");
  const source = await database.$queryRaw<{ eligible: boolean }[]>(Prisma.sql`SELECT ${evaluationGroupConfirmationSourcePredicate({
    appointmentId: appointment.id, startTime: appointment.startTime, appointmentCreatedAt: appointment.createdAt,
    clientPhone: appointment.clientPhone, config,
  })} AS eligible`);
  if (!source[0]?.eligible) return skip("unverified_source");
  const eventKey = `${eventType}:${appointment.startTime.toISOString()}`;
  const existing = await database.whatsAppEvaluationGroupNotice.findUnique({
    where: { appointmentId_eventKey: { appointmentId: appointment.id, eventKey } }, select: { id: true, state: true },
  });
  if (existing) return { status: "already_recorded", noticeId: existing.id, state: existing.state } satisfies EvaluationGroupConfirmationResult;
  const clientName = normalizeAppointmentClientName(appointment.clientName);
  const clientPhone = normalizeEvaluationGroupPhone(appointment.clientPhone);
  const evaluationProcedure = normalizeEvaluationGroupProcedure(appointment.evaluationProcedure);
  if (!clientName) return skip("missing_name");
  if (!clientPhone) return skip("invalid_phone");
  if (!evaluationProcedure) return skip("missing_procedure");
  const id = randomUUID();
  const notice = await database.whatsAppEvaluationGroupNotice.upsert({
    where: { appointmentId_eventKey: { appointmentId: appointment.id, eventKey } },
    create: { id, appointmentId: appointment.id, eventType, eventKey,
      instanceId: config.instanceId, groupJid: config.groupJid, groupName: config.groupName,
      configActivatedAt: new Date(config.activatedAt), clientName, clientPhone, evaluationProcedure,
      startTime: appointment.startTime, appointmentCreatedAt: appointment.createdAt, availableAt: now, createdAt: now },
    // Uma ocorrência já registrada, inclusive incerta, nunca é reaberta por outra transição.
    update: {}, select: { id: true, state: true },
  });
  return { status: notice.id === id ? "queued" : "already_recorded", noticeId: notice.id, state: notice.state } satisfies EvaluationGroupConfirmationResult;
}

export function enqueueEvaluationGroupConfirmation(database: Database, params: Params, now = new Date()) {
  return enqueueStatusNotice(database, params, "confirmed", now);
}

export function enqueueEvaluationGroupCancellation(database: Database, params: Params, now = new Date()) {
  return enqueueStatusNotice(database, params, "cancelled", now);
}

export function enqueueEvaluationGroupStatusNotice(database: Database, params: Params, now = new Date()) {
  if (params.previousStartTime && params.previousStartTime.getTime() !== params.appointment.startTime.getTime()
    && !isGroupEvaluationCancelled(params.appointment.status)) {
    return enqueueEvaluationGroupReschedule(database, { appointment: params.appointment, previousStartTime: params.previousStartTime }, now);
  }
  return isGroupEvaluationCancelled(params.appointment.status)
    ? enqueueEvaluationGroupCancellation(database, params, now)
    : enqueueEvaluationGroupConfirmation(database, params, now);
}
