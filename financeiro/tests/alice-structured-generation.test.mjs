import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { buildAliceContext } from "../src/lib/alice/build-context.ts";
import { buildAliceStructuredRequest } from "../src/lib/alice/structured-request.ts";
import { generateAliceStructuredReply } from "../src/lib/alice/structured-generation.ts";
import { aliceAutonomyCostMicroUsd } from "../src/lib/ai-assistant/autonomy/policy.ts";
import { contextInput, scope, memory, message } from "./fixtures/alice-memory-context.mjs";
import { structuredOutput, providerResult, providerResponse } from "./fixtures/alice-structured-output.mjs";

const context = () => ({ scope, prompt: buildAliceContext(contextInput()) });
const cost = aliceAutonomyCostMicroUsd({ input: 100, output: 20, cacheRead: 10, cacheCreation: 5 });
const dependencies = (fetcher, rest = {}) => ({ fetcher, apiKey: "fake-key-for-isolated-tests", ...rest });

function assertHandoff(result, reason) {
  assert.equal(result.status, "handoff");
  assert.equal(result.reason, reason);
  assert.equal(result.proposal, null);
}

test("requisição mantém Sonnet e base aprovada; substitui contrato sem promover dados a instruções", () => {
  const marker = "CONTEUDO_NAO_CONFIAVEL_DE_CLIENTE";
  const input = { scope, prompt: buildAliceContext(contextInput({ memory: memory({ resumo: marker }) })) };
  const request = buildAliceStructuredRequest(input);
  assert.equal(request.model, "claude-sonnet-4-6");
  assert.equal(request.max_tokens, 2048);
  assert.equal(request.output_config.format.type, "json_schema");
  assert.equal(request.output_config.format.schema.properties.memoria.type, "object");
  assert.match(request.system, /CONTINUIDADE_CONVERSACIONAL_ALICE_V1/);
  assert.match(request.system, /resposta substitui messages e response/);
  assert.match(request.system, /não comprova|nunca significa apresentação/);
  assert.match(request.system, /perguntas desta resposta ainda não enviada/);
  assert.doesNotMatch(request.system, /CONTEUDO_NAO_CONFIAVEL_DE_CLIENTE/);
  assert.match(request.messages[0].content, /CONTEUDO_NAO_CONFIAVEL_DE_CLIENTE/);
  assert.match(request.system, /Informação sintética do procedimento/);
  assert.match(request.system, /não escale só por esse conflito de nomes/);
});

test("medo geral recebe instruções de acolhimento sem remover as travas clínicas", () => {
  const fearContext = { scope, prompt: buildAliceContext(contextInput({ history: [message("client", "Tenho medo de agulha.")] })) };
  const request = buildAliceStructuredRequest(fearContext);
  assert.match(request.system, /ACOLHIMENTO_SEM_PRESSAO_SBC_V1/);
  assert.match(request.system, /Condição de saúde, medicação, gestação\/amamentação ou problema anterior exigem avaliação/);
});

test("complemento após reserva responde só à dúvida sem repetir a confirmação ou sugerir outra agenda", () => {
  const request = buildAliceStructuredRequest({ ...context(), bookingFollowup: true });
  assert.match(request.system, /COMPLEMENTO_APOS_AGENDAMENTO/);
  assert.match(request.system, /caixas complementares de até 200 palavras/);
  assert.match(request.system, /não repita a confirmação/);
  assert.match(request.system, /não ofereça novos horários/);
  assert.doesNotMatch(buildAliceStructuredRequest(context()).system, /COMPLEMENTO_APOS_AGENDAMENTO/);
  const fear = buildAliceStructuredRequest({ ...context(), bookingFollowup: true,
    prompt: { ...context().prompt, MENSAGENS_RECENTES_SEM_RESPOSTA: [{ text: 'Morro de medo de agulha' }, { text: 'Dói muito?' }] } });
  assert.match(fear.system, /ACOLHIMENTO_SEM_PRESSAO_SBC_V1/);
});

test("geração válida retorna só proposta, sem gravar memória, rascunho ou apresentação", async () => {
  const input = context();
  const before = structuredClone(input);
  const output = structuredOutput({ seApresentouNestaResposta: true });
  let calls = 0;
  const result = await generateAliceStructuredReply(input, dependencies(async (url, options) => {
    calls++;
    assert.equal(url, "https://api.anthropic.com/v1/messages");
    assert.equal(options.headers["x-api-key"], "fake-key-for-isolated-tests");
    assert.equal(options.cache, "no-store");
    assert.equal(options.signal.aborted, false);
    return providerResponse(output);
  }));
  assert.equal(calls, 1);
  assert.equal(result.status, "draft");
  assert.deepEqual(result.proposal, output);
  assert.equal(result.metrics.costMicroUsd, cost);
  assert.equal(result.metrics.usageRecorded, true);
  assert.equal(result.metrics.attempts, 1);
  assert.deepEqual(input, before);
});

test("JSON inválido permite uma correção sem eco da saída e soma tokens/custo das duas chamadas", async () => {
  const requests = [];
  const result = await generateAliceStructuredReply(context(), dependencies(async (_url, options) => {
    requests.push({ body: JSON.parse(options.body), signal: options.signal });
    return requests.length === 1 ? providerResponse("INVALIDO_NAO_ECOAR_EM_PROMPT") : providerResponse();
  }));
  assert.equal(result.status, "draft");
  assert.equal(requests.length, 2);
  assert.equal(requests[0].signal, requests[1].signal);
  assert.equal(requests[0].body.messages[0].content, requests[1].body.messages[0].content);
  assert.doesNotMatch(JSON.stringify(requests[1].body), /INVALIDO_NAO_ECOAR_EM_PROMPT/);
  assert.match(requests[1].body.system, /CORRECAO_DE_FORMATO/);
  assert.equal(result.metrics.inputTokens, 200);
  assert.equal(result.metrics.outputTokens, 40);
  assert.equal(result.metrics.cacheReadInputTokens, 20);
  assert.equal(result.metrics.cacheCreationInputTokens, 10);
  assert.equal(result.metrics.costMicroUsd, cost * 2);
});

test("duas saídas inválidas descartam respostas e memória sem terceira chamada", async () => {
  let calls = 0;
  const result = await generateAliceStructuredReply(context(), dependencies(async () => {
    calls++;
    return providerResponse(structuredOutput({ memoria: { resumo: "Teste", avaliacaoData: "amanhã" } }));
  }));
  assertHandoff(result, "invalid_output");
  assert.equal(calls, 2);
  assert.equal(result.metrics.costMicroUsd, cost * 2);
});

test("baixa confiança e pedido de humano não provocam nova geração nem mensagem utilizável", async () => {
  for (const output of [structuredOutput({ confidence: "low" }), structuredOutput({ escalarHumano: true, motivoEscalonamento: "Risco clínico" })]) {
    let calls = 0;
    const result = await generateAliceStructuredReply(context(), dependencies(async () => { calls++; return providerResponse(output); }));
    assertHandoff(result, output.escalarHumano ? "human_review_requested" : "human_review_low_confidence");
    assert.equal(calls, 1);
    assert.equal(result.metrics.costMicroUsd, cost);
  }
});

test("201 palavras são divididas sem nova geração, preservando conteúdo e métricas", async () => {
  const text = Array(201).fill("sim").join(" ");
  let calls = 0;
  const result = await generateAliceStructuredReply(context(), dependencies(async () => {
    calls++; return providerResponse(structuredOutput({ resposta: [text] }));
  }));
  assert.equal(result.status, "draft");
  assert.equal(calls, 1);
  assert.deepEqual(result.proposal.resposta.map(part => part.split(/\s+/u).length), [200, 1]);
  assert.equal(result.proposal.resposta.join(" "), text);
  assert.equal(result.metrics.costMicroUsd, cost);
});

test("preserva bloqueio existente de agendamento não comprovado", async () => {
  const result = await generateAliceStructuredReply(context(), dependencies(async () => providerResponse(structuredOutput({ resposta: ["Agendei para amanhã às 10h."] }))));
  assertHandoff(result, "unproven_booking");
  assert.equal(result.metrics.attempts, 1);
});

test("rede, HTTP e JSON do envelope inválido não são repetidos nem apresentados com custo zero", async () => {
  for (const fetcher of [async () => { throw new Error("falha privada"); }, async () => new Response("", { status: 429 }),
    async () => new Response("", { status: 503 }), async () => new Response("nao-json", { status: 200 })]) {
    let calls = 0;
    const result = await generateAliceStructuredReply(context(), dependencies(async (...args) => { calls++; return fetcher(...args); }));
    assertHandoff(result, "provider_unavailable");
    assert.equal(calls, 1);
    assert.equal(result.metrics.costMicroUsd, null);
    assert.equal(result.metrics.knownCostMicroUsd, 0);
    assert.equal(result.metrics.usageRecorded, false);
    assert.doesNotMatch(JSON.stringify(result), /falha privada/);
  }
});

test("recusa e truncamento falham fechados sem retry, mantendo custo informado", async () => {
  for (const stop_reason of ["refusal", "max_tokens", "tool_use", "pause_turn"]) {
    const result = await generateAliceStructuredReply(context(), dependencies(async () => providerResponse("texto incompleto", { stop_reason })));
    assertHandoff(result, stop_reason === "refusal" ? "provider_refusal" : "provider_incomplete");
    assert.equal(result.metrics.attempts, 1);
    assert.equal(result.metrics.costMicroUsd, cost);
  }
});

test("modelo inesperado, usage ausente ou inválido não libera saída nem reparo", async () => {
  for (const changes of [{ model: "outro-modelo" }, { usage: null }, { usage: { input_tokens: -1, output_tokens: 20 } },
    { usage: { input_tokens: "100", output_tokens: 20 } }, { usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: -1 } }]) {
    const result = await generateAliceStructuredReply(context(), dependencies(async () => providerResponse(undefined, changes)));
    assertHandoff(result, changes.model ? "unexpected_model" : "usage_unavailable");
    assert.equal(result.metrics.costMicroUsd, null);
    assert.equal(result.metrics.attempts, 1);
  }
});

test("segunda chamada sem usage mantém subtotal conhecido, nunca informa custo total exato", async () => {
  let calls = 0;
  const result = await generateAliceStructuredReply(context(), dependencies(async () => {
    calls++;
    return calls === 1 ? providerResponse("JSON inválido") : providerResponse(undefined, { usage: null });
  }));
  assertHandoff(result, "usage_unavailable");
  assert.equal(result.metrics.costMicroUsd, null);
  assert.equal(result.metrics.knownCostMicroUsd, cost);
  assert.equal(result.metrics.inputTokens, 100);
});

test("usage sem cache equivale a zero cache; conteúdo não textual não gera reparo", async () => {
  const result = await generateAliceStructuredReply(context(), dependencies(async () => providerResponse(undefined, {
    usage: { input_tokens: 100, output_tokens: 20 }, content: [{ type: "tool_use", name: "nao_permitido" }],
  })));
  assertHandoff(result, "provider_response_invalid");
  assert.equal(result.metrics.attempts, 1);
  assert.equal(result.metrics.costMicroUsd, 600);
});

test("escopo de outra unidade/caixa, contexto legado e payload grande são recusados antes da API", async () => {
  for (const [input, reason] of [
    [{ ...context(), scope: { ...scope, unidade: "Osasco" } }, "invalid_scope"],
    [{ ...context(), scope: { ...scope, instanceId: "outra-instancia" } }, "invalid_scope"],
    [{ ...context(), prompt: { UNIDADE: "SBC", CONVERSA: [] } }, "invalid_context"],
    [{ ...context(), prompt: { ...context().prompt, TEXTO: "a".repeat(80_000) } }, "context_too_large"],
  ]) {
    const result = await generateAliceStructuredReply(input, dependencies(async () => { throw new Error("Não deveria chamar API"); }));
    assertHandoff(result, reason);
    assert.equal(result.metrics.attempts, 0);
    assert.equal(result.metrics.costMicroUsd, 0);
  }
});

test("sem chave não inicia requisição e não registra segredo em resultado", async () => {
  const result = await generateAliceStructuredReply(context(), dependencies(async () => { assert.fail("Não deve chamar"); }, { apiKey: "" }));
  assertHandoff(result, "not_configured");
  assert.equal(result.metrics.attempts, 0);
});

test("janela de 48s é compartilhada e sem tempo suficiente não inicia o reparo", async () => {
  let time = 0;
  let calls = 0;
  const result = await generateAliceStructuredReply(context(), dependencies(async () => {
    calls++; time = 47_000;
    return providerResponse("Inválido");
  }, { now: () => time }));
  assertHandoff(result, "deadline");
  assert.equal(calls, 1);
  assert.equal(result.metrics.generationMs, 47_000);
  assert.equal(result.metrics.costMicroUsd, cost);
});

test("resposta que chega após o prazo não é liberada, mas usage conhecido é contado", async () => {
  let time = 0;
  let calls = 0;
  const result = await generateAliceStructuredReply(context(), dependencies(async () => {
    calls++; time = calls === 1 ? 20_000 : 48_001;
    return providerResponse(calls === 1 ? "Inválido" : structuredOutput());
  }, { now: () => time }));
  assertHandoff(result, "deadline");
  assert.equal(calls, 2);
  assert.equal(result.metrics.costMicroUsd, cost * 2);
});

test("cancelamento antes ou durante chamada não libera resposta nem inicia retry", async () => {
  const controller = new AbortController();
  controller.abort();
  const before = await generateAliceStructuredReply(context(), dependencies(async () => { assert.fail("Não deve chamar"); }, { signal: controller.signal }));
  assertHandoff(before, "cancelled");
  assert.equal(before.metrics.attempts, 0);
  const during = new AbortController();
  const result = await generateAliceStructuredReply(context(), dependencies(async () => {
    during.abort();
    return providerResponse();
  }, { signal: during.signal }));
  assertHandoff(result, "cancelled");
  assert.equal(result.metrics.attempts, 1);
  assert.equal(result.metrics.costMicroUsd, cost);
});

test("envelope sem objeto ou texto não vira resposta vazia ou custo contabilizado incorretamente", async () => {
  const noObject = await generateAliceStructuredReply(context(), dependencies(async () => new Response("null")));
  assertHandoff(noObject, "provider_response_invalid");
  assert.equal(noObject.metrics.costMicroUsd, null);
  const noText = await generateAliceStructuredReply(context(), dependencies(async () => new Response(JSON.stringify(providerResult(undefined, { content: [] })))));
  assertHandoff(noText, "provider_response_invalid");
  assert.equal(noText.metrics.costMicroUsd, cost);
});

test("geração estruturada continua sem repositório ou envio mesmo integrada ao worker", async () => {
  const structured = await readFile(new URL("../src/lib/alice/structured-generation.ts", import.meta.url), "utf8");
  assert.doesNotMatch(structured, /sendAutomationText|applyMemoryUpdate|markPresentationDone|@\/lib\/db|@\/lib\/alice\/memory["']/);
});
