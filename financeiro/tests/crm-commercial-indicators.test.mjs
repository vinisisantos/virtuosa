import assert from "node:assert/strict";
import test from "node:test";

import { buildCommercialIndicators } from "../src/lib/crm/commercial-indicators.ts";

const BASE = new Date("2026-08-14T13:00:00.000Z");
const atMinutes = (minutes) => new Date(BASE.getTime() + minutes * 60_000);

function lead(key, overrides = {}) {
  return {
    key,
    clientId: `client-${key}`,
    conversationId: `conversation-${key}`,
    receivedAt: BASE,
    campaignLabel: "Barriga Trincada",
    assigneeLabel: "Claudenice",
    ...overrides,
  };
}

function appointment(clientId, status, minutes = 60) {
  return {
    clientId,
    status,
    createdAt: atMinutes(minutes),
    updatedAt: atMinutes(minutes),
  };
}

test("calcula funil, primeira resposta e denominadores auditados", () => {
  const leads = [lead("a"), lead("b"), lead("c"), lead("d")];
  const messages = [
    { conversationId: "conversation-a", fromMe: true, timestamp: atMinutes(5) },
    { conversationId: "conversation-a", fromMe: false, timestamp: atMinutes(6) },
    { conversationId: "conversation-b", fromMe: true, timestamp: atMinutes(15) },
    { conversationId: "conversation-b", fromMe: false, timestamp: atMinutes(16) },
    { conversationId: "conversation-c", fromMe: true, timestamp: atMinutes(30) },
  ];
  const appointments = [
    appointment("client-a", "fechou_pacote"),
    appointment("client-b", "nao_fechou"),
    appointment("client-c", "nao_compareceu"),
    appointment("client-d", "pendente"),
  ];

  const result = buildCommercialIndicators({ leads, messages, appointments }).totals;

  assert.deepEqual({
    received: result.received,
    contacted: result.contacted,
    responded: result.responded,
    scheduled: result.scheduled,
    attended: result.attended,
    missed: result.missed,
    closed: result.closed,
    notClosed: result.notClosed,
  }, {
    received: 4,
    contacted: 3,
    responded: 2,
    scheduled: 4,
    attended: 2,
    missed: 1,
    closed: 1,
    notClosed: 1,
  });
  assert.deepEqual(result.rates.response, { numerator: 2, denominator: 3, percentage: 66.7 });
  assert.deepEqual(result.rates.scheduling, { numerator: 4, denominator: 4, percentage: 100 });
  assert.deepEqual(result.rates.attendance, { numerator: 2, denominator: 3, percentage: 66.7 });
  assert.deepEqual(result.rates.closing, { numerator: 1, denominator: 2, percentage: 50 });
  assert.deepEqual(result.rates.sla15, { numerator: 2, denominator: 3, percentage: 66.7 });
  assert.deepEqual(result.firstResponseMinutes, {
    average: 16.7,
    median: 15,
    p90: 30,
    sampleSize: 3,
  });
});

test("resposta do lead só conta depois do primeiro outbound e dentro do ciclo recebido", () => {
  const leads = [
    lead("primeiro", { conversationId: "conversation-reused" }),
    lead("segundo", { conversationId: "conversation-reused", receivedAt: atMinutes(120) }),
  ];
  const messages = [
    { conversationId: "conversation-reused", fromMe: false, timestamp: atMinutes(2) },
    { conversationId: "conversation-reused", fromMe: true, timestamp: atMinutes(10) },
    { conversationId: "conversation-reused", fromMe: true, timestamp: atMinutes(125) },
    { conversationId: "conversation-reused", fromMe: false, timestamp: atMinutes(126) },
  ];

  const result = buildCommercialIndicators({ leads, messages, appointments: [] });

  assert.equal(result.totals.contacted, 2);
  assert.equal(result.totals.responded, 1);
  assert.deepEqual(result.totals.rates.response, { numerator: 1, denominator: 2, percentage: 50 });
  assert.deepEqual(result.totals.firstResponseMinutes, {
    average: 7.5,
    median: 7.5,
    p90: 10,
    sampleSize: 2,
  });
});

test("atribui agendamento ao ciclo mais recente e usa o status mais atualizado", () => {
  const leads = [
    lead("antigo", { clientId: "client-shared", campaignLabel: "Campanha antiga" }),
    lead("novo", { clientId: "client-shared", campaignLabel: "Campanha nova", receivedAt: atMinutes(120) }),
  ];
  const appointments = [
    appointment("client-shared", "pendente", 60),
    appointment("client-shared", "fechou_pacote", 180),
    appointment("client-shared", "nao_fechou", 200),
  ];

  const result = buildCommercialIndicators({ leads, messages: [], appointments });

  assert.equal(result.totals.scheduled, 2);
  assert.equal(result.totals.attended, 1);
  assert.equal(result.totals.closed, 0);
  assert.equal(result.totals.notClosed, 1);
  assert.deepEqual(result.totals.rates.closing, { numerator: 0, denominator: 1, percentage: 0 });
});

test("mudança tardia de status não transfere o agendamento para um ciclo novo", () => {
  const leads = [
    lead("antigo", { clientId: "client-shared", campaignLabel: "Campanha antiga" }),
    lead("novo", { clientId: "client-shared", campaignLabel: "Campanha nova", receivedAt: atMinutes(120) }),
  ];
  const appointments = [{
    clientId: "client-shared",
    status: "fechou_pacote",
    createdAt: atMinutes(60),
    updatedAt: atMinutes(180),
  }];

  const result = buildCommercialIndicators({ leads, messages: [], appointments });

  assert.equal(result.byCampaign.find((row) => row.label === "Campanha antiga")?.scheduled, 1);
  assert.equal(result.byCampaign.find((row) => row.label === "Campanha nova")?.scheduled, 0);
  assert.equal(result.totals.closed, 1);
});

test("mantém linhas sem campanha e sem responsável e zera taxas sem denominador", () => {
  const leads = [lead("sem-cobertura", { campaignLabel: "", assigneeLabel: "" })];

  const result = buildCommercialIndicators({ leads, messages: [], appointments: [] });

  assert.equal(result.byCampaign[0].label, "Sem campanha classificada");
  assert.equal(result.byAssignee[0].label, "Sem responsável");
  assert.deepEqual(result.coverage, {
    campaignClassified: 0,
    campaignUnclassified: 1,
    assigned: 0,
    unassigned: 1,
  });
  assert.deepEqual(result.totals.rates.response, { numerator: 0, denominator: 0, percentage: 0 });
  assert.deepEqual(result.totals.rates.attendance, { numerator: 0, denominator: 0, percentage: 0 });
  assert.deepEqual(result.totals.firstResponseMinutes, {
    average: null,
    median: null,
    p90: null,
    sampleSize: 0,
  });
});
