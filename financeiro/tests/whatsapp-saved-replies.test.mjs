import assert from "node:assert/strict";
import test from "node:test";

import {
  SAVED_REPLY_CATEGORY_TITLE_MAX_LENGTH,
  filterSavedRepliesByCampaign,
  normalizeSavedReplyCategoryTitle,
  reorderSavedRepliesByVisibleIds,
  savedReplyCategoryIdsForCampaign,
  savedReplyIsAvailableInCategory,
  validateSavedReplyCategoryInput,
  validateSavedReplyInput,
  validateSavedReplyOrderInput,
} from "../src/lib/whatsapp/saved-replies.ts";

test("valida uma ordem completa sem IDs repetidos", () => {
  assert.deepEqual(validateSavedReplyOrderInput({ ids: [" resposta-1 ", "resposta-2"] }), {
    value: { ids: ["resposta-1", "resposta-2"] },
  });
  assert.equal(validateSavedReplyOrderInput({ ids: ["resposta-1", "resposta-1"] }).error, "A ordem contém respostas repetidas");
  assert.equal(validateSavedReplyOrderInput({ ids: [] }).error, "Informe a ordem das respostas rápidas");
});

test("reordena somente as respostas visíveis e preserva as demais posições", () => {
  const replies = ["a", "oculta-1", "b", "oculta-2"].map((id) => ({ id }));
  assert.deepEqual(
    reorderSavedRepliesByVisibleIds(replies, ["b", "a"]).map((reply) => reply.id),
    ["b", "oculta-1", "a", "oculta-2"],
  );
});

test("normaliza categorias sem diferenciar acentos, caixa ou espaços", () => {
  assert.equal(normalizeSavedReplyCategoryTitle("  Harmonização   de GLÚTEO "), "harmonizacao de gluteo");
});

test("valida o nome e o limite de uma categoria", () => {
  assert.equal(validateSavedReplyCategoryInput({ title: "   " }).error, "Informe um nome para a categoria");
  assert.equal(
    validateSavedReplyCategoryInput({ title: "x".repeat(SAVED_REPLY_CATEGORY_TITLE_MAX_LENGTH + 1) }).error,
    `O nome pode ter até ${SAVED_REPLY_CATEGORY_TITLE_MAX_LENGTH} caracteres`,
  );
  assert.deepEqual(validateSavedReplyCategoryInput({ title: "  Glúteos   Perfeito  " }), {
    value: {
      title: "Glúteos Perfeito",
      normalizedTitle: "gluteos perfeito",
    },
  });
});

test("preserva uma categoria válida e converte categoria vazia em resposta global", () => {
  assert.equal(validateSavedReplyInput({
    title: "Explicação",
    content: "Mensagem",
    categoryId: "categoria-1",
  }).value.categoryId, "categoria-1");

  assert.equal(validateSavedReplyInput({
    title: "Explicação",
    content: "Mensagem",
    categoryId: "   ",
  }).value.categoryId, null);
});

test("resposta sem categoria específica fica disponível em todas as categorias", () => {
  assert.equal(savedReplyIsAvailableInCategory(null, "gluteos"), true);
  assert.equal(savedReplyIsAvailableInCategory(null, "facial"), true);
  assert.equal(savedReplyIsAvailableInCategory("gluteos", "gluteos"), true);
  assert.equal(savedReplyIsAvailableInCategory("gluteos", "facial"), false);
});

test("associa campanhas às categorias equivalentes apesar de acentos e plural", () => {
  const categories = [
    { id: "perfeito", title: "Glúteos Perfeito" },
    { id: "harmonizacao", title: "Harmonização de Glúteo" },
    { id: "barriga", title: "Barriga Trincada" },
  ];

  assert.deepEqual(
    savedReplyCategoryIdsForCampaign("GLÚTEOS PERFEITOS - CONTA SECUNDÁRIA", categories),
    ["perfeito"],
  );
  assert.deepEqual(
    savedReplyCategoryIdsForCampaign("Harmonização dos Glúteos", categories),
    ["harmonizacao"],
  );
  assert.deepEqual(
    savedReplyCategoryIdsForCampaign("VIM PELO BARRIGA TRINCADA", categories),
    ["barriga"],
  );
});

test("filtra pela campanha e preserva somente respostas globais quando a categoria não existe", () => {
  const categories = [
    { id: "perfeito", title: "Glúteos Perfeito" },
    { id: "barriga", title: "Barriga Trincada" },
  ];
  const replies = [
    { id: "global", categoryId: null },
    { id: "perfeito", categoryId: "perfeito" },
    { id: "barriga", categoryId: "barriga" },
  ];

  assert.deepEqual(
    filterSavedRepliesByCampaign(replies, "Glúteo Perfeito", categories).map((reply) => reply.id),
    ["global", "perfeito"],
  );
  assert.deepEqual(
    filterSavedRepliesByCampaign(replies, "Harmonização de Glúteos", categories).map((reply) => reply.id),
    ["global"],
  );
  assert.deepEqual(
    filterSavedRepliesByCampaign(replies, null, categories).map((reply) => reply.id),
    ["global", "perfeito", "barriga"],
  );
});
