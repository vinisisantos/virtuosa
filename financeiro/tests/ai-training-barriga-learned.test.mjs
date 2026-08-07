import assert from "node:assert/strict";
import test from "node:test";

import {
  aiTrainingBarrigaSimulatedSlots,
  createAiTrainingBarrigaLearnedState,
  resolveAiTrainingBarrigaScriptedTurn,
  validateAiTrainingBarrigaModelMessages,
} from "../src/lib/ai-training-barriga-learned.ts";

const NOW = new Date("2026-08-06T12:00:00-03:00");

test("cria estado isolado somente para Osasco e SCS", () => {
  const state = createAiTrainingBarrigaLearnedState("Osasco", NOW);
  assert.equal(state.runtimeVersion, "barriga-learned-v1");
  assert.equal(state.unit, "Osasco");
  assert.equal(state.simulatedSlots.length, 2);
  assert.throws(() => createAiTrainingBarrigaLearnedState("SBC", NOW), /indisponível/i);
});

test("gera duas opções fictícias em dias úteis", () => {
  const slots = aiTrainingBarrigaSimulatedSlots(NOW);
  assert.deepEqual(slots.map((slot) => slot.time), ["10:00", "15:00"]);
  assert.ok(slots.every((slot) => ![0, 6].includes(new Date(`${slot.date}T12:00:00Z`).getUTCDay())));
});

test("pergunta clínica recebe bloqueio sem consultar o modelo", () => {
  const state = createAiTrainingBarrigaLearnedState("SCS", NOW);
  const result = resolveAiTrainingBarrigaScriptedTurn({
    state,
    latestClientMessage: "Tenho uma doença e uso medicamento, esse procedimento é indicado para mim?",
    now: NOW,
  });
  assert.equal(result?.action, "clinical_handoff");
  assert.match(result.messages[0], /não tenho conteúdo clínico aprovado/i);
  assert.ok(result.guardrailFlags.includes("barriga_learned_no_current_knowledge"));
});

test("preço e endereço permanecem isolados das bases atuais", () => {
  const state = createAiTrainingBarrigaLearnedState("Osasco", NOW);
  const price = resolveAiTrainingBarrigaScriptedTurn({ state, latestClientMessage: "Qual o valor?", now: NOW });
  assert.equal(price?.action, "missing_commercial_fact");
  assert.match(price.messages[0], /não vou inventar/i);

  const location = resolveAiTrainingBarrigaScriptedTurn({ state, latestClientMessage: "Onde fica a clínica?", now: NOW });
  assert.equal(location?.action, "missing_location_fact");
  assert.match(location.messages[0], /não vou reutilizar a base/i);
});

test("agenda oferece duas opções e confirma somente a escolha simulada", () => {
  let state = createAiTrainingBarrigaLearnedState("Osasco", NOW);
  const offered = resolveAiTrainingBarrigaScriptedTurn({ state, latestClientMessage: "Quero agendar uma avaliação", now: NOW });
  assert.equal(offered?.state.stage, "offered_slots");
  assert.match(offered.messages[0], /duas opções fictícias/i);
  assert.match(offered.messages[0], /1\./);
  assert.match(offered.messages[0], /2\./);

  state = offered.state;
  const confirmed = resolveAiTrainingBarrigaScriptedTurn({ state, latestClientMessage: "A segunda opção", now: NOW });
  assert.equal(confirmed?.state.outcome, "scheduled");
  assert.equal(confirmed?.state.selectedSlotId, "slot-b");
  assert.match(confirmed.messages[0], /nenhum agendamento real foi criado/i);
});

test("recusa encerra a simulação e bloqueia novas sugestões", () => {
  const state = createAiTrainingBarrigaLearnedState("SCS", NOW);
  const result = resolveAiTrainingBarrigaScriptedTurn({ state, latestClientMessage: "Não tenho interesse, pare de mandar", now: NOW });
  assert.equal(result?.state.outcome, "closed");
  assert.equal(result?.action, "respect_opt_out");
});

test("validador rejeita promessa, confirmação falsa, fatos e perguntas múltiplas", () => {
  assert.equal(validateAiTrainingBarrigaModelMessages(["Entendi. Qual é seu principal objetivo?"]).valid, true);
  assert.ok(validateAiTrainingBarrigaModelMessages(["Você vai eliminar gordura com resultado garantido."]).flags.includes("unsafe_claim"));
  assert.ok(validateAiTrainingBarrigaModelMessages(["Seu horário está confirmado."]).flags.includes("false_booking_confirmation"));
  assert.ok(validateAiTrainingBarrigaModelMessages(["O valor é R$ 499."]).flags.includes("unapproved_fact"));
  assert.ok(validateAiTrainingBarrigaModelMessages(["O que deseja? Quando pode?"]).flags.includes("multiple_questions"));
});
