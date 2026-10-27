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

function isRegisteredUnitContext(guard: UnitGuardResult, unit?: string) {
  return guard.permissions?.crm === true
    && ACTIVE_UNITS.some((activeUnit) => activeUnit === unit)
    && unit === guard.userUnit
    && unit === guard.unitFilter;
}

export function canManageAllEvaluations(guard: UnitGuardResult, unit?: string) {
  if (guard.isAdmin || guard.permissions?.admin === true
    || guard.permissions?.multiUnit === true || guard.permissions?.crmEvaluationsAll === true) return true;
  // A capacidade restrita exige a unidade real do registro, não só o filtro da requisição.
  return guard.permissions?.crmEvaluationsManageUnit === true && isRegisteredUnitContext(guard, unit);
}

export function canViewAllEvaluations(guard: UnitGuardResult, unit: string) {
  if (canManageAllEvaluations(guard, unit)) return true;
  // Consulta compartilhada não acompanha outras unidades liberadas no perfil.
  return guard.permissions?.crmEvaluationsViewUnit === true && isRegisteredUnitContext(guard, unit);
}

export function hasSharedEvaluationReadOnlyAccess(guard: UnitGuardResult) {
  return (guard.permissions?.crmEvaluationsViewUnit === true || guard.permissions?.crmEvaluationsManageUnit === true)
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
  evaluation: { unit: string; procedimento: string; notes?: string | null; profissional?: { name: string } | null },
  operation: "edit" | "delete" = "edit",
) {
  if (hasSharedEvaluationReadOnlyAccess(guard)
    && isEvaluationAppointment(evaluation.procedimento)
    && !(operation === "edit" && canManageAllEvaluations(guard, evaluation.unit))
    && !isOwnEvaluation(evaluation, { id: guard.userId, name: guard.userName })) {
    throw new EvaluationReadOnlyError();
  }
}
