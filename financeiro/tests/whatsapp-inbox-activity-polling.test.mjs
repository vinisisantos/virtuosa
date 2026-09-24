import assert from "node:assert/strict";
import test from "node:test";
import { shouldRefreshActiveConversation } from "../src/lib/whatsapp/inbox-activity-polling.ts";

const now = Date.parse("2026-09-24T12:00:00.000Z");

test("não acrescenta consultas quando a conversa está parada", () => {
  assert.equal(shouldRefreshActiveConversation({
    now,
    lastDraftChangeAt: 0,
    hasDraft: false,
    messages: [],
  }), false);
});

test("acompanha a resposta do cliente apenas enquanto o operador escreve", () => {
  assert.equal(shouldRefreshActiveConversation({
    now,
    lastDraftChangeAt: now - 5_000,
    hasDraft: true,
    messages: [],
  }), true);
  assert.equal(shouldRefreshActiveConversation({
    now,
    lastDraftChangeAt: now - 31_000,
    hasDraft: true,
    messages: [],
  }), false);
});

test("confere entrega recente sem consultar indefinidamente um relógio antigo", () => {
  const outgoing = (age, status = "pending", fromMe = true) => ({
    fromMe,
    status,
    timestamp: new Date(now - age).toISOString(),
  });
  const input = (messages) => ({ now, lastDraftChangeAt: 0, hasDraft: false, messages });

  assert.equal(shouldRefreshActiveConversation(input([outgoing(10_000)])), true);
  assert.equal(shouldRefreshActiveConversation(input([outgoing(31_000)])), false);
  assert.equal(shouldRefreshActiveConversation(input([outgoing(10_000, "delivered")])), false);
  assert.equal(shouldRefreshActiveConversation(input([outgoing(10_000, "pending", false)])), false);
});
