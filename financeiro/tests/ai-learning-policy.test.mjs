import assert from "node:assert/strict";
import test from "node:test";
import {
  AI_LEARNING_DAILY_BUDGET_MICRO_USD,
  aiLearningBudgetAllows,
  aiLearningReservation,
  parseAiLearningConfig,
  sanitizeLearningText,
  validateAiLearningCandidate,
} from "#lib/ai-learning/policy";
import { isEligibleHumanLearningMessage } from "#lib/ai-learning/queue";

test("configuração do piloto falha fechada e limita o orçamento", () => {
  assert.equal(parseAiLearningConfig(null).enabled, false);
  const config = parseAiLearningConfig(JSON.stringify({
    enabled: true,
    activatedAt: "2026-09-20T12:00:00.000Z",
    unit: "Osasco",
    dailyBudgetMicroUsd: 9_000_000,
  }));
  assert.equal(config.enabled, true);
  assert.equal(config.unit, "SBC");
  assert.equal(config.dailyBudgetMicroUsd, AI_LEARNING_DAILY_BUDGET_MICRO_USD);
});

test("sanitização remove PII, agenda, preço e conteúdo clínico individual", () => {
  assert.equal(
    sanitizeLearningText("Maria, ligue 11 99442-1525 às 14:30 por R$ 250", ["Maria"]),
    "[pessoa], ligue [telefone] às [horário] por [valor]",
  );
  assert.equal(
    sanitizeLearningText("Tenho diabetes e uso medicamento"),
    "[conteúdo clínico individual omitido]",
  );
});

test("somente resposta textual humana entra na fila", () => {
  const base = {
    id: "m1",
    conversationId: "c1",
    body: "Podemos marcar para amanhã?",
    type: "text",
    fromMe: true,
    status: "sent",
    respondedBy: "u1",
    respondedByName: "Claudenice",
  };
  assert.equal(isEligibleHumanLearningMessage(base), true);
  assert.equal(isEligibleHumanLearningMessage({ ...base, respondedByName: "Automação" }), false);
  assert.equal(isEligibleHumanLearningMessage({ ...base, fromMe: false }), false);
  assert.equal(isEligibleHumanLearningMessage({ ...base, type: "image" }), false);
});

test("candidato exige evidência reutilizável completa", () => {
  const result = validateAiLearningCandidate({
    topic: "Disponibilidade",
    questions: ["Tem horário à tarde?"],
    answer: "Vou consultar os horários disponíveis para o período solicitado.",
    procedure: "",
    conditions: "Confirmar a agenda real antes de oferecer.",
    clinical: false,
  });
  assert.equal(result.topic, "Disponibilidade");
  assert.throws(() => validateAiLearningCandidate({ ...result, clinical: true }));
});

test("reserva usa preço de pico e trava teto diário", () => {
  assert.equal(aiLearningReservation(14_000, 3_000), 7_800);
  assert.equal(aiLearningBudgetAllows({ reserved: 492_199, batches: 1 }, 7_800), true);
  assert.equal(aiLearningBudgetAllows({ reserved: 492_201, batches: 1 }, 7_800), false);
  assert.equal(aiLearningBudgetAllows({ reserved: 0, batches: 24 }, 1), false);
});
