const sentenceSegments = new Intl.Segmenter("pt-BR", { granularity: "sentence" });
const introductionPatterns = [
  /\b(?:(?:eu\s+)?sou|me chamo|meu nome e|aqui (?:quem fala )?e|quem fala e)\s+(?:a\s+)?(?:alice|claud[ei]nice)(?:\s*,?\s*(?:(?:a|sua|uma)\s+)?(?:atendente|assistente(?: virtual)?))?(?:\s*,?\s*(?:da|na)\s+(?:clinica\s+)?virtuosa)?/u,
  /\bsou\s+(?:(?:a|sua|uma)\s+)?(?:atendente|assistente(?: virtual)?)\s+(?:da|na)\s+(?:clinica\s+)?virtuosa\b/u,
  /\bseja\s+(?:muito\s+)?bem[- ]vind[ao](?:\([ao]\))?(?:\s+(?:a|na)\s+(?:clinica\s+)?virtuosa)?/u,
  /\b(?:darei|daremos|vou dar|vamos dar|irei dar|estarei dando)\s+(?:continuidade|seguimento|segmento)\s+(?:ao|no)\s+(?:seu|teu)\s+atendimento\b/u,
  /\b(?:vou|irei)\s+continuar\s+(?:o\s+)?(?:seu|teu)\s+atendimento\b/u,
];

function normalized(text: string): string {
  return text.normalize("NFKD").replace(/\p{Diacritic}/gu, "").toLowerCase()
    .replace(/[\p{Cf}*_~`]/gu, "").replace(/[\u2010-\u2015\u2212]/gu, "-").replace(/\s+/gu, " ").trim();
}

function words(text: string): string {
  return normalized(text).replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function greetingOnly(text: string, contactName: string | null): boolean {
  const value = words(text);
  const names = contactName ? [words(contactName), words(contactName).split(" ")[0]] : [];
  const greetings = ["ola", "oi", "bom dia", "boa tarde", "boa noite"];
  return ["tudo bem", "como vai", ...greetings, ...greetings.flatMap((greeting) => names.map((name) => `${greeting} ${name}`))].includes(value);
}

function hasRepeatedPresentation(text: string): boolean {
  const value = normalized(text);
  return introductionPatterns.some((pattern) => pattern.test(value));
}

export function containsPersonalPresentation(text: string): boolean {
  return introductionPatterns[0].test(normalized(text));
}

// Só apaga frases isoláveis; se apresentação e conteúdo útil se misturam, exige revisão.
export function stripRepeatedPresentation(text: string, contactName: string | null): {
  text: string; removed: boolean; ambiguous: boolean;
} {
  const segments = text.split(/(\n[\t ]*\n+)/u).flatMap((paragraph) =>
    /^\n[\t ]*\n+/u.test(paragraph) ? [paragraph] : [...sentenceSegments.segment(paragraph)].map(({ segment }) => segment));
  const removed = new Set<number>();
  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index];
    if (!hasRepeatedPresentation(segment)) continue;
    const residual = words(introductionPatterns.reduce((remaining, pattern) =>
      remaining.replace(new RegExp(pattern.source, "gu"), " "), normalized(segment))).replace(/^e\b/u, "").trim();
    const name = contactName && words(contactName);
    if (residual && residual !== name && residual !== name?.split(" ")[0]) return { text, removed: false, ambiguous: true };
    removed.add(index);
    for (let previous = index - 1; previous >= 0 && (removed.has(previous) || !segments[previous].trim()
      || greetingOnly(segments[previous], contactName)); previous--) removed.add(previous);
  }
  return { text: segments.filter((_, index) => !removed.has(index)).join("").trim(), removed: removed.size > 0, ambiguous: false };
}
