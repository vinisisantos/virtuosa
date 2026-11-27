import assert from "node:assert/strict";
import test from "node:test";
import { pinkFridaySbcOffer, pinkFridaySbcActive } from "#lib/pink-friday-sbc";
import { campaignFromPrefilledMetaLeadMessage, campaignNameFromMetaAdAndTrackSignals, campaignNameFromMetaSignals } from "#lib/campaign-track-mapping";
import { selectAliceKnowledgeDocuments } from "#lib/ai-assistant/alice-knowledge-selection";
import { applySbcPromotionValidity, sbcPromotionValidityInstructions } from "#lib/ai-assistant/promotion-validity";

const offers = [
  ["BOTOX PINK FRIDAY", "120251255419000006", "botox", "399"],
  ["GLÚTEOS PERFEITOS PINK FRIDAY", "120251255483450006", "gluteos", "3.399,00"],
  ["COMBO PINK FRIDAY", "120251255549180006", "combo", "999,90"],
  ["ENDOLASER PINK FRIDAY", "120251255510210006", "endolaser", "499"],
];
const core = ["AGENTS.md", "IDENTITY.md", "RULES.md", "SAFETY.md", "SALES.md", "MEMORY.md"];
const documents = [
  ...core.map((path) => ({ path, content: "Regra central." })),
  { path: "knowledge/manual-atendimento-sbc.md", content: "# Manual\n## Voz e acolhimento\nAtenda com continuidade.\n## Informações comerciais fornecidas pela clínica\nPreço antigo R$ 699.\n## Limites de informação clínica e produtos\nNão indique dose individual.\n" },
  { path: "knowledge/clinic.md", content: "Avaliação gratuita e endereço SBC." },
  { path: "knowledge/payments.md", content: "Pagamentos habituais." },
  { path: "knowledge/pink-friday-sbc.md", content: "Validade 29/11/2026; exclusivo da campanha identificada em SBC." },
  { path: "knowledge/prices.md", content: "# Preços\nValor antigo R$ 3900.\n## Pink Friday SBC — novembro de 2026\n"
    + offers.map(([name,,,price]) => `### ${name}\nR$ ${price}\n`).join("\n") },
  { path: "knowledge/gluteos-perfeitos.md", content: "Pump: R$ 1797." },
  ...offers.map(([name,,key]) => ({ path: `knowledge/pink-friday-sbc-${key}.md`, content: `Ficha exclusiva ${name}.` })),
];

test("IDs exatos identificam cada oferta Pink Friday somente em SBC, inclusive diante de link antigo", () => {
  for (const [name, id] of offers) {
    assert.equal(campaignNameFromMetaSignals(id, "https://instagram.com/p/DeVT_gugJTc", "SBC"), name);
    assert.equal(campaignNameFromMetaAdAndTrackSignals(id, null, null, "sbc"), name);
    assert.equal(campaignNameFromMetaAdAndTrackSignals(null, id, null, "SBC"), name);
    assert.equal(campaignNameFromMetaAdAndTrackSignals(id, id, "https://www.instagram.com/p/DgQGTJtgB9l/", "SBC"), name);
    assert.equal(campaignNameFromMetaAdAndTrackSignals(id, null, null, "Osasco"), null);
    for (const unit of ["Osasco", "SCS", undefined]) assert.equal(pinkFridaySbcOffer(unit, name, id), null);
  }
  assert.equal(campaignNameFromMetaAdAndTrackSignals(offers[1][1], offers[2][1], null, "SBC"), null);
  assert.equal(pinkFridaySbcOffer("SBC", null, "999999999999999999"), null);
  for (const name of ["Botox", "Glúteos Perfeitos", "Endolaser", "Combo Barriga Chapada", "Pink Friday"]) {
    assert.equal(pinkFridaySbcOffer("SBC", name), null);
  }
});

test("aberturas aprovadas identificam a oferta sem inventar ID Meta ou aceitar menções casuais", () => {
  const openings = [
    ["Olá! Eu vim pelo GLÚTEOS PERFEITOS PINK FRIDAY , e quero mais informações!", offers[1][0]],
    ["Quero mais informações sobre o COMBO PINK FRIDAY!", offers[2][0]],
    ["Olá! Vim pelo ENDOLASER PINK FRIDAY, posso ter mais informações sobre isso?", offers[3][0]],
  ];
  for (const [message, campaignName] of openings) {
    assert.deepEqual(campaignFromPrefilledMetaLeadMessage(message, "SBC"), { campaignName, campaignTrackId: null });
    assert.deepEqual(campaignFromPrefilledMetaLeadMessage(message.toLowerCase().replaceAll("!", " "), "sbc"), { campaignName, campaignTrackId: null });
    for (const unit of ["Osasco", "SCS", "Todas", undefined]) {
      assert.notEqual(campaignFromPrefilledMetaLeadMessage(message, unit)?.campaignName, campaignName);
    }
    for (const other of [`Não ${message}`, `Ela disse: ${message}`, `${message} Ou sobre o Botox?`]) {
      assert.notEqual(campaignFromPrefilledMetaLeadMessage(other, "SBC")?.campaignName, campaignName);
    }
  }
  for (const message of ["Quero saber sobre Glúteos Perfeitos", "Endolaser", "Combo Pink Friday", "Pink Friday"]) {
    assert.equal(campaignFromPrefilledMetaLeadMessage(message, "SBC"), null);
  }
});

test("cada oferta recebe somente seus preços e sua ficha, preservando voz e segurança", () => {
  for (const [name,,key,price] of offers) {
    const selected = selectAliceKnowledgeDocuments({ documents, unit: "SBC", campaignName: name,
      messageText: "Botox, glúteos, Endolaser, qual o preço?" });
    assert.ok(selected);
    const text = selected.map((document) => document.content).join("\n");
    assert.ok(text.includes(`R$ ${price}`));
    assert.doesNotMatch(text, /R\$ (?:3900|699|1797)/);
    for (const [otherName,,otherKey,otherPrice] of offers.filter((offer) => offer[0] !== name)) {
      assert.ok(!text.includes(`R$ ${otherPrice}\n`), otherName);
      assert.ok(!selected.some((document) => document.source.endsWith(`sbc-${otherKey}.md`)));
    }
    assert.ok(selected.some((document) => document.source.endsWith(`sbc-${key}.md`)));
    for (const path of core) assert.ok(selected.some((document) => document.source === path));
    assert.match(text, /Atenda com continuidade/);
    assert.match(text, /Não indique dose individual/);
  }
});

test("campanhas antigas e Osasco não recebem fichas nem preços Pink Friday", () => {
  for (const [unit, campaignName] of [["SBC", "Botox"], ["SBC", "Glúteos Perfeitos"], ["Osasco", offers[0][0]]]) {
    const selected = selectAliceKnowledgeDocuments({ documents, unit, campaignName, messageText: "Pink Friday Botox" });
    assert.ok(selected);
    assert.ok(!selected.some((document) => document.source.includes("pink-friday")));
    const prices = selected.find((document) => document.source === "knowledge/prices.md").content;
    assert.match(prices, /3900/);
    assert.doesNotMatch(prices, /399|499|999,90/);
  }
});

test("ficha, preços ou instruções ausentes e contexto excedido falham sem usar oferta antiga", () => {
  for (const [campaignName,,key] of offers) {
    assert.equal(selectAliceKnowledgeDocuments({ documents: documents.filter((document) => document.path !== `knowledge/pink-friday-sbc-${key}.md`),
      unit: "SBC", campaignName, messageText: "Qual o valor?" }), null);
  }
  for (const missing of ["knowledge/pink-friday-sbc-botox.md", "knowledge/pink-friday-sbc.md", "knowledge/prices.md"]) {
    assert.equal(selectAliceKnowledgeDocuments({ documents: documents.filter((document) => document.path !== missing),
      unit: "SBC", campaignName: offers[0][0], messageText: "Qual o valor?" }), null);
  }
  const oversized = documents.map((document) => document.path === "knowledge/pink-friday-sbc-botox.md"
    ? { ...document, content: "A".repeat(36_001) } : document);
  assert.equal(selectAliceKnowledgeDocuments({ documents: oversized, unit: "SBC", campaignName: offers[0][0], messageText: "Oi" }), null);
  const changedManual = documents.map((document) => document.path === "knowledge/manual-atendimento-sbc.md"
    ? { ...document, content: "# Manual com formato novo\nPreço antigo R$ 699" } : document);
  assert.equal(selectAliceKnowledgeDocuments({ documents: changedManual, unit: "SBC", campaignName: offers[0][0], messageText: "Oi" }), null);
});

test("validade específica cobre o domingo inteiro em São Paulo e não altera regra antiga", () => {
  assert.equal(pinkFridaySbcActive(new Date("2026-11-30T02:59:59Z")), true);
  assert.equal(pinkFridaySbcActive(new Date("2026-11-30T03:00:00Z")), false);
  const draft = { response: "Vou confirmar", messages: ["Vou confirmar"], needsHuman: true, confidence: "high", usedKnowledge: [] };
  const prompt = { UNIDADE: "SBC", CAMPANHA: offers[0][0], TEMPO_CONVERSA: { agora: "2026-11-26T12:00:00-03:00" },
    CONVERSA: [{ role: "cliente", text: "Até quando essa promoção?" }],
    MENSAGENS_RECENTES_SEM_RESPOSTA: [{ text: "Essa promoção vai até quando?" }] };
  assert.match(sbcPromotionValidityInstructions(prompt), /29\/11\/2026/);
  assert.match(applySbcPromotionValidity(draft, prompt).response, /29\/11\/2026/);
  const expired = { ...prompt, TEMPO_CONVERSA: { agora: "2026-11-30T12:00:00-03:00" } };
  assert.match(applySbcPromotionValidity(draft, expired).response, /terminou/);
  const old = { ...prompt, CAMPANHA: "Lipo Laser" };
  assert.match(applySbcPromotionValidity(draft, old).response, /marketing/);
  const clinical = { ...prompt, MENSAGENS_RECENTES_SEM_RESPOSTA: [{ text: "Até quando? Estou grávida, posso fazer?" }] };
  assert.equal(applySbcPromotionValidity(draft, clinical), draft);
});
