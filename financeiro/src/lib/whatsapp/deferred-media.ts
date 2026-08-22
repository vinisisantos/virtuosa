export function whatsappDeferredMediaUrl(messageId: string, targetInstanceId?: string | null) {
  const params = new URLSearchParams({ mediaMessageId: messageId });
  if (targetInstanceId) params.set("targetInstanceId", targetInstanceId);

  return `/api/whatsapp/messages?${params.toString()}`;
}
