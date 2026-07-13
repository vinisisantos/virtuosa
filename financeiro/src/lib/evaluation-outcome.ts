export const EVALUATION_NOT_CLOSED_REASONS = [
  "Preço acima do esperado",
  "Forma de pagamento",
  "Vai pensar",
  "Sem interesse no momento",
  "Contraindicação ou inelegibilidade",
  "Escolheu outra clínica",
  "Outro",
] as const;

export const EVALUATION_NO_SHOW_REASONS = [
  "Não respondeu",
  "Imprevisto pessoal",
  "Esqueceu o agendamento",
  "Conflito de horário ou localização",
  "Desistiu",
  "Outro",
] as const;

export function buildEvaluationReason(reason?: string | null, details?: string | null) {
  const normalizedReason = (reason || "").trim();
  const normalizedDetails = (details || "").trim();
  if (!normalizedReason) return "";
  if (normalizedReason !== "Outro") return normalizedReason;
  return normalizedDetails ? `Outro: ${normalizedDetails}` : "";
}
