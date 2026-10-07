import assert from "node:assert/strict";
import test from "node:test";
import {
  isPrivateBlobUrl,
  needsEvolutionMediaDownload,
  shouldDiscardTemporaryEvolutionMediaUrl,
} from "../src/lib/whatsapp/inbound-media-policy.ts";
import {
  evolutionMediaDataUrl,
  evolutionMessageMatchesConversation,
  findEvolutionMessageById,
} from "../src/lib/whatsapp/inbound-media.ts";

test("URL temporária da Evolution não vira mídia durável no Inbox", () => {
  const temporary = "https://mmg.whatsapp.net/v/t62.7118-24/arquivo.enc";
  const privateUrl = "https://store.private.blob.vercel-storage.com/whatsapp/c/inbound/m";
  assert.equal(shouldDiscardTemporaryEvolutionMediaUrl("evolution", temporary), true);
  assert.equal(shouldDiscardTemporaryEvolutionMediaUrl("waha", temporary), false);
  assert.equal(shouldDiscardTemporaryEvolutionMediaUrl("evolution", privateUrl), false);
  assert.equal(isPrivateBlobUrl(privateUrl), true);
  assert.equal(needsEvolutionMediaDownload("evolution", temporary, temporary), true);
  assert.equal(needsEvolutionMediaDownload("evolution", privateUrl, temporary), false);
  assert.equal(needsEvolutionMediaDownload("evolution", "data:audio/ogg;base64,YQ==", temporary), false);
});

test("resposta da Evolution conserva MIME e não duplica prefixo base64", () => {
  assert.equal(evolutionMediaDataUrl({ base64: "YQ==", mimetype: "audio/ogg; codecs=opus" }),
    "data:audio/ogg;base64,YQ==");
  assert.equal(evolutionMediaDataUrl({ base64: "data:image/jpeg;base64,YQ==" }),
    "data:image/jpeg;base64,YQ==");
  assert.equal(evolutionMediaDataUrl({ base64: "YQ==", mimetype: "image/webp" }),
    "data:image/webp;base64,YQ==");
  assert.equal(evolutionMediaDataUrl({}), null);
});

test("recuperação histórica exige ID, lado e conversa corretos", () => {
  const record = { key: { id: "media-1", remoteJid: "5511999999999@s.whatsapp.net", fromMe: false }, message: { imageMessage: {} } };
  assert.equal(findEvolutionMessageById({ messages: { records: [record] } }, "media-1"), record);
  assert.equal(findEvolutionMessageById({ records: [record] }, "outro"), null);
  assert.equal(evolutionMessageMatchesConversation({ record, fromMe: false, contactPhone: "11999999999" }), true);
  assert.equal(evolutionMessageMatchesConversation({ record, fromMe: true, contactPhone: "11999999999" }), false);
  assert.equal(evolutionMessageMatchesConversation({ record, fromMe: false, contactPhone: "11911111111" }), false);
  const otherConversation = { ...record, key: { ...record.key, remoteJid: "5511988888888@s.whatsapp.net" } };
  assert.equal(findEvolutionMessageById({ records: [otherConversation, record] }, "media-1", (candidate) =>
    evolutionMessageMatchesConversation({ record: candidate, fromMe: false, contactPhone: "11999999999" })), record);
});
