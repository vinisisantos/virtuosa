import assert from "node:assert/strict";
import test from "node:test";

import {
  isWhatsAppConversationInCallbackQueue,
  whatsAppCallbackQueueView,
} from "../src/lib/whatsapp/callback-queue.ts";

const now = Date.parse("2026-08-15T15:00:00.000Z");

test("mantém atendimento normal fora da fila antes do primeiro vencimento", () => {
  assert.equal(whatsAppCallbackQueueView({
    status: "open",
    callbackTrackingStartedAt: "2026-08-15T10:00:00.000Z",
    callbackDueAt: "2026-08-15T22:00:00.000Z",
    callbackStreakCount: 0,
    callbackQueueStatus: "inactive",
  }, now), null);
});

test("move para pendentes quando a janela de rechame vence", () => {
  assert.equal(whatsAppCallbackQueueView({
    status: "open",
    callbackTrackingStartedAt: "2026-08-14T10:00:00.000Z",
    callbackDueAt: "2026-08-15T14:59:59.000Z",
    callbackStreakCount: 0,
    callbackQueueStatus: "inactive",
  }, now), "due");
});

test("mantém tentativa enviada em aguardando resposta", () => {
  assert.equal(whatsAppCallbackQueueView({
    status: "open",
    callbackTrackingStartedAt: "2026-08-14T10:00:00.000Z",
    callbackDueAt: "2026-08-16T03:00:00.000Z",
    callbackStreakCount: 2,
    callbackQueueStatus: "waiting_response",
  }, now), "waiting_response");
});

test("prioriza pendência quando uma nova tentativa já venceu", () => {
  assert.equal(whatsAppCallbackQueueView({
    status: "open",
    callbackTrackingStartedAt: "2026-08-14T10:00:00.000Z",
    callbackDueAt: "2026-08-15T14:00:00.000Z",
    callbackStreakCount: 2,
    callbackQueueStatus: "waiting_response",
  }, now), "due");
});

test("preserva a origem da resposta até a retomada manual", () => {
  const conversation = {
    status: "open",
    callbackTrackingStartedAt: "2026-08-15T14:30:00.000Z",
    callbackDueAt: null,
    callbackStreakCount: 0,
    callbackQueueStatus: "responded",
  };
  assert.equal(whatsAppCallbackQueueView(conversation, now), "responded");
  assert.equal(isWhatsAppConversationInCallbackQueue(conversation, now), true);
});

test("não reabre fila para conversa encerrada", () => {
  assert.equal(whatsAppCallbackQueueView({
    status: "lost",
    callbackQueueStatus: "responded",
  }, now), null);
});
