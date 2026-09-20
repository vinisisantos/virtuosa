export const COMMERCIAL_STATUSES = [
  { value: "active", label: "Em atendimento" },
  { value: "later", label: "Retomar depois" },
  { value: "nurture", label: "Nutrição / interesse futuro" },
  { value: "no_response", label: "Sem resposta" },
  { value: "lost", label: "Negociação perdida" },
  { value: "unqualified", label: "Não qualificado" },
] as const;
export type CommercialStatus = typeof COMMERCIAL_STATUSES[number]["value"];
export const COMMERCIAL_REASONS = [
  { value: "budget", label: "Sem orçamento agora" },
  { value: "price", label: "Preço / condições de pagamento" },
  { value: "timing", label: "Momento inoportuno" },
  { value: "schedule", label: "Indisponibilidade de agenda" },
  { value: "distance", label: "Distância / localização" },
  { value: "no_response", label: "Sem resposta — motivo desconhecido" },
  { value: "competitor", label: "Escolheu outra clínica" },
  { value: "no_interest", label: "Sem interesse" },
  { value: "service", label: "Serviço não oferecido" },
  { value: "invalid_contact", label: "Contato inválido" },
  { value: "other", label: "Outro motivo" },
] as const;
export const PAUSED_COMMERCIAL_STATUSES = ["later", "nurture", "lost", "unqualified"];
export function pausesCommercialCallbacks(status?: string | null) {
  return PAUSED_COMMERCIAL_STATUSES.includes(status || "");
}
export function isCommercialClosed(status?: string | null) {
  return status === "lost" || status === "unqualified";
}
export function commercialLabel(status?: string | null) {
  return COMMERCIAL_STATUSES.find((item) => item.value === status)?.label || "Sem classificação";
}
export function commercialReasonLabel(reason?: string | null) {
  return COMMERCIAL_REASONS.find((item) => item.value === reason)?.label || reason || "";
}
export type CommercialDraft = { status: string; reason: string; note: string; nextContactAt: string | null };
export function validateCommercialDraft(value: unknown, now = new Date()) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { error: "Classificação inválida" } as const;
  const input = value as Record<string, unknown>;
  const status = COMMERCIAL_STATUSES.find((item) => item.value === input.status)?.value;
  if (!status) return { error: "Selecione uma situação comercial válida" } as const;
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  const note = typeof input.note === "string" ? input.note.trim() : "";
  if (status !== "active" && !COMMERCIAL_REASONS.some((item) => item.value === reason)) {
    return { error: "Selecione o motivo da classificação" } as const;
  }
  if (status === "no_response" && reason !== "no_response") {
    return { error: "Sem resposta deve manter o motivo desconhecido, sem presumir a causa" } as const;
  }
  if (status !== "active" && note.length < 3) return { error: "Registre uma observação breve" } as const;
  if (note.length > 500) return { error: "A observação deve ter até 500 caracteres" } as const;
  const nextContactAt = status === "later" && typeof input.nextContactAt === "string" ? new Date(input.nextContactAt) : null;
  if (status === "later" && (!nextContactAt || !Number.isFinite(nextContactAt.getTime()) || nextContactAt <= now)) {
    return { error: "Informe uma data e horário futuros para retomar" } as const;
  }
  return { data: {
    commercialStatus: status,
    commercialReason: status === "active" ? null : reason,
    commercialNote: note || null,
    nextContactAt,
  } } as const;
}
