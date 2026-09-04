import assert from "node:assert/strict";
import test from "node:test";

import {
  SAVED_REPLY_CATEGORY_TITLE_MAX_LENGTH,
  buildSavedReplyCampaignOptions,
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
      campaignName: null,
    },
  });
  assert.deepEqual(validateSavedReplyCategoryInput({
    title: "  Pasta de textos  ",
    campaignName: "  Harmonização   Mamas  ",
  }), {
    value: {
      title: "Pasta de textos",
      normalizedTitle: "pasta de textos",
      campaignName: "Harmonização Mamas",
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
    { id: "perfeito-120", title: "Glúteos Perfeitos 120ml" },
    { id: "harmonizacao", title: "Harmonização de Glúteo" },
    { id: "barriga", title: "Barriga Trincada" },
    { id: "combo", title: "Combo de Harmonização" },
    { id: "rosto", title: "Microfocado Full Face + Bioestimulador" },
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
  assert.deepEqual(
    savedReplyCategoryIdsForCampaign("Glúteos Perfeito - 120 ml", categories),
    ["perfeito-120"],
  );
  assert.deepEqual(
    savedReplyCategoryIdsForCampaign("COMBO HARMONIZAÇÃO", categories),
    ["combo"],
  );
  assert.deepEqual(
    savedReplyCategoryIdsForCampaign("Adeus Rosto Cansado", categories),
    ["rosto"],
  );
});

test("mantém respostas de Glúteos Perfeitos 60ml e 120ml em categorias exclusivas", () => {
  const categories = [
    { id: "perfeito-60", title: "Glúteos Perfeitos" },
    { id: "perfeito-120", title: "Glúteos Perfeitos 120ml" },
  ];
  const replies = [
    { id: "global", categoryId: null },
    { id: "resposta-60", categoryId: "perfeito-60" },
    { id: "resposta-120", categoryId: "perfeito-120" },
  ];

  assert.deepEqual(
    filterSavedRepliesByCampaign(replies, "Glúteos Perfeitos", categories).map((reply) => reply.id),
    ["global", "resposta-60"],
  );
  assert.deepEqual(
    filterSavedRepliesByCampaign(replies, "Glúteos Perfeitos 120ml", categories).map((reply) => reply.id),
    ["global", "resposta-120"],
  );
});

test("conecta as duas novas campanhas às categorias exclusivas de respostas rápidas", () => {
  const categories = [
    { id: "combo", title: "Combo Harmonização" },
    { id: "rosto", title: "Adeus Rosto Cansado" },
  ];

  assert.deepEqual(
    savedReplyCategoryIdsForCampaign("Combo Harmonização", categories),
    ["combo"],
  );
  assert.deepEqual(
    savedReplyCategoryIdsForCampaign("Adeus Rosto Cansado", categories),
    ["rosto"],
  );
});

test("associa explicitamente uma pasta com nome livre à campanha escolhida", () => {
  const categories = [
    { id: "mamas", title: "Mensagens para avaliação", campaignName: "Harmonização de Mamas" },
    { id: "botox", title: "Botox", campaignName: "Harmonização de Mamas" },
  ];

  assert.deepEqual(
    savedReplyCategoryIdsForCampaign("Harmonização Mamas", categories),
    ["mamas", "botox"],
  );
  assert.deepEqual(savedReplyCategoryIdsForCampaign("Botox", categories), []);
});

test("agrupa variações da mesma campanha e mostra as unidades disponíveis", () => {
  assert.deepEqual(buildSavedReplyCampaignOptions([
    { name: "Harmonização de Mamas", unit: "Osasco" },
    { name: "Harmonização Mamas", unit: "Osasco" },
    { name: "Harmonização Mamas", unit: "SBC" },
    { name: "Harmonização Mamas", unit: "SCS" },
    { name: "Botox", unit: "SCS" },
  ]), [
    { name: "Botox", units: ["SCS"] },
    { name: "Harmonização Mamas", units: ["Osasco", "SBC", "SCS"] },
  ]);
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
