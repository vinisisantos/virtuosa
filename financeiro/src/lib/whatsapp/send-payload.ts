type WhatsAppSendPayload = {
  body?: unknown;
  contactId?: unknown;
  conversationId?: unknown;
  file?: unknown;
};

function hasText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

export function validateWhatsAppSendPayload(payload: WhatsAppSendPayload) {
  if (!hasText(payload.conversationId) && !hasText(payload.contactId)) {
    return "Conversa ou contato não informado";
  }

  if (!hasText(payload.body) && !hasText(payload.file)) {
    return "Digite uma mensagem ou adicione um arquivo";
  }

  return null;
}
