const introduction = "Olá, [pessoa]! Tudo bem? Sou a Alice, atendente da Virtuosa, e vou dar seguimento ao seu atendimento.";

export function containsAliceIntroduction(text: string) {
  const normalized = text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  return /\b(?:sou|me chamo|meu nome e)\s+(?:a\s+)?alice\b/u.test(normalized);
}

export function sbcConversationPresentation(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const prompt = input as Record<string, unknown>;
  if (prompt.UNIDADE !== "SBC") return null;
  const dialogue = Array.isArray(prompt.CONVERSA) ? prompt.CONVERSA : [];
  const introduced = dialogue.some((message) => message?.role === "atendente" && typeof message.text === "string" && containsAliceIntroduction(message.text));
  return { introduced, introduction };
}
