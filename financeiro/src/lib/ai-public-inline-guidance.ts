export type AiPublicInlineGuidance = {
  matched: boolean;
  guidance: string | null;
  error: string | null;
};

export function parseAiPublicInlineGuidance(value: string): AiPublicInlineGuidance {
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
    return { matched: false, guidance: null, error: null };
  }

  const guidance = trimmed.slice(1, -1).trim();
  if (guidance.length < 5) {
    return {
      matched: true,
      guidance: null,
      error: "Escreva uma orientação com pelo menos 5 caracteres dentro das chaves.",
    };
  }
  if (guidance.length > 1000) {
    return {
      matched: true,
      guidance: null,
      error: "A orientação entre chaves deve ter no máximo 1000 caracteres.",
    };
  }

  return { matched: true, guidance, error: null };
}
