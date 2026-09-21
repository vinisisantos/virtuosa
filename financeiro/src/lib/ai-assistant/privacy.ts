function plainText(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ");
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
