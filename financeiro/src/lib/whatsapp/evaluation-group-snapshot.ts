import { normalizeEvaluationStatus } from "@/lib/evaluation-status";
import { normalizeAppointmentClientName } from "@/lib/appointment-client-name";
import {
  getEvaluationGroupUnitConfig, normalizeEvaluationGroupPhone, normalizeEvaluationGroupProcedure,
} from "@/lib/whatsapp/evaluation-group-notice-config";

export type EvaluationGroupAppointment = {
  id: string;
  clientName: string;
  clientPhone: string | null;
  procedimento: string;
  evaluationProcedure?: string | null;
  unit: string;
  startTime: Date;
  createdAt: Date;
  updatedAt?: Date;
  status: string;
};

export function evaluationGroupSnapshot(appointment: EvaluationGroupAppointment) {
  const clientName = normalizeAppointmentClientName(appointment.clientName);
  const clientPhone = normalizeEvaluationGroupPhone(appointment.clientPhone);
  const evaluationProcedure = normalizeEvaluationGroupProcedure(appointment.evaluationProcedure);
  return clientName && clientPhone && evaluationProcedure ? { clientName, clientPhone, evaluationProcedure } : null;
}

export function isFutureGroupEvaluation(appointment: EvaluationGroupAppointment, now: Date) {
  return !!getEvaluationGroupUnitConfig(appointment.unit)
    && appointment.procedimento.trim().normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase() === "avaliacao"
    && Number.isFinite(appointment.createdAt.getTime()) && appointment.createdAt <= now
    && appointment.startTime > now;
}

export function isActiveGroupEvaluation(appointment: EvaluationGroupAppointment, now: Date) {
  return isFutureGroupEvaluation(appointment, now) && ["pendente", "confirmado", "nao_confirmou"].includes(appointment.status);
}

export function isGroupEvaluationCancelled(status: string) {
  return normalizeEvaluationStatus(status) === "desmarcou";
}
