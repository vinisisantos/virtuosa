function plainText(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ");
}

const PERSON_PLACEHOLDER = /(?:\[|\{|<)\s*(?:pessoa|nome(?:\s+da\s+pessoa)?|cliente)\s*(?:\]|\}|>)/giu;

export function resolveAiAssistantContactName(value: string | null | undefined) {
  const normalized = plainText(value || "");
  if (!normalized || normalized.length > 80 || /\d{5,}/.test(normalized)) return null;

  const normalizedComparable = normalized.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  if (/^(?:sem nome|nome desconhecido|contato desconhecido)$/.test(normalizedComparable)) return null;
  const firstName = normalized.match(/^\p{L}[\p{L}\p{M}'’.\-]*/u)?.[0]?.replace(/[.]+$/g, "") || "";
  const comparable = firstName.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  if (/^(?:cliente|contato|desconhecid[oa]|unknown|numero|telefone|lid)$/.test(comparable)) return null;
  return firstName.length >= 2 ? firstName : null;
}

export function personalizeAiAssistantResponse(value: string, savedContactName?: string | null) {
  const contactName = resolveAiAssistantContactName(savedContactName);
  let personalized = value.normalize("NFKC").trim();

  personalized = contactName
    ? personalized.replace(PERSON_PLACEHOLDER, contactName)
    : personalized.replace(PERSON_PLACEHOLDER, "");

  personalized = personalized
    .replace(/,\s*([!?])/g, "$1")
    .replace(/[ \t]+([,;:.!?])/g, "$1")
    .replace(/(^|\n)\s*[,;:!?.-]+\s*/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .trim();

  return personalized.replace(/\p{L}/u, (letter) => letter.toLocaleUpperCase("pt-BR"));
}

export function sanitizeAiAssistantText(value: string, names: string[] = []) {
  let sanitized = plainText(value)
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[email]")
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[documento]")
    .replace(/(?:\+?\d[\d ().-]{8,}\d)/g, "[telefone]")
    .replace(/https?:\/\/\S+/g, "[link]");

  for (const name of names.filter((candidate) => candidate.trim().length > 2)) {
    const escaped = name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    sanitized = sanitized.replace(new RegExp(`\\b${escaped}\\b`, "gi"), "[pessoa]");
  }

  return sanitized.slice(0, 1_000);
}
