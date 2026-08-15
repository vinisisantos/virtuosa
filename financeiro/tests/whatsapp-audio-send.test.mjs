import assert from "node:assert/strict";
import test from "node:test";

import { buildEvolutionAudioPayload } from "../src/lib/whatsapp/audio-send.ts";

test("ativa a conversão de voz para áudio vindo de URL privada", () => {
  const payload = buildEvolutionAudioPayload({
    number: "5511999999999",
    audio: "https://blob.example/audio.webm?token=temporario",
  });

  assert.equal(payload.encoding, true);
  assert.equal(payload.audio, "https://blob.example/audio.webm?token=temporario");
  assert.equal("quoted" in payload, false);
});

test("preserva conversão e resposta citada para áudio em base64", () => {
  const payload = buildEvolutionAudioPayload({
    number: "5511999999999",
    audio: "GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibQ==",
    replyId: "MESSAGE_ID",
  });

  assert.equal(payload.encoding, true);
  assert.deepEqual(payload.quoted, { key: { id: "MESSAGE_ID" } });
});
