import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { normalizeAppointmentClientName } from "@/lib/appointment-client-name";
import { evaluationGroupRescheduleSourcePredicate } from "@/lib/whatsapp/evaluation-group-confirmation-source";
import { getEvaluationGroupUnitConfig, normalizeEvaluationGroupPhone, parseEvaluationGroupConfig } from "@/lib/whatsapp/evaluation-group-notice-config";
import { evaluationGroupSnapshot, isActiveGroupEvaluation, type EvaluationGroupAppointment } from "@/lib/whatsapp/evaluation-group-snapshot";
import type { EvaluationGroupConfirmationResult } from "@/lib/whatsapp/evaluation-group-status-notice";

type Database = Pick<Prisma.TransactionClient, "appSetting" | "whatsAppEvaluationGroupNotice" | "$queryRaw">;
type Params = { appointment: EvaluationGroupAppointment; previousStartTime: Date; changeId?: string };

// changeId identifica a versão gravada, não apenas o destino: A→B→A são mudanças distintas.
export async function enqueueEvaluationGroupReschedule(database: Database, params: Params, now = new Date()): Promise<EvaluationGroupConfirmationResult> {
  const { appointment, previousStartTime } = params;
  const skip = (reason: EvaluationGroupConfirmationResult["reason"]): EvaluationGroupConfirmationResult => ({ status: "skipped", reason });
  const scope = getEvaluationGroupUnitConfig(appointment.unit);
  if (!scope || !Number.isFinite(previousStartTime.getTime())
    || previousStartTime.getTime() === appointment.startTime.getTime()) return skip("not_reschedule");
  const setting = await database.appSetting.findUnique({ where: { key: scope.settingKey }, select: { value: true } });
  const config = parseEvaluationGroupConfig(setting?.value, scope.unit);
  if (!config?.enabled || !config.reschedulesActivatedAt || new Date(config.reschedulesActivatedAt) > now) return skip("disabled");
  const changeId = params.changeId ?? appointment.updatedAt?.toISOString();
  if (!changeId || !/^[a-zA-Z0-9_.:-]{1,150}$/.test(changeId)) return skip("invalid_change");
  const eventKey = `rescheduled:${changeId}`;
  // Também invalida se o novo horário for passado ou o cadastro ficar incompleto.
  // Um aviso antigo não pode ressurgir quando a agenda retorna ao mesmo horário.
  await database.whatsAppEvaluationGroupNotice.updateMany({
    where: { appointmentId: appointment.id, eventType: "rescheduled", eventKey: { not: eventKey },
      state: { in: ["queued", "processing"] }, sendStartedAt: null },
    data: { state: "cancelled", claimToken: null, claimedAt: null, lastError: "Novo reagendamento substituiu este aviso antes do envio." },
  });
  if (!isActiveGroupEvaluation(appointment, now)) return skip("not_future_evaluation");
  const source = await database.$queryRaw<{ eligible: boolean }[]>(Prisma.sql`SELECT ${evaluationGroupRescheduleSourcePredicate({
    appointmentId: appointment.id, startTime: previousStartTime, appointmentCreatedAt: appointment.createdAt,
    clientPhone: appointment.clientPhone, config,
  })} AS eligible`);
  if (!source[0]?.eligible) return skip("unverified_source");
  const existing = await database.whatsAppEvaluationGroupNotice.findUnique({
    where: { appointmentId_eventKey: { appointmentId: appointment.id, eventKey } }, select: { id: true, state: true },
  });
  if (existing) return { status: "already_recorded", noticeId: existing.id, state: existing.state };
  const snapshot = evaluationGroupSnapshot(appointment);
  if (!snapshot) return skip(!normalizeAppointmentClientName(appointment.clientName) ? "missing_name"
    : !normalizeEvaluationGroupPhone(appointment.clientPhone) ? "invalid_phone" : "missing_procedure");
  const id = randomUUID();
  const notice = await database.whatsAppEvaluationGroupNotice.upsert({
    where: { appointmentId_eventKey: { appointmentId: appointment.id, eventKey } },
    create: { id, appointmentId: appointment.id, eventType: "rescheduled", eventKey, previousStartTime,
      instanceId: config.instanceId, groupJid: config.groupJid, groupName: config.groupName,
      configActivatedAt: new Date(config.activatedAt), ...snapshot, startTime: appointment.startTime,
      appointmentCreatedAt: appointment.createdAt, availableAt: now, createdAt: now },
    update: {}, select: { id: true, state: true },
  });
  return { status: notice.id === id ? "queued" : "already_recorded", noticeId: notice.id, state: notice.state };
}
