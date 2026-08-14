import assert from "node:assert/strict";
import test from "node:test";

import { preserveActiveAudioMediaUrl } from "../src/lib/whatsapp/audio-playback.ts";

const currentMessages = [
  {
    id: "audio-1",
    body: "",
    type: "ptt",
    mediaUrl: "https://blob.test/audio.ogg?token=anterior",
    fromMe: false,
    status: "delivered",
    timestamp: "2026-08-13T12:00:00.000Z",
  },
  {
    id: "texto-1",
    body: "Olá",
    type: "text",
    mediaUrl: null,
    fromMe: false,
    status: "delivered",
    timestamp: "2026-08-13T12:01:00.000Z",
  },
];

test("mantém a URL do áudio em reprodução quando o Inbox renova URLs temporárias", () => {
  const refreshedMessages = [
    { ...currentMessages[0], mediaUrl: "https://blob.test/audio.ogg?token=renovado" },
    { ...currentMessages[1], status: "read" },
  ];

  const result = preserveActiveAudioMediaUrl(currentMessages, refreshedMessages, "audio-1");

  assert.equal(result[0].mediaUrl, currentMessages[0].mediaUrl);
  assert.equal(result[1].status, "read");
});

test("aceita a URL renovada quando nenhum áudio está tocando", () => {
  const refreshedMessages = [
    { ...currentMessages[0], mediaUrl: "https://blob.test/audio.ogg?token=renovado" },
  ];

  const result = preserveActiveAudioMediaUrl(currentMessages, refreshedMessages, null);

  assert.equal(result, refreshedMessages);
  assert.equal(result[0].mediaUrl, refreshedMessages[0].mediaUrl);
});

test("não interfere nos demais áudios da conversa", () => {
  const refreshedMessages = [
    { ...currentMessages[0], mediaUrl: "https://blob.test/audio.ogg?token=renovado" },
    { ...currentMessages[0], id: "audio-2", mediaUrl: "https://blob.test/outro.ogg?token=renovado" },
  ];

  const result = preserveActiveAudioMediaUrl(currentMessages, refreshedMessages, "audio-1");

  assert.equal(result[0].mediaUrl, currentMessages[0].mediaUrl);
  assert.equal(result[1].mediaUrl, refreshedMessages[1].mediaUrl);
});
