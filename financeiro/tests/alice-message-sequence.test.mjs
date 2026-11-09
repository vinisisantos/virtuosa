import assert from "node:assert/strict";
import test from "node:test";
import { aliceSequenceCanContinue, isSbcBotoxOpeningContext, readAliceMessageSequence } from "#lib/ai-assistant/message-sequence";

test("a segunda mensagem só é oferecida após o envio da primeira, sem mensagem mais recente", () => {
  const draft = { status: "sent", sentMessageId: "outgoing-1", usage: { sequence: { provider: "claude", index: 0, messages: ["Olá!", "É sua primeira vez?"] } } };
  assert.equal(aliceSequenceCanContinue(draft, "outgoing-1"), true);
  assert.equal(aliceSequenceCanContinue(draft, "incoming-new"), false);
  assert.equal(aliceSequenceCanContinue({ ...draft, status: "inserted" }, "outgoing-1"), false);
  assert.equal(aliceSequenceCanContinue({ ...draft, usage: { sequence: { ...draft.usage.sequence, index: 1 } } }, "outgoing-1"), false);
});

test("sequências incompletas não são usadas", () => {
  assert.equal(readAliceMessageSequence({ sequence: { provider: "claude", index: 0, messages: ["Só uma"] } }), null);
  assert.equal(readAliceMessageSequence({ sequence: { provider: "outro", index: 0, messages: ["Uma", "Duas"] } }), null);
});

test("sequência de abertura é restrita ao Botox Terço Superior em SBC", () => {
  const prompt = { CAMPANHA: "Botox Terço Superior", CONVERSA: [] };
  assert.equal(isSbcBotoxOpeningContext("SBC", prompt), true);
  assert.equal(isSbcBotoxOpeningContext("Osasco", prompt), false);
  assert.equal(isSbcBotoxOpeningContext("SBC", { CAMPANHA: "Lipo Laser", CONVERSA: [] }), false);
});
