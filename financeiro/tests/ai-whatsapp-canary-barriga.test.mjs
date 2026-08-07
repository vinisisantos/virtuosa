import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeAiWhatsAppCanaryBarrigaState,
  resolveAiWhatsAppCanaryBarrigaTurn,
} from "../src/lib/ai-whatsapp-canary-barriga.ts";

const NOW = new Date("2026-08-07T12:00:00-03:00");

function turn(state, latestClientMessage, overrides = {}) {
  return resolveAiWhatsAppCanaryBarrigaTurn({
    state,
    latestClientMessage,
    contactName: "Vinicius Santos",
    now: NOW,
    ...overrides,
  });
}

function atExperienceStage(regionAnswer = "barriga") {
  const welcome = turn(null, "Olá");
  return turn(welcome.state, regionAnswer);
}

test("boas-vindas apresentam Alice e perguntam a região em duas bolhas", () => {
  const result = turn(null, "Olá");
  assert.equal(result.state.stage, "ask_region");
  assert.equal(result.messages.length, 2);
  assert.match(result.messages[0], /Olá, \*Vinicius\*/);
  assert.match(result.messages[0], /Me chamo \*Alice\*/);
  assert.match(result.messages[1], /Barriga Trincada/);
  assert.match(result.messages[1], /Abdômen, flancos, costas ou outra região/);
});

test("nome da campanha não é confundido com resposta abdômen", () => {
  const welcome = turn(null, "Olá");
  const result = turn(welcome.state, "Estou interessado no Barriga Trincada");
  assert.equal(result.state.stage, "ask_region");
  assert.deepEqual(result.state.regions, []);
  assert.match(result.messages[0], /o que mais te incomoda/i);
});

test("barriga é entendida como abdômen antes da pergunta de experiência", () => {
  const result = atExperienceStage();
  assert.equal(result.state.stage, "ask_experience");
  assert.deepEqual(result.state.regions, ["abdômen"]);
  assert.match(result.messages[0], /desenvolvido justamente para tratar essa região/i);
  assert.equal(result.messages[1], "Você já fez algum tratamento para essa região antes?");
});

test("abdômen e flancos recebem acolhimento de múltiplas regiões", () => {
  const result = atExperienceStage("abdômen e flancos");
  assert.deepEqual(result.state.regions, ["abdômen", "flancos"]);
  assert.match(result.messages[0], /mais de uma região no mesmo protocolo/i);
  assert.match(result.messages[0], /quantidade de sessões ideal/i);
});

test("primeira experiência recebe acolhimento e convite direto para avaliação", () => {
  const experience = atExperienceStage();
  const result = turn(experience.state, "Primeira vez");
  assert.equal(result.state.experience, "first_time");
  assert.equal(result.state.stage, "ask_day_type");
  assert.match(result.messages[0], /fazer parte da sua transformação/i);
  assert.match(result.messages[1], /durante a semana.*aos sábados/is);
  assert.ok(result.messages.every((message) => !/horário comercial|ambiente de simulação/i.test(message)));
});

test("experiência anterior recebe o acolhimento específico sem perguntar satisfação", () => {
  const experience = atExperienceStage();
  const result = turn(experience.state, "Já fiz antes");
  assert.equal(result.state.experience, "previous");
  assert.equal(result.state.stage, "ask_day_type");
  assert.match(result.messages[0], /tratamento que você já realizou/i);
  assert.match(result.messages[1], /agendarmos uma avaliação presencial/i);
});

test("negação de primeira vez e resposta afirmativa significam experiência anterior", () => {
  for (const answer of ["Não é a primeira vez", "Sim, já fiz"]) {
    const experience = atExperienceStage();
    const result = turn(experience.state, answer);
    assert.equal(result.state.experience, "previous");
    assert.match(result.messages[0], /tratamento que você já realizou/i);
  }
});

test("semana oferece a próxima segunda-feira às 16h e 18h", () => {
  const experience = atExperienceStage();
  const invited = turn(experience.state, "nunca fiz");
  const result = turn(invited.state, "Semana");
  assert.equal(result.state.stage, "offer_slots");
  assert.equal(result.state.offeredDate, "2026-08-10");
  assert.deepEqual(result.state.offeredTimes, ["16:00", "18:00"]);
  assert.match(result.messages[0], /segunda-feira \(10\/08\)/i);
  assert.match(result.messages[0], /16h.*18h/s);
});

test("sábado oferece o próximo sábado sem desviar do roteiro", () => {
  const experience = atExperienceStage();
  const invited = turn(experience.state, "já fiz");
  const result = turn(invited.state, "Aos sábados");
  assert.equal(result.state.stage, "offer_slots");
  assert.equal(result.state.offeredDate, "2026-08-08");
  assert.deepEqual(result.state.offeredTimes, ["10:00", "12:00"]);
  assert.match(result.messages[0], /sábado \(08\/08\)/i);
});

test("16 e 16:00 confirmam o mesmo horário simulado com endereço de Osasco", () => {
  for (const answer of ["16", "16:00"]) {
    const experience = atExperienceStage();
    const invited = turn(experience.state, "primeira vez");
    const offered = turn(invited.state, "semana");
    const result = turn(offered.state, answer);
    assert.equal(result.state.stage, "scheduled");
    assert.equal(result.state.selectedTime, "16:00");
    assert.match(result.messages[0], /segunda-feira.*10\/08.*16h/is);
    assert.match(result.messages[0], /Rua Eloy Cândido Lopes, 61/);
    assert.ok(result.guardrailFlags.includes("whatsapp_canary_no_real_booking"));
  }
});

test("horário diferente dos oferecidos não é confirmado", () => {
  const experience = atExperienceStage();
  const invited = turn(experience.state, "primeira vez");
  const offered = turn(invited.state, "semana");
  const result = turn(offered.state, "16:30");
  assert.equal(result.state.stage, "offer_slots");
  assert.match(result.messages[0], /16h.*18h/s);
});

test("pergunta fora do roteiro pode usar a IA atual sem perder o estágio", () => {
  const experience = atExperienceStage();
  const result = turn(experience.state, "O que inclui esse protocolo?");
  assert.equal(result, null);
  assert.equal(normalizeAiWhatsAppCanaryBarrigaState(experience.state).stage, "ask_experience");
});

test("histórico legado recupera o estágio de primeira experiência", () => {
  const state = normalizeAiWhatsAppCanaryBarrigaState(null, [
    { role: "assistant", content: "Entendi! Você já fez algum tratamento para essa região antes?" },
    { role: "client", content: "Primeira vez" },
    { role: "assistant", content: "A equipe precisa confirmar esse ponto no horário comercial." },
  ]);
  assert.equal(state.stage, "ask_experience");
});
