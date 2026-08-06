import assert from "node:assert/strict";
import test from "node:test";

import {
  advanceAiTrainingDiagramV6FollowUp,
  aiTrainingDiagramV6MessageAudit,
  classifyAiTrainingDiagramV6Campaign,
  createAiTrainingDiagramV6Simulation,
  resolveAiTrainingDiagramV6Turn,
} from "../src/lib/ai-training-diagram-v6.ts";
import { restorablePublicTestToken } from "../src/lib/ai-public-test-token.ts";

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

test("auditoria pública preserva a campanha fixa do link V6", () => {
  const simulation = createAiTrainingDiagramV6Simulation({ campaign: campaign() });
  const audit = aiTrainingDiagramV6MessageAudit({
    state: simulation.state,
    source: "scripted",
    mediaKey: "campaign",
  });
  assert.equal(audit.diagramV6.campaignId, "campaign-test-1");
  assert.equal(audit.diagramV6.campaignName, "Barriga Trincada");
  assert.equal(audit.diagramV6.mediaKey, "campaign");
});

test("token recuperável do link V6 é determinístico e continua validado por hash", () => {
  const previousSecret = process.env.AI_PUBLIC_TEST_LINK_SECRET;
  process.env.AI_PUBLIC_TEST_LINK_SECRET = "segredo-exclusivo-do-teste-v6";
  try {
    const first = restorablePublicTestToken("link-v6-1");
    const restored = restorablePublicTestToken("link-v6-1");
    const other = restorablePublicTestToken("link-v6-2");
    assert.deepEqual(restored, first);
    assert.notEqual(other.token, first.token);
    assert.equal(first.tokenHint, first.token.slice(-8));
    assert.match(first.tokenHash, /^[a-f0-9]{64}$/);
    assert.ok(!first.token.includes("segredo-exclusivo-do-teste-v6"));
  } finally {
    if (previousSecret === undefined) delete process.env.AI_PUBLIC_TEST_LINK_SECRET;
    else process.env.AI_PUBLIC_TEST_LINK_SECRET = previousSecret;
  }
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
  assert.ok(result.messages.some((message) => message.mediaKey === "body-abdomen-before-after"));
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
  assert.ok(result.messages.some((message) => message.mediaKey === "body-abdomen-before-after"));
  assert.match(result.messages.map((message) => message.content).join(" "), /nova avaliação/i);
});

test("fluxo facial usa antes/depois da região e nunca autoriza venda online", () => {
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
  assert.ok(result.messages.some((message) => message.mediaKey === "facial-under-eyes-before-after"));
  assert.match(result.messages.find((message) => message.mediaKey)?.content || "", /fictício.*criado por IA/i);
  assert.ok(result.messages.every((message) => !/venda online|liberad[ao]|resultado excelente/i.test(message.content)));
});

test("cada região suportada seleciona seu próprio antes/depois fictício", () => {
  const filler = campaign({ name: "Preenchimento Facial", objective: "Lábios, olheiras e bigode chinês" });
  const botox = campaign({ name: "Botox", objective: "Linhas de expressão" });
  const cases = [
    { campaign: campaign(), answer: "abdômen", expected: "body-abdomen-before-after" },
    { campaign: campaign(), answer: "flancos", expected: "body-flanks-before-after" },
    { campaign: campaign(), answer: "costas", expected: "body-back-before-after" },
    { campaign: campaign(), answer: "braços", expected: "body-arms-before-after" },
    { campaign: campaign(), answer: "culote", expected: "body-outer-thighs-before-after" },
    { campaign: campaign(), answer: "glúteos", expected: "body-glutes-before-after" },
    { campaign: filler, answer: "lábios", expected: "facial-lips-before-after" },
    { campaign: filler, answer: "olheiras", expected: "facial-under-eyes-before-after" },
    { campaign: filler, answer: "bigode chinês", expected: "facial-nasolabial-before-after" },
    { campaign: botox, answer: "testa", expected: "facial-forehead-before-after" },
    { campaign: botox, answer: "entre as sobrancelhas", expected: "facial-glabella-before-after" },
    { campaign: botox, answer: "pés de galinha", expected: "facial-crow-feet-before-after" },
  ];

  for (const item of cases) {
    let state = createAiTrainingDiagramV6Simulation({ campaign: item.campaign }).state;
    state = turn(state, item.answer).state;
    const result = turn(state, "primeira vez");
    assert.ok(result.messages.some((message) => message.mediaKey === item.expected), item.expected);
  }
});

test("outra região não recebe antes/depois incompatível", () => {
  const filler = campaign({ name: "Preenchimento Facial", objective: "Preenchimento" });
  let state = createAiTrainingDiagramV6Simulation({ campaign: filler }).state;
  state = turn(state, "outra região").state;
  const result = turn(state, "primeira vez");
  assert.ok(result.messages.every((message) => !message.mediaKey));
});

test("opções numéricas de Botox respeitam testa, glabela e pés de galinha", () => {
  const botox = campaign({ name: "Botox", objective: "Linhas de expressão" });
  const expectedAreas = ["forehead", "glabella", "crow_feet"];
  for (const [index, expectedArea] of expectedAreas.entries()) {
    const state = createAiTrainingDiagramV6Simulation({ campaign: botox }).state;
    const result = turn(state, String(index + 1));
    assert.equal(result.state.qualification.concernArea, expectedArea);
  }
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
