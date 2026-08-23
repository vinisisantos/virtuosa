export const SAVED_REPLY_TITLE_MAX_LENGTH = 80;
export const SAVED_REPLY_CONTENT_MAX_LENGTH = 4096;
export const SAVED_REPLY_MAX_PER_USER = 100;
export const SAVED_REPLY_CATEGORY_TITLE_MAX_LENGTH = 60;
export const SAVED_REPLY_CATEGORY_MAX_PER_USER = 30;

export function validateSavedReplyOrderInput(input: unknown) {
  const record = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const ids = Array.isArray(record.ids)
    ? record.ids.filter((id): id is string => typeof id === "string").map((id) => id.trim()).filter(Boolean)
    : [];

  if (ids.length === 0) return { error: "Informe a ordem das respostas rápidas" } as const;
  if (ids.length > SAVED_REPLY_MAX_PER_USER) {
    return { error: `A ordem pode conter até ${SAVED_REPLY_MAX_PER_USER} respostas` } as const;
  }
  if (new Set(ids).size !== ids.length) {
    return { error: "A ordem contém respostas repetidas" } as const;
  }

  return { value: { ids } } as const;
}

export function reorderSavedRepliesByVisibleIds<T extends { id: string }>(
  replies: T[],
  orderedVisibleIds: string[],
) {
  const replyById = new Map(replies.map((reply) => [reply.id, reply]));
  const visibleIds = new Set(orderedVisibleIds);
  if (visibleIds.size !== orderedVisibleIds.length) return replies;
  if (orderedVisibleIds.some((id) => !replyById.has(id))) return replies;

  let visibleIndex = 0;
  return replies.map((reply) => {
    if (!visibleIds.has(reply.id)) return reply;
    const nextReply = replyById.get(orderedVisibleIds[visibleIndex]);
    visibleIndex += 1;
    return nextReply || reply;
  });
}

export function normalizeSavedReplyTitle(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("pt-BR");
}

export const normalizeSavedReplyCategoryTitle = normalizeSavedReplyTitle;

export function savedReplyIsAvailableInCategory(
  replyCategoryId: string | null,
  categoryId: string,
) {
  return !replyCategoryId || replyCategoryId === categoryId;
}

function savedReplyProcedureKey(value: string) {
  const normalized = normalizeSavedReplyCategoryTitle(value)
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  if (/\bgluteos?\b/.test(normalized) && /\bperfeit[oa]s?\b/.test(normalized) && /\b120\s*ml\b/.test(normalized)) {
    return "gluteos-perfeito-120ml";
  }
  if (/\bcombo\b/.test(normalized) && /\bharmonizacao\b/.test(normalized)) {
    return "combo-harmonizacao";
  }
  if (
    (/\badeus\b/.test(normalized) && /\brosto\b/.test(normalized) && /\bcansado\b/.test(normalized))
    || (/\bmicrofocado\b/.test(normalized) && /\bbioestimulador\b/.test(normalized))
  ) {
    return "adeus-rosto-cansado";
  }
  if (/\bharmonizacao\b/.test(normalized) && /\bgluteos?\b/.test(normalized)) {
    return "harmonizacao-gluteos";
  }
  if (/\bgluteos?\b/.test(normalized) && /\bperfeit[oa]s?\b/.test(normalized)) {
    return "gluteos-perfeito";
  }
  if (/\bbarriga\b/.test(normalized) && /\btrincad[ao]s?\b/.test(normalized)) {
    return "barriga-trincada";
  }
  if (/\bpreenchimento\b/.test(normalized) && /\bfacial\b/.test(normalized)) {
    return "preenchimento-facial";
  }
  if (/\bbotox\b/.test(normalized)) return "botox";
  if (/\bmonji\s*fast\b/.test(normalized)) return "monjifast";

  return normalized;
}

export function savedReplyCategoryIdsForCampaign(
  campaignName: string | null | undefined,
  categories: Array<{ id: string; title: string }>,
) {
  if (!campaignName?.trim()) return null;

  const campaignKey = savedReplyProcedureKey(campaignName);
  return categories
    .filter((category) => savedReplyProcedureKey(category.title) === campaignKey)
    .map((category) => category.id);
}

export function filterSavedRepliesByCampaign<T extends { categoryId: string | null }>(
  replies: T[],
  campaignName: string | null | undefined,
  categories: Array<{ id: string; title: string }>,
) {
  const categoryIds = savedReplyCategoryIdsForCampaign(campaignName, categories);
  if (categoryIds === null) return replies;

  const allowedCategoryIds = new Set(categoryIds);
  return replies.filter((reply) => !reply.categoryId || allowedCategoryIds.has(reply.categoryId));
}

export function validateSavedReplyCategoryInput(input: unknown) {
  const record = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const title = typeof record.title === "string" ? record.title.trim().replace(/\s+/g, " ") : "";

  if (!title) return { error: "Informe um nome para a categoria" } as const;
  if (title.length > SAVED_REPLY_CATEGORY_TITLE_MAX_LENGTH) {
    return { error: `O nome pode ter até ${SAVED_REPLY_CATEGORY_TITLE_MAX_LENGTH} caracteres` } as const;
  }

  return {
    value: {
      title,
      normalizedTitle: normalizeSavedReplyCategoryTitle(title),
    },
  } as const;
}

export function validateSavedReplyInput(input: unknown) {
  const record = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const title = typeof record.title === "string" ? record.title.trim().replace(/\s+/g, " ") : "";
  const content = typeof record.content === "string" ? record.content.trim() : "";
  const categoryId = typeof record.categoryId === "string" && record.categoryId.trim()
    ? record.categoryId.trim()
    : null;

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
      categoryId,
    },
  } as const;
}
