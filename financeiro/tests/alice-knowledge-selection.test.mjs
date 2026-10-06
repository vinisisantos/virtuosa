import assert from "node:assert/strict";
import test from "node:test";
import { selectAliceKnowledgeDocuments } from "#lib/ai-assistant/alice-knowledge-selection";

const core = ["AGENTS.md", "IDENTITY.md", "RULES.md", "SAFETY.md", "SALES.md", "MEMORY.md"]
  .map((path) => ({ path, content: "Regra da Alice. ".repeat(200) }));
const documents = [
  ...core,
  { path: "PENDENCIAS-RESPOSTAS-OFICIAIS.md", content: "Barriga trincada. ".repeat(2_000) },
  { path: "knowledge/clinic.md", content: "Endereço e unidades." },
  { path: "knowledge/prices.md", content: "Valores oficiais das campanhas." },
  { path: "knowledge/payments.md", content: "Condições de pagamento." },
  { path: "knowledge/gluteos-perfeitos.md", content: "Glúteos Perfeitos." },
  { path: "knowledge/gluteos-perfeitos-120ml.md", content: "Glúteos Perfeitos 120 ml." },
  { path: "knowledge/barriga-trincada.md", content: "Barriga Trincada." },
  { path: "knowledge/emagreca-2kg.md", content: "Emagreça até 2 kg." },
  { path: "knowledge/gordura-localizada.md", content: "Gordura Localizada." },
  { path: "knowledge/reticulado-corporal.md", content: "Ácido hialurônico reticulado." },
];

function sources(campaignName, messageText) {
  return selectAliceKnowledgeDocuments({ documents, campaignName, messageText })?.map((document) => document.source);
}

test("seleção mantém ficha da campanha, preços e regras centrais antes de pendências genéricas", () => {
  for (const [campaign, path] of [
    ["Barriga Trincada", "knowledge/barriga-trincada.md"],
    ["Emagreça até 2 kg", "knowledge/emagreca-2kg.md"],
    ["Gordura Localizada", "knowledge/gordura-localizada.md"],
    ["Glúteos Perfeitos 120ml", "knowledge/gluteos-perfeitos-120ml.md"],
  ]) {
    const selected = sources(campaign, "Como funciona e qual o preço?");
    assert.ok(selected?.includes(path), campaign);
    assert.ok(selected?.includes("knowledge/prices.md"), campaign);
    assert.ok(selected?.indexOf(path) < selected?.indexOf("PENDENCIAS-RESPOSTAS-OFICIAIS.md"), campaign);
    if (campaign === "Barriga Trincada") assert.ok(!selected?.includes("knowledge/gluteos-perfeitos.md"));
    for (const required of core) assert.ok(selected?.includes(required.path));
  }
});

test("pedido explícito sobre reticulado leva a ficha correspondente", () => {
  assert.ok(sources("Glúteos Perfeitos 120ml", "Vocês usam ácido hialurônico reticulado?")
    ?.includes("knowledge/reticulado-corporal.md"));
});

test("variante 120 ml mencionada após campanha genérica inclui sua ficha", () => {
  assert.ok(sources("Glúteos Perfeitos", "Quero saber sobre 120ml")
    ?.includes("knowledge/gluteos-perfeitos-120ml.md"));
});

test("base incompleta falha fechada", () => {
  assert.equal(selectAliceKnowledgeDocuments({ documents: documents.slice(1), campaignName: "", messageText: "Olá" }), null);
  assert.equal(selectAliceKnowledgeDocuments({ documents: documents.filter((document) => document.path !== "MEMORY.md"), campaignName: "", messageText: "Olá" }), null);
  const oversizedCore = documents.map((document) => document.path === "AGENTS.md"
    ? { ...document, content: "A".repeat(36_001) }
    : document);
  assert.equal(selectAliceKnowledgeDocuments({ documents: oversizedCore, campaignName: "", messageText: "Olá" }), null);
});
