import {
  getEvaluationGroupUnitConfig,
  normalizeEvaluationGroupProcedure,
} from "@/lib/whatsapp/evaluation-group-notice-config";

export { normalizeEvaluationGroupProcedure as normalizeEvaluationProcedure };

export function usesEvaluationProcedure(unit?: string | null, sourceInstanceId?: string | null) {
  const scope = getEvaluationGroupUnitConfig(unit);
  return !!scope && (!sourceInstanceId || sourceInstanceId === scope.instanceId);
}

export function isEvaluationAppointment(procedure: unknown) {
  return typeof procedure === "string"
    && procedure.normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase() === "avaliacao";
}
