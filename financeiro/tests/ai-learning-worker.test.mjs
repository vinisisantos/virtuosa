import assert from "node:assert/strict";
import test from "node:test";
import { buildDeepSeekLearningRequest } from "#lib/ai-learning/provider";
import { validAiLearningSourceIds } from "#lib/ai-learning/observer";
import { aiLearningDispatchCommand } from "#lib/ai-learning/cron";
import { isSafeAiLearningCandidate } from "#lib/ai-learning/policy";

const activatedAt = "2026-09-20T12:00:00.000Z";
const dialogue = [
  { id: "in-1", role: "cliente", human: false, text: "Tem horário?", timestamp: activatedAt },
  { id: "out-old", role: "equipe", human: true, text: "Antes", timestamp: "2026-09-20T11:59:59.000Z" },
  { id: "out-human", role: "equipe", human: true, text: "Vou consultar", timestamp: "2026-09-20T12:01:00.000Z" },
];

test("fonte exige mensagem humana posterior à ativação", () => {
  assert.equal(validAiLearningSourceIds(dialogue, ["out-human"], activatedAt), true);
  assert.equal(validAiLearningSourceIds(dialogue, ["in-1"], activatedAt), false);
  assert.equal(validAiLearningSourceIds(dialogue, ["out-old"], activatedAt), false);
  assert.equal(validAiLearningSourceIds(dialogue, ["desconhecida"], activatedAt), false);
});

test("requisição DeepSeek é stateless, estruturada e não habilita raciocínio", () => {
  const request = buildDeepSeekLearningRequest("instrução", [{ conversationId: "c1" }], { type: "object" });
  assert.equal(request.model, "deepseek-flash");
  assert.equal(request.reasoning.effort, "none");
  assert.equal(request.text.format.type, "json_schema");
  assert.equal("store" in request, false);
});

test("candidato com agenda ou preço individual é bloqueado", () => {
  const base = {
    topic: "Próximo passo",
    questions: ["Quando posso ir?"],
    answer: "Podemos consultar a agenda.",
    procedure: "",
    conditions: "Consultar disponibilidade real.",
    clinical: false,
  };
  assert.equal(isSafeAiLearningCandidate(base), true);
  assert.equal(isSafeAiLearningCandidate({ ...base, answer: "Pode vir 21/09 às 14:30" }), false);
  assert.equal(isSafeAiLearningCandidate({ ...base, answer: "Fica R$ 250" }), false);
});

test("cron só chama o worker quando existe fila de SBC vencida", () => {
  const command = aiLearningDispatchCommand("segredo'completo");
  assert.match(command, /AiLearningObservation/);
  assert.match(command, /q\.unit = 'SBC'/);
  assert.match(command, /revision > q\."processedRevision"/);
  assert.match(command, /segredo''completo/);
});
