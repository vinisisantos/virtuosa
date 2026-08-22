export const WHATSAPP_INLINE_MEDIA_PAYLOAD_BUDGET = 2_500_000;

type MessageWithMedia = {
  mediaUrl?: string | null;
  mediaPayloadOmitted?: boolean;
};

export type InlineMediaByteRange = {
  start: number;
  end: number;
  partial: boolean;
};

function isInlineMediaUrl(value?: string | null) {
  return Boolean(value?.startsWith("data:"));
}

export function parseInlineMediaDataUrl(value?: string | null) {
  const match = /^data:([^;,]+)(?:;[^,]*)?;base64,([\s\S]+)$/i.exec(value || "");
  if (!match) return null;

  try {
    const bytes = Uint8Array.from(Buffer.from(match[2], "base64"));
    if (!bytes.byteLength) return null;
    return { mimeType: match[1], bytes };
  } catch {
    return null;
  }
}

export function resolveInlineMediaByteRange(
  header: string | null,
  totalBytes: number,
): InlineMediaByteRange | null {
  if (!Number.isSafeInteger(totalBytes) || totalBytes <= 0) return null;
  if (!header) return { start: 0, end: totalBytes - 1, partial: false };

  const match = /^bytes=(\d*)-(\d*)$/i.exec(header.trim());
  if (!match || (!match[1] && !match[2])) return null;

  let start: number;
  let end: number;

  if (!match[1]) {
    const suffixLength = Number.parseInt(match[2], 10);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null;
    start = Math.max(0, totalBytes - suffixLength);
    end = totalBytes - 1;
  } else {
    start = Number.parseInt(match[1], 10);
    end = match[2] ? Number.parseInt(match[2], 10) : totalBytes - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) return null;
    if (start < 0 || start >= totalBytes || end < start) return null;
    end = Math.min(end, totalBytes - 1);
  }

  return { start, end, partial: true };
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
