import assert from "node:assert/strict";
import test from "node:test";

import {
  evolutionConversationNumber,
  whatsappConversationJid,
} from "../src/lib/whatsapp/chat-action-identifiers.ts";

test("ações usam o JID exato observado na conversa", () => {
  assert.equal(
    whatsappConversationJid("5511999999999@s.whatsapp.net", "5511888888888"),
    "5511999999999@s.whatsapp.net",
  );
  assert.equal(
    whatsappConversationJid("123456789@lid", "lid:123456789"),
    "123456789@lid",
  );
});

test("ações reconstruem JID normal somente quando a conversa não o possui", () => {
  assert.equal(
    whatsappConversationJid(null, "+55 (11) 99999-9999"),
    "5511999999999@s.whatsapp.net",
  );
  assert.equal(whatsappConversationJid(null, "lid:123"), "");
});

test("Evolution recebe telefone puro para contato normal e JID completo para LID", () => {
  assert.equal(
    evolutionConversationNumber("5511999999999@s.whatsapp.net", "+55 (11) 88888-8888"),
    "5511999999999",
  );
  assert.equal(
    evolutionConversationNumber("123456789@lid", "lid:123456789"),
    "123456789@lid",
  );
});
