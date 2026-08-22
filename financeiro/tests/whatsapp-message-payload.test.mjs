import assert from "node:assert/strict";
import test from "node:test";

import {
  constrainInlineMediaPayload,
  parseInlineMediaDataUrl,
  resolveInlineMediaByteRange,
} from "../src/lib/whatsapp/message-payload.ts";

test("mantém todas as mensagens quando as mídias cabem no orçamento", () => {
  const messages = [
    { id: "text", body: "Olá", mediaUrl: null },
    { id: "image", body: "", mediaUrl: "data:image/png;base64,1234" },
  ];

  assert.deepEqual(constrainInlineMediaPayload(messages, 100), messages);
});

test("preserva textos e prioriza mídias recentes quando o histórico excede o limite", () => {
  const messages = [
    { id: "old-audio", body: "", mediaUrl: `data:audio/ogg;base64,${"a".repeat(80)}` },
    { id: "text", body: "Mensagem importante", mediaUrl: null },
    { id: "new-image", body: "", mediaUrl: `data:image/png;base64,${"b".repeat(40)}` },
  ];

  const result = constrainInlineMediaPayload(messages, 80);

  assert.equal(result.length, messages.length);
  assert.equal(result[0].mediaUrl, null);
  assert.equal(result[0].mediaPayloadOmitted, true);
  assert.equal(result[1].body, "Mensagem importante");
  assert.equal(result[2].mediaUrl, messages[2].mediaUrl);
  assert.equal(result[2].mediaPayloadOmitted, undefined);
});

test("URLs externas e privadas não consomem o orçamento de base64", () => {
  const messages = [
    { id: "blob", mediaUrl: "https://store.private.blob.vercel-storage.com/audio.ogg" },
    { id: "external", mediaUrl: "https://example.com/image.jpg" },
  ];

  assert.deepEqual(constrainInlineMediaPayload(messages, 0), messages);
});

test("decodifica mídia base64 preservada no histórico", () => {
  const parsed = parseInlineMediaDataUrl("data:video/mp4;base64,AQIDBA==");

  assert.equal(parsed?.mimeType, "video/mp4");
  assert.deepEqual([...parsed.bytes], [1, 2, 3, 4]);
  assert.equal(parseInlineMediaDataUrl("https://example.com/video.mp4"), null);
});

test("resolve intervalos HTTP para reprodução progressiva de vídeo", () => {
  assert.deepEqual(resolveInlineMediaByteRange(null, 100), {
    start: 0,
    end: 99,
    partial: false,
  });
  assert.deepEqual(resolveInlineMediaByteRange("bytes=10-19", 100), {
    start: 10,
    end: 19,
    partial: true,
  });
  assert.deepEqual(resolveInlineMediaByteRange("bytes=-10", 100), {
    start: 90,
    end: 99,
    partial: true,
  });
  assert.equal(resolveInlineMediaByteRange("bytes=100-110", 100), null);
});
