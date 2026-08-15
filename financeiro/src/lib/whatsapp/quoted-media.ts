interface QuotedMediaMessage {
  messageId?: string | null;
  type: string;
  mediaUrl?: string | null;
}

interface QuotedMediaItem {
  kind: "message" | "album";
  id: string;
  message: QuotedMediaMessage;
  images?: QuotedMediaMessage[];
}

export interface QuotedImagePreviewTarget {
  itemId: string;
  sources: string[];
  index: number;
}

export function findQuotedImagePreviewTarget(
  items: readonly QuotedMediaItem[],
  quotedMessageId: string,
): QuotedImagePreviewTarget | null {
  for (let itemIndex = items.length - 1; itemIndex >= 0; itemIndex -= 1) {
    const item = items[itemIndex];

    if (item.kind === "album" && item.images) {
      const quotedImage = item.images.find((image) => image.messageId === quotedMessageId);
      if (!quotedImage?.mediaUrl) continue;

      const sources = item.images.flatMap((image) => image.mediaUrl ? [image.mediaUrl] : []);
      const index = sources.indexOf(quotedImage.mediaUrl);
      if (index >= 0) return { itemId: item.id, sources, index };
      continue;
    }

    if (
      item.message.messageId === quotedMessageId
      && item.message.type === "image"
      && item.message.mediaUrl
    ) {
      return { itemId: item.id, sources: [item.message.mediaUrl], index: 0 };
    }
  }

  return null;
}
