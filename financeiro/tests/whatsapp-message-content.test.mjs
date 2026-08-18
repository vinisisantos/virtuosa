import assert from "node:assert/strict";
import test from "node:test";

import {
  extractWhatsAppMessageBody,
  whatsAppConversationPreview,
} from "../src/lib/whatsapp/message-content.ts";

test("preserva o texto como prévia quando a mídia possui legenda", () => {
  assert.equal(whatsAppConversationPreview("Resultado da avaliação", "audio"), "Resultado da avaliação");
});

test("identifica mensagens de voz sem corpo na prévia da conversa", () => {
  for (const type of ["audio", "audioMessage", "ptt", "pttMessage", "voice"]) {
    assert.equal(whatsAppConversationPreview("", type), "🎤 Áudio");
  }
});

test("mantém indicadores das demais mídias sem transformar em legenda", () => {
  assert.equal(whatsAppConversationPreview(null, "imageMessage"), "📷 Imagem");
  assert.equal(whatsAppConversationPreview(null, "video"), "🎬 Vídeo");
  assert.equal(whatsAppConversationPreview(null, "documentMessage"), "📄 Documento");
  assert.equal(whatsAppConversationPreview(null, "sticker"), "🏷️ Sticker");
  assert.equal(whatsAppConversationPreview(null, "text"), "");
});

test("continua extraindo normalmente o corpo textual do WhatsApp", () => {
  assert.equal(
    extractWhatsAppMessageBody({ message: { extendedTextMessage: { text: "Olá" } } }),
    "Olá",
  );
});
