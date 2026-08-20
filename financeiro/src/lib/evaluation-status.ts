export const EVALUATION_STATUS_VALUES = [
  "pendente",
  "confirmado",
  "nao_confirmou",
  "compareceu",
  "fechou_pacote",
  "nao_fechou",
  "nao_compareceu",
  "nao_respondeu",
] as const;

export type EvaluationStatus = (typeof EVALUATION_STATUS_VALUES)[number];

export const EVALUATION_STATUS_ACTION_VALUES = [
  "pendente",
  "confirmado",
  "nao_confirmou",
  "fechou_pacote",
  "nao_fechou",
  "nao_compareceu",
  "nao_respondeu",
] as const satisfies readonly EvaluationStatus[];

export const EVALUATION_STATUS_LABELS: Record<EvaluationStatus, string> = {
  pendente: "Pendente",
  confirmado: "Confirmado",
  nao_confirmou: "Não confirmou",
  compareceu: "Compareceu",
  fechou_pacote: "Fechou pacote",
  nao_fechou: "Não fechou",
  nao_compareceu: "Não compareceu",
  nao_respondeu: "Não respondeu",
};

const EVALUATION_STATUS_SET = new Set<string>(EVALUATION_STATUS_VALUES);

function normalizeKey(value?: string | null) {
  return (value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[\s-]+/g, "_");
}

export function isEvaluationStatus(value: unknown): value is EvaluationStatus {
  return typeof value === "string" && EVALUATION_STATUS_SET.has(value);
}

export function normalizeEvaluationStatus(value?: string | null): EvaluationStatus {
  const key = normalizeKey(value);

  if (key === "falta" || key === "ausente" || key === "no_show") return "nao_compareceu";
  if (key === "sem_resposta" || key === "nao_responde") return "nao_respondeu";
  if (key === "nao_confirmado" || key === "sem_confirmacao") return "nao_confirmou";
  if (key === "finalizado" || key === "concluido" || key === "concluida") return "pendente";
  if (key === "em_atendimento") return "pendente";
  if (isEvaluationStatus(key)) return key;

  return "pendente";
}

export function isPendingEvaluationStatus(value?: string | null) {
  return normalizeEvaluationStatus(value) === "pendente";
}

export function isConfirmedEvaluationStatus(value?: string | null) {
  return normalizeEvaluationStatus(value) === "confirmado";
}

export function isAttendedEvaluationStatus(value?: string | null) {
  return ["compareceu", "fechou_pacote", "nao_fechou"].includes(normalizeEvaluationStatus(value));
}

export function isFinalEvaluationStatus(value?: string | null) {
  return ["fechou_pacote", "nao_fechou", "nao_compareceu", "nao_respondeu"].includes(normalizeEvaluationStatus(value));
}

export function isClosedPackageEvaluationStatus(value?: string | null) {
  return normalizeEvaluationStatus(value) === "fechou_pacote";
}

export function isNotClosedEvaluationStatus(value?: string | null) {
  return normalizeEvaluationStatus(value) === "nao_fechou";
}

export function isNoShowEvaluationStatus(value?: string | null) {
  return normalizeEvaluationStatus(value) === "nao_compareceu";
}

export function isNoResponseEvaluationStatus(value?: string | null) {
  return normalizeEvaluationStatus(value) === "nao_respondeu";
}
