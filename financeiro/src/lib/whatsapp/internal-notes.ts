export const WHATSAPP_INTERNAL_NOTE_MAX_LENGTH = 2000;
export const WHATSAPP_INTERNAL_NOTE_MAX_MENTIONS = 10;

type InternalNoteInput = {
  content: string;
  mentionedUserIds: string[];
};

type InternalNoteValidation =
  | { value: InternalNoteInput }
  | { error: string };

function uniqueTrimmedStrings(value: unknown): string[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return null;
  if (value.some((item) => typeof item !== "string")) return null;
  return [...new Set(value.map((item) => item.trim()).filter(Boolean))];
}

export function validateWhatsAppInternalNoteInput(input: unknown): InternalNoteValidation {
  if (!input || typeof input !== "object") {
    return { error: "Informe o conteúdo da nota interna" };
  }

  const record = input as Record<string, unknown>;
  const content = typeof record.content === "string" ? record.content.trim() : "";
  if (!content) return { error: "Informe o conteúdo da nota interna" };
  if (content.length > WHATSAPP_INTERNAL_NOTE_MAX_LENGTH) {
    return { error: `A nota interna pode ter até ${WHATSAPP_INTERNAL_NOTE_MAX_LENGTH} caracteres` };
  }

  const mentionedUserIds = uniqueTrimmedStrings(record.mentionedUserIds);
  if (!mentionedUserIds) return { error: "As menções informadas são inválidas" };
  if (mentionedUserIds.length > WHATSAPP_INTERNAL_NOTE_MAX_MENTIONS) {
    return { error: `Você pode mencionar até ${WHATSAPP_INTERNAL_NOTE_MAX_MENTIONS} pessoas por nota` };
  }

  return { value: { content, mentionedUserIds } };
}

export function unauthorizedWhatsAppInternalNoteMentionIds(
  requestedUserIds: string[],
  mentionableUserIds: Iterable<string>,
) {
  const allowed = new Set(mentionableUserIds);
  return requestedUserIds.filter((userId) => !allowed.has(userId));
}

export function whatsappInternalNoteNotificationLink(input: {
  conversationId: string;
  instanceId: string;
  instanceUnit?: string | null;
}) {
  const params = new URLSearchParams();
  if (input.instanceUnit && input.instanceUnit !== "Todas") {
    params.set("unit", input.instanceUnit);
  }
  params.set("targetInstanceId", input.instanceId);
  params.set("conversationId", input.conversationId);
  return `/crm/inbox?${params.toString()}`;
}
