import assert from "node:assert/strict";
import test from "node:test";

import {
  advanceAiTrainingDiagramV7FollowUp,
  createAiTrainingDiagramV7Simulation,
  resolveAiTrainingDiagramV7Turn,
} from "../src/lib/ai-training-diagram-v7.ts";

const NOW = new Date("2026-08-06T12:00:00-03:00");

function campaign(overrides = {}) {
  return {
    id: "campaign-v7-test",
    name: "Barriga Trincada",
    unit: "Osasco",
    status: "ativa",
    objective: "Definição abdominal",
    offerItems: [{ procedureName: "Hyper Slim", includedSessions: 10 }],
    creativeId: null,
    approvedPriceText: null,
    ...overrides,
  };
}

function turn(state, latestClientMessage) {
  return resolveAiTrainingDiagramV7Turn({ state, latestClientMessage, now: NOW });
}

function reachUnitConfirmation(activeCampaign = campaign()) {
  let state = createAiTrainingDiagramV7Simulation({ campaign: activeCampaign }).state;
  state = turn(state, activeCampaign.name.includes("Glúteos") ? "tudo" : "abdômen e flancos").state;
  return turn(state, "primeira vez").state;
}

test("V7 mantém a campanha abdominal sem oferecer glúteos", () => {
  const simulation = createAiTrainingDiagramV7Simulation({ campaign: campaign() });
  assert.equal(simulation.state.node, "collect_concern");
  assert.match(simulation.messages.at(-1).content, /região abdominal/i);
  assert.doesNotMatch(simulation.messages.at(-1).content, /glúteos/i);
});

test("diretor avança por objetivo e deixa a redação para a composição natural", () => {
  const state = createAiTrainingDiagramV7Simulation({ campaign: campaign() }).state;
  const result = turn(state, "abdômen e flancos");
  assert.equal(result.kind, "compose");
  assert.equal(result.objective, "acolher_sem_repetir_e_qualificar_experiencia");
  assert.equal(result.state.node, "qualify_experience");
  assert.equal(result.state.qualification.concernScope, "multiple");
});

test("experiência anterior pergunta satisfação e nunca origem da clínica", () => {
  let state = createAiTrainingDiagramV7Simulation({ campaign: campaign() }).state;
  state = turn(state, "abdômen").state;
  const result = turn(state, "já fiz antes");
  assert.equal(result.state.node, "qualify_experience_satisfaction");
  assert.match(result.fallbackMessages[0].content, /gostou do resultado/i);
  assert.doesNotMatch(result.fallbackMessages[0].content, /Virtuosa ou em outra clínica/i);
});

test("negação de primeira vez é reconhecida como experiência anterior", () => {
  let state = createAiTrainingDiagramV7Simulation({ campaign: campaign() }).state;
  state = turn(state, "abdômen").state;
  const result = turn(state, "não é minha primeira vez");
  assert.equal(result.state.qualification.previousExperience, "previous");
  assert.equal(result.state.node, "qualify_experience_satisfaction");
});

test("insatisfação é compreendida antes do convite para avaliação", () => {
  let state = createAiTrainingDiagramV7Simulation({ campaign: campaign() }).state;
  state = turn(state, "abdômen").state;
  state = turn(state, "já fiz antes").state;
  let result = turn(state, "não gostei");
  assert.equal(result.state.node, "understand_negative_experience");
  assert.match(result.fallbackMessages[0].content, /durou menos/i);

  result = turn(result.state, "durou pouco");
  assert.equal(result.state.qualification.negativeExperienceReason, "short_duration");
  assert.equal(result.state.node, "confirm_unit");
  assert.match(result.fallbackMessages.map((message) => message.content).join(" "), /especialista/i);
});

test("confirmação da unidade convida diretamente e pergunta semana ou sábado", () => {
  const state = reachUnitConfirmation();
  const result = turn(state, "sou sim");
  assert.equal(result.kind, "compose");
  assert.equal(result.state.node, "schedule_day_type");
  assert.match(result.fallbackMessages[0].content, /semana ou no sábado/i);
  assert.doesNotMatch(result.fallbackMessages[0].content, /posso consultar/i);
});

test("agenda fictícia oferece duas opções e exige escolha inequívoca", () => {
  let state = reachUnitConfirmation();
  state = turn(state, "sim").state;
  let result = turn(state, "durante a semana");
  assert.equal(result.state.node, "schedule_period");

  result = turn(result.state, "à tarde");
  state = result.state;
  assert.equal(state.node, "confirm_simulated_slot");
  assert.equal(state.scheduling.offeredSlots.length, 2);
  assert.deepEqual(state.scheduling.offeredSlots.map((slot) => slot.time), ["15:00", "17:00"]);
  assert.match(result.messages[0].content, /Qual desses horários/i);

  result = turn(state, "a segunda opção");
  assert.equal(result.state.outcome, "scheduled");
  assert.equal(result.state.scheduling.confirmedTime, "17:00");
  assert.match(result.messages[0].content, /Nenhuma agenda real foi alterada/i);
});

test("pergunta por segunda-feira faz nova busca e nunca confirma a segunda opção", () => {
  let state = reachUnitConfirmation();
  state = turn(state, "sim").state;
  state = turn(state, "durante a semana").state;
  state = turn(state, "tarde").state;
  const result = turn(state, "segunda-feira da próxima semana você tem quais horários?");
  assert.equal(result.state.outcome, "active");
  assert.equal(result.state.node, "confirm_simulated_slot");
  assert.equal(result.state.scheduling.requestedWeekday, 1);
  assert.equal(result.state.scheduling.confirmedTime, null);
});

test("afirmação de disponibilidade na segunda restringe a busca à segunda", () => {
  let state = reachUnitConfirmation();
  state = turn(state, "sim").state;
  state = turn(state, "só posso na segunda-feira").state;
  const result = turn(state, "de manhã");
  assert.equal(result.state.scheduling.requestedWeekday, 1);
  assert.ok(result.state.scheduling.offeredSlots.every((slot) => new Date(`${slot.date}T12:00:00Z`).getUTCDay() === 1));
});

test("recusa de sábado é tratada como preferência de agenda, não desistência", () => {
  let state = reachUnitConfirmation();
  state = turn(state, "sim").state;
  const result = turn(state, "não quero sábado, prefiro durante a semana");
  assert.equal(result.state.outcome, "active");
  assert.equal(result.state.node, "schedule_period");
  assert.equal(result.state.scheduling.preference, "weekday");
});

test("pergunta fora do objetivo responde e preserva o cursor", () => {
  const state = createAiTrainingDiagramV7Simulation({ campaign: campaign() }).state;
  const result = turn(state, "Quanto custa?");
  assert.equal(result.kind, "scripted");
  assert.equal(result.state.node, "collect_concern");
  assert.match(result.messages.at(-1).content, /região abdominal/i);
});

test("follow-up manual retoma o objetivo sem reiniciar a conversa", () => {
  let state = createAiTrainingDiagramV7Simulation({ campaign: campaign() }).state;
  state = turn(state, "abdômen").state;
  const advanced = advanceAiTrainingDiagramV7FollowUp(state);
  assert.equal(advanced.state.node, "qualify_experience");
  assert.equal(advanced.state.followUpDay, 2);
  assert.match(advanced.messages.at(-1).content, /primeira vez/i);
});
