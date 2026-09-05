export function isWebmAudio(mimeType?: string | null, url?: string | null, fileName?: string | null) {
  return Boolean(
    mimeType?.toLowerCase().split(";")[0].trim() === "audio/webm"
    || /^data:audio\/webm[;,]/i.test(url || "")
    || /\.webm(?:[?#]|$)/i.test(fileName || url || ""),
  );
}

export function audioPlaybackErrorMessage(error?: unknown) {
  if (error instanceof Error && error.name === "NotAllowedError") {
    return "Áudio pronto. Toque em reproduzir para ouvir.";
  }
  return "Não foi possível reproduzir o áudio. Toque em reproduzir para tentar novamente.";
}

export async function remuxWebmAudioForPlayback(blob: Blob, signal?: AbortSignal): Promise<Blob> {
  // Copia os pacotes Opus sem decodificar/regravar a voz. Carregado só ao ouvir WebM.
  const { Input, BlobSource, WEBM, Output, OggOutputFormat, BufferTarget, EncodedPacketSink, EncodedAudioPacketSource } = await import("mediabunny");
  signal?.throwIfAborted();
  const input = new Input({ source: new BlobSource(blob), formats: [WEBM] });
  const target = new BufferTarget();
  const output = new Output({ format: new OggOutputFormat(), target });

  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track || await track.getCodec() !== "opus") throw new Error("Áudio WebM sem faixa Opus.");
    const decoderConfig = await track.getDecoderConfig();
    if (!decoderConfig) throw new Error("Configuração de áudio indisponível.");

    const source = new EncodedAudioPacketSource("opus");
    output.addAudioTrack(source);
    await output.start();
    let packetCount = 0;
    for await (const packet of new EncodedPacketSink(track).packets()) {
      signal?.throwIfAborted();
      await source.add(packet, packetCount === 0 ? { decoderConfig } : undefined);
      packetCount++;
    }
    if (!packetCount) throw new Error("Áudio sem conteúdo.");
    source.close();
    await output.finalize();
    signal?.throwIfAborted();
    if (!target.buffer) throw new Error("Áudio não foi preparado.");
    return new Blob([target.buffer], { type: "audio/ogg;codecs=opus" });
  } catch (error) {
    if (output.state !== "finalized" && output.state !== "canceled") await output.cancel();
    throw error;
  } finally {
    input.dispose();
  }
}
