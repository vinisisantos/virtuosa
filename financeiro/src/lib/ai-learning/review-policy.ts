import { AiLearningError } from "@/lib/ai-learning/policy";

export type AiLearningReviewAction = "edit" | "approve" | "reject";

export function validateAiLearningReviewInput(input: {
  action?: unknown;
  confirmed?: unknown;
  clinicalConfirmed?: unknown;
}, clinical: boolean) {
  if (!new Set<unknown>(["edit", "approve", "reject"]).has(input.action)) {
    throw new AiLearningError("Ação de revisão inválida");
  }
  if (input.action === "approve" && input.confirmed !== true) {
    throw new AiLearningError("Confirme que o conteúdo está geral, correto e sem dados pessoais");
  }
  if (input.action === "approve" && clinical && input.clinicalConfirmed !== true) {
    throw new AiLearningError("Conteúdo clínico exige confirmação técnica explícita");
  }
  return input.action as AiLearningReviewAction;
}
