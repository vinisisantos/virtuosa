import assert from "node:assert/strict";
import test from "node:test";

import {
  evolutionBlockNumberCandidates,
  evolutionConversationNumber,
  evolutionMessageLidCandidates,
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

test("bloqueio não repete o mesmo telefone em dois formatos equivalentes", () => {
  assert.deepEqual(
    evolutionBlockNumberCandidates(
      "5511999999999@s.whatsapp.net",
      "+55 (11) 88888-8888",
    ),
    ["5511999999999"],
  );
  assert.deepEqual(
    evolutionBlockNumberCandidates("123456789@lid", "lid:123456789"),
    ["123456789@lid"],
  );
});

test("recupera LID retornado pela Evolution em mensagens da conversa", () => {
  assert.deepEqual(
    evolutionMessageLidCandidates({
      messages: {
        records: [
          {
            key: { remoteJid: "5511999999999@s.whatsapp.net" },
            contextInfo: {
              remoteJid: "123456789@lid",
              participant: "123456789@lid",
            },
          },
          {
            key: {
              remoteJid: "5511999999999@s.whatsapp.net",
              remoteJidAlt: "987654321@lid",
            },
          },
        ],
      },
    }),
    ["123456789@lid", "987654321@lid"],
  );
});

test("recupera LID no retorno imediato de envio", () => {
  assert.deepEqual(
    evolutionMessageLidCandidates({
      key: { remoteJid: "5511999999999@s.whatsapp.net" },
      contextInfo: { remoteJid: "123456789@lid" },
    }),
    ["123456789@lid"],
  );
});

test("recupera o LID da chave ao localizar a mensagem pelo ID", () => {
  assert.deepEqual(
    evolutionMessageLidCandidates({
      messages: {
        records: [
          {
            key: {
              id: "3EB0123456789",
              remoteJid: "123456789@lid",
              remoteJidAlt: "5511999999999@s.whatsapp.net",
            },
          },
        ],
      },
    }),
    ["123456789@lid"],
  );
});
