export const SAVED_REPLY_TITLE_MAX_LENGTH = 80;
export const SAVED_REPLY_CONTENT_MAX_LENGTH = 4096;
export const SAVED_REPLY_MAX_PER_USER = 100;

export function normalizeSavedReplyTitle(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("pt-BR");
}

export function validateSavedReplyInput(input: unknown) {
  const record = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const title = typeof record.title === "string" ? record.title.trim().replace(/\s+/g, " ") : "";
  const content = typeof record.content === "string" ? record.content.trim() : "";

  if (!title) return { error: "Informe um nome para a resposta" } as const;
  if (title.length > SAVED_REPLY_TITLE_MAX_LENGTH) {
    return { error: `O nome pode ter até ${SAVED_REPLY_TITLE_MAX_LENGTH} caracteres` } as const;
  }
  if (!content) return { error: "Informe o texto da resposta" } as const;
  if (content.length > SAVED_REPLY_CONTENT_MAX_LENGTH) {
    return { error: `A mensagem pode ter até ${SAVED_REPLY_CONTENT_MAX_LENGTH} caracteres` } as const;
  }

  return {
    value: {
      title,
      normalizedTitle: normalizeSavedReplyTitle(title),
      content,
    },
  } as const;
}
