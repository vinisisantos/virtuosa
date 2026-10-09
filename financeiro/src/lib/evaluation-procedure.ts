import {
  EVALUATION_GROUP_INSTANCE_ID,
  normalizeEvaluationGroupProcedure,
} from "@/lib/whatsapp/evaluation-group-notice-config";

export { normalizeEvaluationGroupProcedure as normalizeEvaluationProcedure };

export function usesEvaluationProcedure(unit?: string | null, sourceInstanceId?: string | null) {
  return unit === "SBC" && (!sourceInstanceId || sourceInstanceId === EVALUATION_GROUP_INSTANCE_ID);
}

export function isEvaluationAppointment(procedure: unknown) {
  return typeof procedure === "string"
    && procedure.normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase() === "avaliacao";
}
