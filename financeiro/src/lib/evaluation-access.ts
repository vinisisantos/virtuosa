import { evaluationAssignedUserMarker, normalizeEvaluationText } from "@/lib/evaluation-scheduling";
import type { UnitGuardResult } from "@/lib/unit-guard";
import { ACTIVE_UNITS } from "@/lib/role-access";
import { isEvaluationAppointment } from "@/lib/evaluation-procedure";

export function isOwnEvaluation(
  agendamento: { notes?: string | null; profissional?: { name: string } | null },
  user: { id: string; name: string },
) {
  if (agendamento.notes?.includes(evaluationAssignedUserMarker(user.id))) return true;
  const userName = normalizeEvaluationText(user.name);
  const professionalName = normalizeEvaluationText(agendamento.profissional?.name);
  if (!userName || !professionalName) return false;
  const userTokens = userName.split(/\s+/).filter((token) => token.length >= 3);
  return userTokens.some((token) => professionalName.includes(token));
}

export function canManageAllEvaluations(guard: UnitGuardResult) {
  return guard.isAdmin || guard.permissions?.admin === true
    || guard.permissions?.multiUnit === true || guard.permissions?.crmEvaluationsAll === true;
}

export function canViewAllEvaluations(guard: UnitGuardResult, unit: string) {
  if (canManageAllEvaluations(guard)) return true;
  // Consulta compartilhada não acompanha outras unidades liberadas no perfil.
  return guard.permissions?.crm === true
    && guard.permissions?.crmEvaluationsViewUnit === true
    && ACTIVE_UNITS.some((activeUnit) => activeUnit === unit)
    && unit === guard.userUnit
    && unit === guard.unitFilter;
}

export function hasSharedEvaluationReadOnlyAccess(guard: UnitGuardResult) {
  return guard.permissions?.crmEvaluationsViewUnit === true
    && guard.permissions?.agenda !== true
    && !canManageAllEvaluations(guard);
}

export class EvaluationReadOnlyError extends Error {
  constructor() {
    super("Você só pode atualizar avaliações atribuídas a você.");
    this.name = "EvaluationReadOnlyError";
  }
}

export function enforceSharedEvaluationWriteAccess(
  guard: UnitGuardResult,
  evaluation: { procedimento: string; notes?: string | null; profissional?: { name: string } | null },
) {
  if (hasSharedEvaluationReadOnlyAccess(guard)
    && isEvaluationAppointment(evaluation.procedimento)
    && !isOwnEvaluation(evaluation, { id: guard.userId, name: guard.userName })) {
    throw new EvaluationReadOnlyError();
  }
}
