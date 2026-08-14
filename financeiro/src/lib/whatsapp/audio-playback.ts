interface MediaMessage {
  id: string;
  mediaUrl?: string | null;
}

export function preserveActiveAudioMediaUrl<T extends MediaMessage>(
  currentMessages: T[],
  nextMessages: T[],
  activeMessageId: string | null,
) {
  if (!activeMessageId) return nextMessages;

  const activeMessage = currentMessages.find((message) => message.id === activeMessageId);
  if (!activeMessage?.mediaUrl) return nextMessages;

  return nextMessages.map((message) => (
    message.id === activeMessageId && message.mediaUrl !== activeMessage.mediaUrl
      ? { ...message, mediaUrl: activeMessage.mediaUrl }
      : message
  ));
}
