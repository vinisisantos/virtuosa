import { evaluationAssignedUserMarker, normalizeEvaluationText } from "@/lib/evaluation-scheduling";
import type { UnitGuardResult } from "@/lib/unit-guard";

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
