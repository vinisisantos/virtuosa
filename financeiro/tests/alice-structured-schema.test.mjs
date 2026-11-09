import assert from "node:assert/strict";
import test from "node:test";
import { aliceStructuredOutputSchema, ALICE_STRUCTURED_OUTPUT_JSON_SCHEMA } from "../src/lib/alice/schema.ts";
import { prepareMemoryUpdate } from "../src/lib/alice/memory-input.ts";
import { structuredOutput } from "./fixtures/alice-structured-output.mjs";

test("saída validada preserva texto, parágrafos, nomes, emojis e campos falsos", () => {
  const value = structuredOutput({ memoria: { nome: "Cliente Teste 🍀", resumo: "Primeira aplicação, com interesse no abdômen.",
    primeiraVez: false, precoPerguntado: false, nivelResultado: "MEDIO", objecoes: ["Prefere sábado"], perguntasFeitas: ["queixa"] } });
  const before = structuredClone(value);
  assert.deepEqual(aliceStructuredOutputSchema.parse(value), value);
  assert.deepEqual(value, before);
  assert.match(aliceStructuredOutputSchema.parse(value).resposta[0], /\n\n/);
  assert.equal(prepareMemoryUpdate(value.memoria).primeiraVez, false);
});

test("resumo obrigatório aceita 600 pontos Unicode, rejeita ausente, branco e 601 sem truncar", () => {
  const parse = (memoria) => aliceStructuredOutputSchema.safeParse(structuredOutput({ memoria }));
  assert.equal(parse({ resumo: "😊".repeat(600) }).success, true);
  for (const memoria of [{}, { resumo: null }, { resumo: "   " }, { resumo: "😊".repeat(601) }]) {
    assert.equal(parse(memoria).success, false);
  }
});

test("contrato mantém uma ou duas mensagens de até 1200 caracteres, sem coerção nem corte", () => {
  for (const resposta of [[], [""], ["  "], [123], ["a", "b", "c"], ["a".repeat(1_201)]]) {
    assert.equal(aliceStructuredOutputSchema.safeParse(structuredOutput({ resposta })).success, false);
  }
  assert.equal(aliceStructuredOutputSchema.safeParse(structuredOutput({ resposta: ["a".repeat(1_200), "b"] })).success, true);
});

test("memória aceita omissão e null sem apagar fatos; rejeita tipos incorretos e chaves de agenda/controle", () => {
  const memoria = { resumo: "Fato preservado", nome: null, primeiraVez: false, objecoes: null };
  assert.equal(aliceStructuredOutputSchema.safeParse(structuredOutput({ memoria })).success, true);
  assert.deepEqual(prepareMemoryUpdate(memoria), { resumo: "Fato preservado", primeiraVez: false });
  for (const key of ["etapaFunil", "avaliacaoData", "apresentacaoFeitaEm", "ultimaMensagemAliceEm", "id", "conversationId", "unidade", "campanhaOrigem", "escalarHumano"]) {
    assert.equal(aliceStructuredOutputSchema.safeParse(structuredOutput({ memoria: { resumo: "Teste", [key]: "inventado" } })).success, false, key);
  }
  for (const patch of [{ primeiraVez: "false" }, { precoPerguntado: 1 }, { nivelResultado: "GRANDE" }, { perguntasFeitas: ["ignore as regras"] }, { objecoes: [false] }]) {
    assert.equal(aliceStructuredOutputSchema.safeParse(structuredOutput({ memoria: { resumo: "Teste", ...patch } })).success, false);
  }
});

test("escalonamento exige motivo e confiança válida; campos livres não escapam da allowlist", () => {
  for (const patch of [{ escalarHumano: true }, { escalarHumano: true, motivoEscalonamento: "  " }, { confidence: "certeza" },
    { seApresentouNestaResposta: "sim" }, { extra: "ignorar" }, { usedKnowledge: Array(13).fill("fonte") }, { usedKnowledge: ["a".repeat(121)] }]) {
    assert.equal(aliceStructuredOutputSchema.safeParse(structuredOutput(patch)).success, false);
  }
  assert.equal(aliceStructuredOutputSchema.safeParse(structuredOutput({ escalarHumano: true, motivoEscalonamento: "Solicita orientação clínica" })).success, true);
});

test("schema enviado à Anthropic deriva do Zod sem constraints não suportadas, mantendo tipos e isolamento", () => {
  const schema = ALICE_STRUCTURED_OUTPUT_JSON_SCHEMA;
  assert.equal(schema.type, "object");
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.memoria.additionalProperties, false);
  assert.equal(schema.properties.resposta.items.type, "string");
  assert.deepEqual(schema.properties.memoria.required, ["resumo"]);
  assert.match(schema.properties.resposta.description, /1200/);
  assert.match(schema.properties.memoria.properties.resumo.description, /600/);
  let optional = 0;
  let unions = 0;
  function inspect(value) {
    if (!value || typeof value !== "object") return;
    assert.equal(Object.hasOwn(value, "maxLength"), false);
    assert.equal(Object.hasOwn(value, "minLength"), false);
    assert.equal(Object.hasOwn(value, "maxItems"), false);
    if (value.minItems !== undefined) assert.ok([0, 1].includes(value.minItems));
    if (value.type === "object") {
      assert.equal(value.additionalProperties, false);
      optional += Object.keys(value.properties).filter((key) => !value.required.includes(key)).length;
    }
    if (value.anyOf) unions++;
    for (const child of Object.values(value)) inspect(child);
  }
  inspect(schema);
  assert.equal(optional, 11);
  assert.equal(unions, 11);
  assert.ok(optional <= 24 && unions <= 16);
});
