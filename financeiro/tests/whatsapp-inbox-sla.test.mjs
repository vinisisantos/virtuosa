import assert from "node:assert/strict";
import test from "node:test";

import {
  INBOX_SLA_ATTENTION_AFTER_MINUTES,
  INBOX_SLA_OVERDUE_AFTER_MINUTES,
  inboxSlaSnapshot,
} from "../src/lib/whatsapp/inbox-sla.ts";

const NOW = new Date("2026-08-14T12:00:00.000Z");

function minutesBeforeNow(minutes, extraMilliseconds = 0) {
  return new Date(NOW.getTime() - minutes * 60_000 - extraMilliseconds);
}

test("nao inicia espera sem mensagem recebida", () => {
  assert.deepEqual(inboxSlaSnapshot({ now: NOW }), {
    state: "not_waiting",
    label: "Sem espera",
    minutes: null,
    level: null,
  });
});

test("saida manual ou automatica posterior encerra a espera", () => {
  const lastInboundAt = minutesBeforeNow(10);

  for (const lastOutboundAt of [minutesBeforeNow(5), lastInboundAt]) {
    assert.equal(inboxSlaSnapshot({ lastInboundAt, lastOutboundAt, now: NOW }).state, "not_waiting");
  }
});

test("entrada posterior a saida inicia espera", () => {
  const snapshot = inboxSlaSnapshot({
    lastInboundAt: minutesBeforeNow(4),
    lastOutboundAt: minutesBeforeNow(8),
    now: NOW,
  });

  assert.deepEqual(snapshot, {
    state: "waiting",
    label: "Aguardando há 4 min",
    minutes: 4,
    level: "green",
  });
});

test("respeita os limites exatos de verde, atencao e atraso", () => {
  assert.equal(inboxSlaSnapshot({
    lastInboundAt: minutesBeforeNow(INBOX_SLA_ATTENTION_AFTER_MINUTES),
    now: NOW,
  }).level, "green");

  assert.equal(inboxSlaSnapshot({
    lastInboundAt: minutesBeforeNow(INBOX_SLA_ATTENTION_AFTER_MINUTES, 1),
    now: NOW,
  }).level, "attention");

  assert.equal(inboxSlaSnapshot({
    lastInboundAt: minutesBeforeNow(INBOX_SLA_OVERDUE_AFTER_MINUTES),
    now: NOW,
  }).level, "attention");

  assert.equal(inboxSlaSnapshot({
    lastInboundAt: minutesBeforeNow(INBOX_SLA_OVERDUE_AFTER_MINUTES, 1),
    now: NOW,
  }).level, "overdue");
});

test("relogio injetavel torna minutos e rotulo deterministicos", () => {
  assert.deepEqual(inboxSlaSnapshot({
    lastInboundAt: minutesBeforeNow(125),
    now: NOW,
  }), {
    state: "waiting",
    label: "Aguardando há 2h 5 min",
    minutes: 125,
    level: "overdue",
  });
});

test("timestamp invalido nao cria espera e horario futuro e limitado a zero", () => {
  assert.equal(inboxSlaSnapshot({ lastInboundAt: "invalido", now: NOW }).state, "not_waiting");
  assert.deepEqual(inboxSlaSnapshot({
    lastInboundAt: new Date(NOW.getTime() + 60_000),
    now: NOW,
  }), {
    state: "waiting",
    label: "Aguardando agora",
    minutes: 0,
    level: "green",
  });
});
