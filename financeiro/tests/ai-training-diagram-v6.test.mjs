import assert from "node:assert/strict";
import test from "node:test";

import {
  advanceAiTrainingDiagramV6FollowUp,
  classifyAiTrainingDiagramV6Campaign,
  createAiTrainingDiagramV6Simulation,
  resolveAiTrainingDiagramV6Turn,
} from "../src/lib/ai-training-diagram-v6.ts";

const NOW = new Date("2026-08-06T12:00:00-03:00");

function campaign(overrides = {}) {
  return {
    id: "campaign-test-1",
    name: "Barriga Trincada",
    unit: "Osasco",
    status: "ativa",
    objective: "Gordura localizada",
    offerItems: [{ procedureName: "Hyper Slim", includedSessions: 10 }],
    creativeId: null,
    approvedPriceText: null,
    ...overrides,
  };
}

function turn(state, latestClientMessage) {
  return resolveAiTrainingDiagramV6Turn({ state, latestClientMessage, now: NOW });
}

test("classifica campanhas cadastradas sem lista fixa de IDs", () => {
  assert.equal(classifyAiTrainingDiagramV6Campaign(campaign()), "body");
  assert.equal(classifyAiTrainingDiagramV6Campaign(campaign({
    id: "facial",
    name: "Preenchimento Facial",
    objective: "Lábios e olheiras",
    offerItems: [{ procedureName: "Preenchimento Labial", includedSessions: 1 }],
  })), "facial");
  assert.equal(classifyAiTrainingDiagramV6Campaign(campaign({
    id: "general",
    name: "Campanha Nova",
    objective: null,
    offerItems: [],
  })), "general");
});

test("inicia V6 com campanha congelada, CRM simulado e três balões", () => {
  const simulation = createAiTrainingDiagramV6Simulation({
    campaign: campaign(),
    unitAddress: "Rua de Teste, 10 - Osasco",
  });
  assert.equal(simulation.state.campaign.id, "campaign-test-1");
  assert.equal(simulation.state.crmStatus, "em_atendimento");
  assert.equal(simulation.state.node, "collect_concern");
  assert.equal(simulation.messages.length, 3);
  assert.equal(simulation.messages[1].mediaKey, "campaign");
  assert.match(simulation.messages[2].content, /Abdômen/);
});

test("fluxo corporal percorre preocupação, experiência, unidade e agenda fictícia", () => {
  let state = createAiTrainingDiagramV6Simulation({ campaign: campaign() }).state;

  let result = turn(state, "abdômen e flancos");
  state = result.state;
  assert.equal(state.qualification.concernScope, "multiple");
  assert.equal(state.node, "qualify_experience");

  result = turn(state, "é minha primeira vez");
  state = result.state;
  assert.equal(state.node, "confirm_unit");
  assert.ok(result.messages.every((message) => !/garant|libera[cç][aã]o/i.test(message.content)));

  result = turn(state, "sim, consigo");
  state = result.state;
  assert.equal(state.node, "schedule_day_type");

  result = turn(state, "durante a semana");
  state = result.state;
  assert.equal(state.node, "schedule_period");

  result = turn(state, "de manhã");
  state = result.state;
  assert.equal(state.node, "confirm_simulated_slot");
  assert.equal(state.scheduling.offeredTime, "10:00");
  assert.match(result.messages[0].content, /fictício/i);

  result = turn(state, "pode confirmar");
  assert.equal(result.state.outcome, "scheduled");
  assert.equal(result.state.crmStatus, "agendado");
  assert.match(result.messages[0].content, /agenda real não foi alterada/i);
});

test("experiência corporal anterior pergunta origem antes da avaliação", () => {
  let state = createAiTrainingDiagramV6Simulation({ campaign: campaign() }).state;
  state = turn(state, "abdômen").state;
  let result = turn(state, "já fiz antes");
  assert.equal(result.state.node, "qualify_experience_origin");
  assert.match(result.messages[0].content, /Virtuosa ou em outra clínica/i);

  result = turn(result.state, "foi em outra clínica");
  assert.equal(result.state.qualification.experienceOrigin, "other_clinic");
  assert.equal(result.state.node, "confirm_unit");
  assert.match(result.messages.map((message) => message.content).join(" "), /nova avaliação/i);
});

test("fluxo facial usa prova genérica e nunca autoriza venda online", () => {
  const facial = campaign({
    id: "facial",
    name: "Preenchimento Facial",
    objective: "Lábios, olheiras e bigode chinês",
    offerItems: [{ procedureName: "Preenchimento Labial", includedSessions: 1 }],
  });
  let state = createAiTrainingDiagramV6Simulation({ campaign: facial }).state;
  state = turn(state, "olheiras").state;
  const result = turn(state, "primeira vez");
  assert.equal(result.state.node, "confirm_unit");
  assert.ok(result.messages.some((message) => message.mediaKey === "facial-under-eyes"));
  assert.ok(result.messages.every((message) => !/venda online|liberad[ao]|resultado excelente/i.test(message.content)));
});

test("pergunta fora do roteiro preserva o cursor pendente", () => {
  const state = createAiTrainingDiagramV6Simulation({ campaign: campaign() }).state;
  const result = turn(state, "Como funciona o Hyper Slim?");
  assert.equal(result.kind, "faq");
  assert.equal(result.state.node, "collect_concern");
  assert.match(result.resumePrompt, /O que mais te incomoda hoje/i);
});

test("preço sem fonte aprovada é bloqueado sem chamar o modelo", () => {
  const state = createAiTrainingDiagramV6Simulation({ campaign: campaign() }).state;
  const result = turn(state, "Quanto custa?");
  assert.equal(result.kind, "scripted");
  assert.equal(result.state.node, "collect_concern");
  assert.match(result.messages[0].content, /não possui um valor aprovado/i);
  assert.ok(result.guardrailFlags.includes("diagram_v6_price_policy"));
});

test("follow-up avança manualmente até finalizar sem resposta", () => {
  let state = createAiTrainingDiagramV6Simulation({ campaign: campaign() }).state;
  for (let day = 2; day <= 7; day += 1) {
    const advanced = advanceAiTrainingDiagramV6FollowUp(state);
    state = advanced.state;
    assert.equal(state.followUpDay, day);
    assert.equal(state.outcome, "active");
  }
  const finalized = advanceAiTrainingDiagramV6FollowUp(state);
  assert.equal(finalized.state.outcome, "finalized");
  assert.equal(finalized.state.crmStatus, "finalizado");
  assert.equal(finalized.state.finalReason, "no_response");
});

test("follow-ups dos Dias 2 a 6 retomam a pergunta do nó pendente", () => {
  let state = createAiTrainingDiagramV6Simulation({ campaign: campaign() }).state;
  state = turn(state, "abdômen").state;
  assert.equal(state.node, "qualify_experience");
  for (let day = 2; day <= 6; day += 1) {
    const advanced = advanceAiTrainingDiagramV6FollowUp(state);
    state = advanced.state;
    assert.match(advanced.messages.at(-1).content, /primeira vez|já fez antes/i);
  }
});

test("objeção respondida no Dia 7 retoma exatamente o passo pendente", () => {
  let state = createAiTrainingDiagramV6Simulation({ campaign: campaign() }).state;
  for (let day = 2; day <= 7; day += 1) state = advanceAiTrainingDiagramV6FollowUp(state).state;
  const result = turn(state, "O problema é tempo");
  assert.equal(result.state.node, "collect_concern");
  assert.equal(result.state.lastObjection, "time");
  assert.equal(result.state.followUpDay, 1);
  assert.match(result.messages.at(-1).content, /O que mais te incomoda hoje/i);
});

test("opções numéricas dos follow-ups preservam o significado do diagrama", () => {
  let bodyState = createAiTrainingDiagramV6Simulation({ campaign: campaign() }).state;
  let result = turn(bodyState, "2");
  assert.equal(result.state.qualification.concernArea, "flanks");

  for (let day = 2; day <= 7; day += 1) bodyState = advanceAiTrainingDiagramV6FollowUp(bodyState).state;
  result = turn(bodyState, "4");
  assert.equal(result.state.lastObjection, "wrong_campaign");
  assert.equal(result.state.followUpDay, 1);
});

test("estado incompleto de horário volta ao período sem quebrar a simulação", () => {
  const state = createAiTrainingDiagramV6Simulation({ campaign: campaign() }).state;
  state.node = "confirm_simulated_slot";
  const result = turn(state, "sim");
  assert.equal(result.state.node, "schedule_period");
  assert.ok(result.guardrailFlags.includes("diagram_v6_invalid_slot_reset"));
});

test("pedido de encerramento finaliza somente a simulação", () => {
  const state = createAiTrainingDiagramV6Simulation({ campaign: campaign() }).state;
  const result = turn(state, "não quero continuar");
  assert.equal(result.state.outcome, "finalized");
  assert.equal(result.state.finalReason, "declined");
  assert.match(result.messages[0].content, /sem alterar nenhum cadastro real/i);
});
