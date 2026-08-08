import assert from "node:assert/strict";
import test from "node:test";

import { validateWhatsAppSendPayload } from "../src/lib/whatsapp/send-payload.ts";

test("aceita envio com conversationId mesmo sem contactId", () => {
  assert.equal(
    validateWhatsAppSendPayload({ conversationId: "conv-1", body: "Olá" }),
    null,
  );
});

test("preserva o fluxo legado que envia somente contactId", () => {
  assert.equal(
    validateWhatsAppSendPayload({ contactId: "5511999999999", body: "Olá" }),
    null,
  );
});

test("bloqueia mensagem realmente vazia", () => {
  assert.equal(
    validateWhatsAppSendPayload({ conversationId: "conv-1", body: "   " }),
    "Digite uma mensagem ou adicione um arquivo",
  );
});

test("aceita mídia sem legenda", () => {
  assert.equal(
    validateWhatsAppSendPayload({ conversationId: "conv-1", file: "blob:https://example.test/file" }),
    null,
  );
});
