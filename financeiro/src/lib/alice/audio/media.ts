import { Input, BufferSource, OGG, WEBM, WAVE, MP3, MP4, FLAC } from "mediabunny";
import { createPrivateBlobReadUrl, privateBlobPathname } from "@/lib/whatsapp/media-storage";

export const ALICE_AUDIO_MAX_BYTES = 8 * 1024 * 1024;
export const ALICE_AUDIO_MAX_SECONDS = 300;
export type AliceAudioMedia = { id: string; conversationId: string; mediaUrl: string | null; mediaSizeBytes: number | null };

/** Só recebe o objeto lido no banco; nunca aceita URL de um pedido do navegador. */
export async function readAlicePrivateAudio(message: AliceAudioMedia): Promise<Uint8Array> {
  const path = privateBlobPathname(message.mediaUrl);
  if (path !== `whatsapp/${message.conversationId}/inbound/${message.id}`) throw new Error("audio_private_media_unavailable");
  if (message.mediaSizeBytes && message.mediaSizeBytes > ALICE_AUDIO_MAX_BYTES) throw new Error("audio_size_limit");
  const response = await fetch(await createPrivateBlobReadUrl(message.mediaUrl!), {
    signal: AbortSignal.timeout(10_000), redirect: "error", cache: "no-store",
  });
  if (!response.ok || !response.body) throw new Error("audio_download_failed");
  const reader = response.body.getReader();
  const parts: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.byteLength;
      if (length > ALICE_AUDIO_MAX_BYTES) throw new Error("audio_size_limit");
      parts.push(part.value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  if (!length) throw new Error("audio_empty");
  return Buffer.concat(parts);
}

/** Lê o contêiner real em memória, sem FFmpeg, decodificação ou confiar na duração do webhook. */
export async function inspectAliceAudio(bytes: Uint8Array) {
  if (!bytes.byteLength || bytes.byteLength > ALICE_AUDIO_MAX_BYTES) throw new Error("audio_size_limit");
  const formats = [OGG, WEBM, WAVE, MP3, MP4, FLAC];
  const input = new Input({ source: new BufferSource(bytes), formats });
  try {
    const format = await input.getFormat();
    const audio = await input.getPrimaryAudioTrack();
    if (!audio || (await input.getVideoTracks()).length) throw new Error("audio_format_unsupported");
    const seconds = await input.computeDuration();
    if (!Number.isFinite(seconds) || seconds <= 0 || seconds > ALICE_AUDIO_MAX_SECONDS) throw new Error("audio_duration_limit");
    const extensions = ["ogg", "webm", "wav", "mp3", "m4a", "flac"];
    const extension = extensions[formats.indexOf(format)];
    if (!extension) throw new Error("audio_format_unsupported");
    return { durationMs: Math.ceil(seconds * 1000), file: new File([Uint8Array.from(bytes)], `audio.${extension}`, { type: (await input.getMimeType()).split(";")[0] }) };
  } finally { input.dispose(); }
}
