import assert from "node:assert/strict";
import test from "node:test";

import { buildSbcEvaluationOptions, deriveSbcEvaluationChoice, schedulingSuggestionExpiry, validateSbcEvaluationChoice } from "#lib/ai-assistant/sbc-scheduling-policy";

test("horários de SBC seguem dias úteis e sábado, inclusive limites", () => {
  const options = buildSbcEvaluationOptions(new Date("2026-11-08T12:00:00Z"), 7);
  assert.ok(options.some((slot) => slot === "2026-11-09T10:00"));
  assert.ok(options.some((slot) => slot === "2026-11-09T20:00"));
  assert.ok(options.some((slot) => slot === "2026-11-14T08:00"));
  assert.ok(options.some((slot) => slot === "2026-11-14T13:00"));
  assert.ok(!options.some((slot) => slot.startsWith("2026-11-08")));
  assert.ok(!options.some((slot) => slot === "2026-11-14T13:30"));
});

const offered = { body: "Podemos agendar para 09/11/2026 às 10h30?", fromMe: true, status: "delivered" };
const accepted = { body: "Pode ser", fromMe: false, status: "read" };
const now = new Date("2026-11-08T12:00:00Z");

test("aceita somente opção única efetivamente enviada e aceitação inequívoca", () => {
  assert.equal(validateSbcEvaluationChoice({ offer: offered, reply: accepted, date: "2026-11-09", time: "10:30", now }), true);
});

test("não aceita oferta pendente, duas opções, mudança de data ou resposta ambígua", () => {
  for (const input of [
    { offer: { ...offered, status: "pending" }, reply: accepted },
    { offer: { ...offered, body: "Pode ser 09/11/2026 às 10h30 ou às 11h?" }, reply: accepted },
    { offer: offered, reply: { ...accepted, body: "Pode ser outro dia?" } },
    { offer: offered, reply: { ...accepted, body: "Não pode ser" } },
    { offer: offered, reply: { ...accepted, body: "Ainda vou pensar" } },
    { offer: { ...offered, body: "Não tenho agenda em 09/11/2026 às 10h30." }, reply: accepted },
    { offer: { ...offered, body: "Seu atendimento anterior foi em 09/11/2026 às 10h30." }, reply: accepted },
  ]) assert.equal(validateSbcEvaluationChoice({ ...input, date: "2026-11-09", time: "10:30", now }), false);
  assert.equal(validateSbcEvaluationChoice({ offer: offered, reply: accepted, date: "2026-11-10", time: "10:30", now }), false);
});

test("não agenda fora dos horários aprovados nem no passado", () => {
  assert.equal(validateSbcEvaluationChoice({ offer: { ...offered, body: "Pode ser 09/11/2026 às 21h?" }, reply: accepted, date: "2026-11-09", time: "21:00", now }), false);
  assert.equal(validateSbcEvaluationChoice({ offer: { ...offered, body: "Pode ser 08/11/2026 às 10h?" }, reply: accepted, date: "2026-11-08", time: "10:00", now }), false);
});

test("identifica uma escolha explícita entre horários oferecidos no mesmo dia", () => {
  assert.equal(deriveSbcEvaluationChoice({ offer: { ...offered, body: "Na segunda 09/11 tenho 10h30 ou 11h. Qual prefere?" }, reply: { ...accepted, body: "Pode ser às 11h" }, now }), "2026-11-09T11:00");
  assert.equal(deriveSbcEvaluationChoice({ offer: { ...offered, body: "Na segunda 09/11 tenho 10h30 ou 11h. Qual prefere?" }, reply: accepted, now }), null);
  assert.equal(deriveSbcEvaluationChoice({ offer: { ...offered, body: "Atendemos das 10h às 11h no dia 09/11." }, reply: accepted, now }), null);
});

test("sugestão de horário expira na próxima meia hora, sem afetar mensagens comuns", () => {
  const current = new Date("2026-11-09T13:29:00Z");
  assert.equal(schedulingSuggestionExpiry(["Pode ser 09/11/2026 às 10h30?"], current), "2026-11-09T13:30:00.000Z");
  assert.equal(schedulingSuggestionExpiry(["Como posso ajudar?"], current), null);
});
