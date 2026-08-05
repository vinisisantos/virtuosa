import assert from "node:assert/strict";
import test from "node:test";

import {
  advanceAiPublicSdrState,
  classifyAiPublicSdrIntent,
  classifyAiPublicSdrIntents,
  emptyAiPublicSdrState,
} from "../src/lib/ai-public-sdr.ts";
import {
  aiPublicSchedulingDateRequestFromMessage,
  aiPublicSchedulingWeekdayFromMessage,
  emptyAiPublicSchedulingState,
  ordinalOptionIndex,
  resolveAiPublicSchedulingTurn,
} from "../src/lib/ai-public-scheduling.ts";
import { detectAiPublicHumanHandoffOffer } from "../src/lib/ai-public-response-policy.ts";

const NOW = new Date("2026-08-05T15:00:00-03:00");
const OFFERED_SLOTS = [
  { date: "2026-08-12", time: "10:00" },
  { date: "2026-08-12", time: "12:00" },
];

function confirmedState() {
  return {
    ...emptyAiPublicSchedulingState(),
    status: "confirmed",
    offeredSlots: OFFERED_SLOTS,
    confirmedDate: OFFERED_SLOTS[0].date,
    confirmedTime: OFFERED_SLOTS[0].time,
  };
}

test("períodos relativos começam na data mínima correta", () => {
  assert.deepEqual(
    aiPublicSchedulingDateRequestFromMessage("só consigo na próxima semana", NOW),
    { kind: "resolved", date: "2026-08-10", mode: "not_before", resetsWeekday: true },
  );
  assert.deepEqual(
    aiPublicSchedulingDateRequestFromMessage("só consigo mês que vem", NOW),
    { kind: "resolved", date: "2026-09-01", mode: "not_before", resetsWeekday: true },
  );
  assert.deepEqual(
    aiPublicSchedulingDateRequestFromMessage("só consigo daqui 3 semanas", NOW),
    { kind: "resolved", date: "2026-08-26", mode: "not_before", resetsWeekday: true },
  );
});

test("dia sem mês exige confirmação antes da consulta", () => {
  assert.deepEqual(
    aiPublicSchedulingDateRequestFromMessage("pode ser dia 10", NOW),
    { kind: "clarify", proposedDate: "2026-08-10", mode: "exact", resetsWeekday: true },
  );
});

test("segunda-feira não colide com segunda opção", () => {
  assert.equal(aiPublicSchedulingWeekdayFromMessage("só posso na segunda-feira"), 1);
  assert.equal(aiPublicSchedulingWeekdayFromMessage("segunda-feira da próxima semana, quais horários?"), 1);
  assert.equal(aiPublicSchedulingWeekdayFromMessage("a segunda opção"), null);
  assert.equal(ordinalOptionIndex("a primeira opção"), 0);
  assert.equal(ordinalOptionIndex("o primeiro horário"), 0);
  assert.equal(ordinalOptionIndex("a segunda opção"), 1);
  assert.equal(ordinalOptionIndex("o terceiro horário"), 2);
});

test("pergunta por outro dia não confirma horário oferecido", () => {
  const turn = resolveAiPublicSchedulingTurn({
    previous: {
      ...emptyAiPublicSchedulingState(),
      status: "awaiting_confirmation",
      preference: "weekday",
      offeredSlots: OFFERED_SLOTS,
    },
    latestClientMessage: "segunda-feira da próxima semana você tem quais horários?",
    now: NOW,
  });
  assert.equal(turn.state.status, "collecting_period");
  assert.equal(turn.state.requestedWeekday, 1);
  assert.equal(turn.state.confirmedDate, null);
});

test("escolhas inequívocas continuam confirmando primeira e segunda opção", () => {
  const previous = {
    ...emptyAiPublicSchedulingState(),
    status: "awaiting_confirmation",
    preference: "weekday",
    offeredSlots: OFFERED_SLOTS,
  };
  const first = resolveAiPublicSchedulingTurn({ previous, latestClientMessage: "pode ser o das 10h", now: NOW });
  const second = resolveAiPublicSchedulingTurn({ previous, latestClientMessage: "confirmo a segunda opção", now: NOW });
  assert.equal(first.state.status, "confirmed");
  assert.equal(first.state.confirmedTime, "10:00");
  assert.equal(second.state.status, "confirmed");
  assert.equal(second.state.confirmedTime, "12:00");
});

test("cancelamento e remarcação após confirmação têm estados explícitos", () => {
  const cancelled = resolveAiPublicSchedulingTurn({
    previous: confirmedState(),
    latestClientMessage: "preciso cancelar",
    now: NOW,
  });
  assert.equal(cancelled.state.status, "declined");
  assert.equal(cancelled.state.reason, "cancelled_by_client");
  const afterCancellation = resolveAiPublicSchedulingTurn({
    previous: cancelled.state,
    latestClientMessage: "quanto custa o procedimento?",
    now: NOW,
  });
  assert.equal(afterCancellation.active, false);
  assert.equal(afterCancellation.state.status, "declined");

  const rescheduled = resolveAiPublicSchedulingTurn({
    previous: confirmedState(),
    latestClientMessage: "quero remarcar para segunda-feira",
    now: NOW,
  });
  assert.equal(rescheduled.state.status, "declined");
  assert.equal(rescheduled.state.reason, "reschedule_requested");
  assert.equal(rescheduled.state.requestedWeekday, 1);

  const unrelated = resolveAiPublicSchedulingTurn({
    previous: confirmedState(),
    latestClientMessage: "quanto custa o procedimento?",
    now: NOW,
  });
  assert.equal(unrelated.state.status, "confirmed");
});

test("classificador preserva prioridade e registra múltiplas intenções", () => {
  assert.equal(classifyAiPublicSdrIntent("Quero entender como funciona"), "learn");
  assert.deepEqual(classifyAiPublicSdrIntents("Quanto custa e como funciona?"), ["price", "learn"]);

  const previous = {
    ...emptyAiPublicSdrState(),
    turnCount: 2,
    nextObjective: "await_choice",
  };
  assert.equal(classifyAiPublicSdrIntent("sim", previous), "positive_confirmation");
  assert.equal(
    classifyAiPublicSdrIntent("segunda-feira da próxima semana você tem quais horários?", previous),
    "availability",
  );
});

test("estado estruturado acompanha todas as intenções e tópicos respondidos", () => {
  const state = advanceAiPublicSdrState({
    previous: emptyAiPublicSdrState(),
    latestClientMessage: "Quanto custa e como funciona?",
    assistantMessages: ["O protocolo funciona assim e o investimento é informado pela campanha."],
  });
  assert.equal(state.latestIntent, "price");
  assert.deepEqual(state.latestIntents, ["price", "learn"]);
  assert.ok(state.topicsCovered.includes("price"));
  assert.ok(state.topicsCovered.includes("procedure_function"));
});

test("negação da Virtuosa preserva origem em outra clínica", () => {
  const state = advanceAiPublicSdrState({
    previous: {
      ...emptyAiPublicSdrState(),
      turnCount: 2,
      nextObjective: "qualify_experience",
    },
    latestClientMessage: "Não foi na Virtuosa, foi em outra clínica",
    assistantMessages: ["Como foi sua experiência?"],
  });
  assert.equal(state.qualification.previousExperience, "other_clinic");
});

test("guardrail reconhece variações de oferta de atendimento humano", () => {
  for (const message of [
    "Quer que eu chame alguém da equipe?",
    "Posso te colocar em contato com uma consultora?",
    "Você prefere falar com nossa especialista?",
    "Se desejar, posso te encaminhar para ela.",
  ]) {
    assert.equal(detectAiPublicHumanHandoffOffer(message), true, message);
  }
  for (const message of [
    "Nossa equipe cuidará para que sua experiência seja positiva.",
    "A especialista define a estratégia junto com você.",
    "Posso falar sobre nossa equipe e a avaliação.",
  ]) {
    assert.equal(detectAiPublicHumanHandoffOffer(message), false, message);
  }
});
