import assert from "node:assert/strict";
import test from "node:test";

import {
  escapePostgresLikePattern,
  normalizeInboxSearchText,
  parseInboxSearchQuery,
} from "../src/lib/whatsapp/inbox-search.ts";

test("ignora busca textual com menos de três caracteres", () => {
  assert.equal(parseInboxSearchQuery("ab"), null);
});

test("aceita busca textual a partir de três caracteres", () => {
  assert.deepEqual(parseInboxSearchQuery("  Maria   Silva "), {
    text: "Maria Silva",
    digits: "",
    textPattern: "%maria silva%",
    digitsPattern: null,
  });
});

test("normaliza maiúsculas e acentos no padrão textual", () => {
  assert.equal(normalizeInboxSearchText("João CÉZAR"), "joao cezar");
  assert.equal(parseInboxSearchQuery("João")?.textPattern, "%joao%");
});

test("aceita telefone a partir de quatro dígitos", () => {
  assert.deepEqual(parseInboxSearchQuery("11-98"), {
    text: "11-98",
    digits: "1198",
    textPattern: null,
    digitsPattern: "%1198%",
  });
});

test("não habilita busca de telefone com apenas três dígitos", () => {
  assert.equal(parseInboxSearchQuery("12-3"), null);
});

test("escapa curingas do LIKE para pesquisar o texto literalmente", () => {
  assert.equal(escapePostgresLikePattern("10%_off\\hoje"), "10\\%\\_off\\\\hoje");
});

test("limita o termo antes de produzir os padrões", () => {
  const query = parseInboxSearchQuery("a".repeat(200));
  assert.equal(query?.text.length, 120);
  assert.equal(query?.textPattern?.length, 122);
});
