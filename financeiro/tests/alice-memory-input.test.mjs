import assert from "node:assert/strict";
import test from "node:test";
import { prepareMemoryUpdate } from "../src/lib/alice/memory-input.ts";

test("patch ignora null/undefined e texto vazio, preservando false e informações sem anonimização", () => {
  const input = { nome: "Camila Teste 🍀", queixaPrincipal: "Flacidez\n\nTenho uma dúvida.", primeiraVez: false, resumo: null, precoInformado: undefined, procedimentoInteresse: "  " };
  assert.deepEqual(prepareMemoryUpdate(input), {
    nome: input.nome, queixaPrincipal: input.queixaPrincipal, primeiraVez: false,
  });
  assert.deepEqual(prepareMemoryUpdate({ objecoes: null, perguntasFeitas: null }), {});
});

test("listas são copiadas e normalizadas sem duplicar, sem alterar o objeto de entrada", () => {
  const input = { perguntasFeitas: ["queixa", " queixa ", "", "nome"], objecoes: ["valor", "valor"] };
  const patch = prepareMemoryUpdate(input);
  assert.deepEqual(patch, { objecoes: ["valor"], perguntasFeitas: ["queixa", "nome"] });
  assert.deepEqual(input.perguntasFeitas, ["queixa", " queixa ", "", "nome"]);
  assert.notEqual(patch.perguntasFeitas, input.perguntasFeitas);
  assert.deepEqual(prepareMemoryUpdate({ perguntasFeitas: [] }).perguntasFeitas, []);
});

test("resumo valida os 600 caracteres do PostgreSQL sem truncar ou mascarar", () => {
  assert.equal(prepareMemoryUpdate({ resumo: "😊".repeat(600) }).resumo, "😊".repeat(600));
  assert.throws(() => prepareMemoryUpdate({ resumo: "😊".repeat(601) }), { code: "invalid_update" });
});

test("rejeita tipos, enum e formato inválidos antes de qualquer acesso ao banco", () => {
  for (const input of [null, [], "texto", { nome: 123 }, { primeiraVez: "false" }, { nivelResultado: "INVALIDO" },
    { objecoes: [null] }, { perguntasFeitas: "queixa" }, { resumo: {} }, Object.create({ nome: "herdado" })]) {
    assert.throws(() => prepareMemoryUpdate(input), { code: "invalid_update" });
  }
  for (const level of ["NATURAL", "MEDIO", "EVIDENTE", "NAO_INFORMADO"]) {
    assert.equal(prepareMemoryUpdate({ nivelResultado: level }).nivelResultado, level);
  }
});

test("patch não pode alterar identidade, agenda, status ou prova de envio", () => {
  for (const field of ["id", "conversationId", "unidade", "etapaFunil", "avaliacaoData", "apresentacaoFeitaEm",
    "ultimaMensagemAliceEm", "ultimaMensagemClienteEm", "createdAt", "updatedAt", "__proto__"]) {
    const input = JSON.parse(`{"${field}":"forjado"}`);
    assert.throws(() => prepareMemoryUpdate(input), { code: "invalid_update" });
  }
});
