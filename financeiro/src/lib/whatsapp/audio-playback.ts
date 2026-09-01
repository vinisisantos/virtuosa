interface MediaMessage {
  id: string;
  mediaUrl?: string | null;
}

export const AUDIO_PLAYBACK_RATES = [1, 1.5, 2] as const;
export type AudioPlaybackRate = (typeof AUDIO_PLAYBACK_RATES)[number];

export function nextAudioPlaybackRate(currentRate: number): AudioPlaybackRate {
  const currentIndex = AUDIO_PLAYBACK_RATES.findIndex((rate) => rate === currentRate);
  return AUDIO_PLAYBACK_RATES[(currentIndex + 1) % AUDIO_PLAYBACK_RATES.length];
}

export function audioPlaybackRateLabel(rate: AudioPlaybackRate) {
  return `${String(rate).replace(".", ",")}x`;
}

export function formatAudioDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const rounded = Math.floor(seconds);
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}`;
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
