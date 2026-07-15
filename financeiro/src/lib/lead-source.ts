export const NOT_LEAD_SOURCE = "nao_lead";

function normalizeSource(value?: string | null) {
  return (value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[\s-]+/g, "_");
}

export function isNotLeadSource(value?: string | null) {
  return [NOT_LEAD_SOURCE, "nao_e_lead"].includes(normalizeSource(value));
}

export function canonicalPipelineSource(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return "manual";
  return isNotLeadSource(trimmed) ? NOT_LEAD_SOURCE : trimmed;
}

export function formatLeadSource(value?: string | null) {
  if (!value) return "";
  return isNotLeadSource(value) ? "Não é lead" : value;
}
