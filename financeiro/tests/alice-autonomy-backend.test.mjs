import assert from "node:assert/strict";
import test from "node:test";
import { generateAliceAutonomousReply } from "../src/lib/ai-assistant/autonomy/generate.ts";
import { aliceAutonomyResponseClaimsBooking, parseAliceAutonomyConfig } from "../src/lib/ai-assistant/autonomy/policy.ts";
import { aliceAutonomySchedulingTextValid } from "../src/lib/ai-assistant/autonomy/content-policy.ts";

const context = {
  contactName: null,
  prompt: { UNIDADE: "SBC", CAMPANHA: "LIPO LASER", CONVERSA: [
    { role: "atendente", text: "Sou a Alice, da Virtuosa." },
    { role: "cliente", text: "Quero tratar o abdômen." },
  ] },
};
const response = (overrides = {}) => ({
  model: "claude-sonnet-4-6", stop_reason: "end_turn",
  usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 50, cache_creation_input_tokens: 10 },
  content: [{ type: "text", text: JSON.stringify({
    response: "O tratamento pode ajudar no contorno corporal.",
    messages: ["O tratamento pode ajudar no contorno corporal."], confidence: "high", needsHuman: false, usedKnowledge: ["manual-aprovado"],
  }) }], ...overrides,
});
const fakeFetch = (value) => async (url, request) => {
  assert.equal(url, "https://api.anthropic.com/v1/messages");
  assert.equal(JSON.parse(request.body).model, "claude-sonnet-4-6");
  assert.equal(request.method, "POST");
  return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
};

test("resposta autônoma usa somente Sonnet e registra os tokens realmente devolvidos", async () => {
  const generated = await generateAliceAutonomousReply(context, fakeFetch(response()));
  assert.equal(generated.needsHuman, false);
  assert.equal(generated.usageRecorded, true);
  assert.equal(generated.inputTokens, 100);
  assert.equal(generated.outputTokens, 20);
  assert.equal(generated.cacheReadInputTokens, 50);
  assert.equal(generated.cacheCreationInputTokens, 10);
  assert.equal(generated.costMicroUsd, 653);
});

test("confiança baixa encaminha para humano mesmo quando needsHuman contradiz a confiança", async () => {
  const value = response();
  value.content[0].text = value.content[0].text.replace('"high"', '"low"');
  assert.equal((await generateAliceAutonomousReply(context, fakeFetch(value))).needsHuman, true);
});

test("resposta sem usage não é tratada como custo zero conhecido nem enviada", async () => {
  const generated = await generateAliceAutonomousReply(context, fakeFetch(response({ usage: undefined })));
  assert.equal(generated.usageRecorded, false);
  assert.equal(generated.needsHuman, true);
  assert.deepEqual(generated.messages, []);
});

test("JSON truncado ou modelo diferente não autorizam envio e preservam o custo observado", async () => {
  for (const value of [
    response({ content: [{ type: "text", text: "{texto inválido" }] }),
    response({ model: "claude-haiku-4-5" }),
    response({ stop_reason: "max_tokens" }),
  ]) {
    const generated = await generateAliceAutonomousReply(context, fakeFetch(value));
    assert.equal(generated.needsHuman, true);
    assert.deepEqual(generated.messages, []);
    assert.equal(generated.costMicroUsd, 653);
  }
});

test("texto do modelo não pode afirmar que salvou um agendamento sem o serviço da agenda", () => {
  for (const text of ["Agendei para amanhã.", "Sua avaliação está confirmada.", "Reservei seu horário.", "O agendamento foi confirmado."]) {
    assert.equal(aliceAutonomyResponseClaimsBooking([text]), true, text);
  }
  assert.equal(aliceAutonomyResponseClaimsBooking(["Tenho uma opção para avaliação em 12/11/2026 às 10h. Pode ser?"]), false);
});

test("configurações JSON nulas e listas falham fechadas", () => {
  assert.equal(parseAliceAutonomyConfig("null").enabled, false);
  assert.equal(parseAliceAutonomyConfig("[]").enabled, false);
});

test("horários sugeridos respeitam SBC, não bloqueiam simultaneidade e expiram antes do envio", () => {
  const now = new Date("2026-11-09T12:00:00.000Z");
  assert.equal(aliceAutonomySchedulingTextValid(["Pode vir em 09/11/2026 às 10h?"], now), true);
  assert.equal(aliceAutonomySchedulingTextValid(["Na quinta (12/11) às 19h30."], now), true);
  assert.equal(aliceAutonomySchedulingTextValid(["Na quarta (12/11) à noite temos 19h ou 19h30."], now), false);
  assert.equal(aliceAutonomySchedulingTextValid(["12/11/2026 (quarta-feira), às 19h30."], now), false);
  assert.equal(aliceAutonomySchedulingTextValid(["Pode vir em 09/11/2026 às 10h?"], new Date("2026-11-09T13:00:01.000Z")), false);
  assert.equal(aliceAutonomySchedulingTextValid(["Pode vir em 09/11/2026 às 21h?"], now), false);
  assert.equal(aliceAutonomySchedulingTextValid(["Pode vir em 15/11/2026 às 10h?"], now), false);
  assert.equal(aliceAutonomySchedulingTextValid(["Pode vir amanhã às 7h?"], now), false);
  assert.equal(aliceAutonomySchedulingTextValid(["Pode vir amanhã às 10h?"], now), false);
  assert.equal(aliceAutonomySchedulingTextValid(["A sessão tem cerca de 1h de duração."], now), true);
});
