export const WHATSAPP_INLINE_MEDIA_PAYLOAD_BUDGET = 2_500_000;

type MessageWithMedia = {
  mediaUrl?: string | null;
  mediaPayloadOmitted?: boolean;
};

function isInlineMediaUrl(value?: string | null) {
  return Boolean(value?.startsWith("data:"));
}

/**
 * Mídias antigas recebidas antes do Blob ficam salvas como data URL. Uma única
 * conversa pode ultrapassar o limite de resposta da Vercel, embora os textos
 * sejam pequenos. Mantemos todas as mensagens e priorizamos as mídias mais
 * recentes dentro de um orçamento seguro para o JSON do inbox.
 */
export function constrainInlineMediaPayload<T extends MessageWithMedia>(
  messages: T[],
  budget = WHATSAPP_INLINE_MEDIA_PAYLOAD_BUDGET,
): Array<T & { mediaPayloadOmitted?: boolean }> {
  let remaining = Math.max(0, budget);
  const constrained = new Array<T & { mediaPayloadOmitted?: boolean }>(messages.length);

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    const mediaLength = isInlineMediaUrl(message.mediaUrl) ? message.mediaUrl!.length : 0;

    if (mediaLength > remaining) {
      constrained[index] = {
        ...message,
        mediaUrl: null,
        mediaPayloadOmitted: true,
      };
      continue;
    }

    remaining -= mediaLength;
    constrained[index] = message;
  }

  return constrained;
}
