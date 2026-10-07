import assert from "node:assert/strict";
import test from "node:test";

import {
  isRenderableImageMedia,
  messageHasVisibleContent,
} from "../src/lib/whatsapp/message-visibility.ts";

test("figurinha recebida sem URL continua visível para recuperação", () => {
  assert.equal(messageHasVisibleContent({ body: "", type: "sticker", fromMe: false }), true);
  assert.equal(messageHasVisibleContent({ body: "", type: "sticker", fromMe: true }), false);
});

test("figurinha com URL assinada é renderizada como imagem sem mudar tipo", () => {
  assert.equal(isRenderableImageMedia("sticker", "https://blob.example/sticker.webp?token=abc"), true);
  assert.equal(isRenderableImageMedia("sticker", null), false);
  assert.equal(isRenderableImageMedia("document", "https://blob.example/file.pdf"), false);
});

test("a recuperação de outras mídias recebidas sem URL permanece acessível", () => {
  assert.equal(messageHasVisibleContent({ body: "", type: "image", fromMe: false }), true);
  assert.equal(messageHasVisibleContent({ body: "", type: "audio", fromMe: false }), true);
  assert.equal(messageHasVisibleContent({ body: "", type: "video", fromMe: false }), false);
});
