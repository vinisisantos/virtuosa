export function buildEvolutionAudioPayload(params: {
  number: string;
  audio: string;
  replyId?: string | null;
}) {
  return {
    number: params.number,
    audio: params.audio,
    // Na Evolution, `encoding` ativa a conversão para OGG/Opus compatível
    // com voz no WhatsApp; não indica se a origem é base64 ou URL.
    encoding: true,
    ...(params.replyId ? { quoted: { key: { id: params.replyId } } } : {}),
  };
}
