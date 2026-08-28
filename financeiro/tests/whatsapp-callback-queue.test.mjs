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
    lastInboundAt: "2026-08-15T09:00:00.000Z",
    lastOutboundAt: "2026-08-15T10:00:00.000Z",
    callbackTrackingStartedAt: "2026-08-15T10:00:00.000Z",
    callbackDueAt: "2026-08-15T22:00:00.000Z",
    callbackStreakCount: 0,
    callbackQueueStatus: "inactive",
  }, now), null);
});

test("move para pendentes quando a janela de rechame vence", () => {
  assert.equal(whatsAppCallbackQueueView({
    status: "open",
    lastInboundAt: "2026-08-14T09:00:00.000Z",
    lastOutboundAt: "2026-08-14T10:00:00.000Z",
    callbackTrackingStartedAt: "2026-08-14T10:00:00.000Z",
    callbackDueAt: "2026-08-15T14:59:59.000Z",
    callbackStreakCount: 0,
    callbackQueueStatus: "inactive",
  }, now), "due");
});

test("respeita a janela mínima desde o último contato da equipe", () => {
  const conversation = {
    status: "open",
    lastInboundAt: "2026-08-14T09:00:00.000Z",
    lastOutboundAt: "2026-08-14T15:00:01.000Z",
    callbackTrackingStartedAt: "2026-08-14T15:00:01.000Z",
    callbackDueAt: "2026-08-15T14:00:00.000Z",
    callbackStreakCount: 0,
    callbackQueueStatus: "inactive",
  };

  assert.equal(whatsAppCallbackQueueView(conversation, now, 24 * 60 * 60 * 1000), null);

  conversation.lastOutboundAt = "2026-08-14T15:00:00.000Z";
  assert.equal(whatsAppCallbackQueueView(
    conversation,
    now,
    24 * 60 * 60 * 1000,
  ), "due");
});

test("mantém a conversa na fila principal enquanto aguarda resposta", () => {
  assert.equal(whatsAppCallbackQueueView({
    status: "open",
    lastInboundAt: "2026-08-14T09:00:00.000Z",
    lastOutboundAt: "2026-08-15T15:00:00.000Z",
    callbackTrackingStartedAt: "2026-08-14T10:00:00.000Z",
    callbackDueAt: "2026-08-16T03:00:00.000Z",
    callbackStreakCount: 2,
    callbackQueueStatus: "waiting_response",
  }, now), null);
});

test("prioriza pendência quando uma nova tentativa já venceu", () => {
  assert.equal(whatsAppCallbackQueueView({
    status: "open",
    lastInboundAt: "2026-08-14T09:00:00.000Z",
    lastOutboundAt: "2026-08-15T02:00:00.000Z",
    callbackTrackingStartedAt: "2026-08-14T10:00:00.000Z",
    callbackDueAt: "2026-08-15T14:00:00.000Z",
    callbackStreakCount: 2,
    callbackQueueStatus: "waiting_response",
  }, now), "due");
});

test("mantém a resposta na fila principal sem exigir retomada manual", () => {
  const conversation = {
    status: "open",
    callbackTrackingStartedAt: "2026-08-15T14:30:00.000Z",
    callbackDueAt: null,
    callbackStreakCount: 0,
    callbackQueueStatus: "responded",
  };
  assert.equal(whatsAppCallbackQueueView(conversation, now), null);
  assert.equal(isWhatsAppConversationInCallbackQueue(conversation, now), false);
});

test("não oferece rechame quando a última mensagem veio do lead", () => {
  const conversation = {
    status: "open",
    lastOutboundAt: "2026-08-15T10:00:00.000Z",
    lastInboundAt: "2026-08-15T14:30:00.000Z",
    callbackTrackingStartedAt: "2026-08-15T10:00:00.000Z",
    callbackDueAt: "2026-08-15T14:00:00.000Z",
    callbackStreakCount: 1,
    callbackQueueStatus: "waiting_response",
  };
  assert.equal(whatsAppCallbackQueueView(conversation, now), null);
  assert.equal(isWhatsAppConversationInCallbackQueue(conversation, now), false);
});

test("não contabiliza cliente com pacote fechado mesmo se houver prazo vencido", () => {
  const conversation = {
    status: "open",
    lastInboundAt: "2026-08-14T09:00:00.000Z",
    lastOutboundAt: "2026-08-14T10:00:00.000Z",
    callbackTrackingStartedAt: "2026-08-14T10:00:00.000Z",
    callbackDueAt: "2026-08-15T14:00:00.000Z",
    callbackStreakCount: 2,
    callbackQueueStatus: "suppressed_closed_package",
  };
  assert.equal(whatsAppCallbackQueueView(conversation, now), null);
  assert.equal(isWhatsAppConversationInCallbackQueue(conversation, now), false);
});

test("não reabre fila para conversa encerrada", () => {
  assert.equal(whatsAppCallbackQueueView({
    status: "lost",
    callbackQueueStatus: "responded",
  }, now), null);
});
