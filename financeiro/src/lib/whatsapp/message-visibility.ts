type VisibleMessage = {
  body?: string | null;
  type: string;
  mediaUrl?: string | null;
  mediaPayloadOmitted?: boolean;
  linkPreviewUrl?: string | null;
  fromMe: boolean;
};

export function messageHasVisibleContent(message: VisibleMessage) {
  if (message.body?.trim() || message.linkPreviewUrl || message.mediaPayloadOmitted) return true;
  if (!message.mediaUrl) {
    return !message.fromMe && ["image", "audio", "sticker"].includes(message.type);
  }
  if (message.mediaUrl.startsWith("data:image/")) return true;
  return ["image", "audio", "ptt", "video", "document", "sticker"].includes(message.type);
}

export function isRenderableImageMedia(type: string, mediaUrl?: string | null) {
  return Boolean(mediaUrl && (
    type === "image" || type === "sticker" || mediaUrl.startsWith("data:image/")
  ));
}
