import assert from "node:assert/strict";
import test from "node:test";
import { Input, BufferSource, BufferTarget, Output, WebMOutputFormat, EncodedAudioPacketSource, EncodedPacket, EncodedPacketSink, OGG } from "mediabunny";
import { audioPlaybackErrorMessage, isWebmAudio, remuxWebmAudioForPlayback } from "../src/lib/whatsapp/audio-compatibility.ts";
import { preferredRecordingMimeType } from "../src/lib/whatsapp/recording-duration.ts";

test("prefere AAC/MP4 mesmo quando Safari anuncia suporte a WebM", () => {
  assert.equal(preferredRecordingMimeType(() => true), "audio/mp4;codecs=mp4a.40.2");
  assert.equal(preferredRecordingMimeType(type => type === "audio/mp4"), "audio/mp4");
  assert.equal(preferredRecordingMimeType(type => type.includes("ogg")), "audio/ogg;codecs=opus");
  assert.equal(preferredRecordingMimeType(type => type.includes("webm")), "audio/webm;codecs=opus");
  assert.equal(preferredRecordingMimeType(() => false), undefined);
});

test("identifica WebM em metadados, nome, URL assinada e mídia inline", () => {
  assert.equal(isWebmAudio("audio/webm; codecs=opus"), true);
  assert.equal(isWebmAudio("AUDIO/WEBM"), true);
  assert.equal(isWebmAudio(null, "/audio.webm?assinatura=x"), true);
  assert.equal(isWebmAudio(null, "blob:preview", "audio.webm"), true);
  assert.equal(isWebmAudio(null, "data:audio/webm;base64,AAAA"), true);
  assert.equal(isWebmAudio("audio/mp4", "/arquivo.mp4"), false);
  assert.equal(isWebmAudio("audio/ogg", "/arquivo.ogg"), false);
  assert.equal(isWebmAudio(), false);
});

test("explica o bloqueio de reprodução automática sem confundir com arquivo mudo", () => {
  assert.match(audioPlaybackErrorMessage(new DOMException("blocked", "NotAllowedError")), /Áudio pronto/);
  assert.match(audioPlaybackErrorMessage(new Error("decode")), /tentar novamente/);
});

test("reorganiza WebM em OGG preservando cada pacote Opus, sem regravar a voz", async () => {
  const target = new BufferTarget();
  const output = new Output({ target, format: new WebMOutputFormat() });
  const source = new EncodedAudioPacketSource("opus");
  output.addAudioTrack(source);
  await output.start();
  // Pacote Opus válido de silêncio de 2,5 ms; nenhuma gravação de cliente no teste.
  const packetData = new Uint8Array([0xe0, 0xff, 0xfe]);
  const description = new Uint8Array([79,112,117,115,72,101,97,100,1,1,0,0,128,187,0,0,0,0,0]);
  for (let i = 0; i < 100; i++) {
    await source.add(new EncodedPacket(packetData, "key", i * 0.0025, 0.0025), i === 0 ? {
      decoderConfig: { codec: "opus", sampleRate: 48000, numberOfChannels: 1, description },
    } : undefined);
  }
  source.close();
  await output.finalize();

  const result = await remuxWebmAudioForPlayback(new Blob([target.buffer], { type: "audio/webm" }));
  assert.equal(result.type, "audio/ogg;codecs=opus");
  const input = new Input({ source: new BufferSource(await result.arrayBuffer()), formats: [OGG] });
  try {
    const track = await input.getPrimaryAudioTrack();
    assert.equal(await track.getCodec(), "opus");
    let count = 0;
    for await (const packet of new EncodedPacketSink(track).packets()) {
      assert.deepEqual(packet.data, packetData);
      count++;
    }
    assert.equal(count, 100);
    assert.ok(Math.abs(await input.computeDuration() - 0.25) < 0.005);
  } finally { input.dispose(); }
});

test("recusa arquivo inválido e respeita cancelamento", async () => {
  await assert.rejects(remuxWebmAudioForPlayback(new Blob(["não é áudio"])), /format/i);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(remuxWebmAudioForPlayback(new Blob(), controller.signal), { name: "AbortError" });
});
