import assert from "node:assert/strict";
import test from "node:test";

import {
  hasWhatsAppTextFormatting,
  parseWhatsAppText,
  plainWhatsAppText,
} from "../src/lib/whatsapp/text-format.ts";

test("interpreta marcações nativas do WhatsApp", () => {
  assert.deepEqual(parseWhatsAppText("*forte* e _leve_"), [
    { type: "bold", children: [{ type: "text", value: "forte" }] },
    { type: "text", value: " e " },
    { type: "italic", children: [{ type: "text", value: "leve" }] },
  ]);
});

test("aceita sinais duplicados usados nos textos do CRM", () => {
  assert.deepEqual(parseWhatsAppText("**forte** e __leve__"), [
    { type: "bold", children: [{ type: "text", value: "forte" }] },
    { type: "text", value: " e " },
    { type: "italic", children: [{ type: "text", value: "leve" }] },
  ]);
  assert.equal(plainWhatsAppText("~~removido~~"), "removido");
});

test("só ativa a prévia quando existe uma marcação completa", () => {
  assert.equal(hasWhatsAppTextFormatting("mensagem comum"), false);
  assert.equal(hasWhatsAppTextFormatting("**marcação aberta"), false);
  assert.equal(hasWhatsAppTextFormatting("**mensagem formatada**"), true);
});
