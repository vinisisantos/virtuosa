import { isGenericCampaignName } from "@/lib/campaign-labels";
import { isEvaluationAppointment, normalizeEvaluationProcedure } from "@/lib/evaluation-procedure";

type ProcedureDraftSource = {
  evaluationProcedure?: string | null;
  procedureNames?: string[];
  procedureName?: string | null;
  campaignName?: string | null;
};

// Call only when opening a form or selecting a contact. A draft is confirmed by saving.
export function evaluationProcedureDraft(source: ProcedureDraftSource) {
  const persisted = normalizeEvaluationProcedure(source.evaluationProcedure);
  if (persisted) return persisted;
  const explicit = (source.procedureNames?.length ? source.procedureNames : [source.procedureName])
    .filter((value): value is string => Boolean(value && !isEvaluationAppointment(value)))
    .map((value) => normalizeEvaluationProcedure(value)).filter(Boolean).join(" · ");
  if (explicit) return normalizeEvaluationProcedure(explicit) || "";
  const campaign = source.campaignName;
  if (!campaign || isGenericCampaignName(campaign) || /\{\{.*?\}\}/.test(campaign)) return "";
  return normalizeEvaluationProcedure(campaign) || "";
}
