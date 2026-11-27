type AliceDocument = { path: string; content: string };
import { pinkFridaySbcOffer, PINK_FRIDAY_SBC_RULES, PINK_FRIDAY_SBC_PRICES_HEADING, type PinkFridaySbcOffer } from "../pink-friday-sbc.ts";

const CORE_DOCUMENTS = ["AGENTS.md", "IDENTITY.md", "RULES.md", "SAFETY.md", "SALES.md", "MEMORY.md"];
const SBC_MANUAL = "knowledge/manual-atendimento-sbc.md";
const GENERAL_DOCUMENTS = [
  "knowledge/clinic.md",
  "knowledge/prices.md",
  "knowledge/payments.md",
  "workflows/new-lead.md",
  "workflows/roteiro-procedimentos.md",
];
const MAX_DOCUMENTS = 14;
const MAX_CHARS = 36_000;
const PROCEDURE_DOCUMENTS = new Set([
  "knowledge/gluteos-perfeitos.md",
  "knowledge/gluteos-perfeitos-120ml.md",
  "knowledge/barriga-trincada.md",
  "knowledge/gordura-localizada.md",
  "knowledge/emagreca-2kg.md",
  "knowledge/reticulado-corporal.md",
]);

function regularPrices(content: string) {
  return content.split(PINK_FRIDAY_SBC_PRICES_HEADING)[0].trim();
}

function promotionPrices(content: string, offer: PinkFridaySbcOffer) {
  const section = content.split(PINK_FRIDAY_SBC_PRICES_HEADING)[1];
  const entry = section?.split(/^### /m).find((part) => part.startsWith(`${offer.name}\n`));
  return entry ? `# Valores exclusivos de ${offer.name} — SBC\n\n${entry.trim()}` : null;
}

function selectPromotionDocuments(byPath: Map<string, AliceDocument>, offer: PinkFridaySbcOffer) {
  const prices = promotionPrices(byPath.get("knowledge/prices.md")?.content || "", offer);
  const manual = byPath.get(SBC_MANUAL);
  if (!prices || !manual) return null;
  // O manual compartilhado contém preços antigos: a promoção recebe só a seção
  // comercial própria; as demais orientações e políticas de SBC são preservadas.
  const promotionManual = manual.content.replace(/## Informações comerciais fornecidas pela clínica\n[\s\S]*?(?=\n## |$)/u,
    "## Informações comerciais desta conversa\nUse somente a oferta Pink Friday identificada e a seção de preços selecionada. Não importe condições de outras campanhas.\n");
  const paths = [...CORE_DOCUMENTS, SBC_MANUAL, "knowledge/clinic.md", "knowledge/prices.md", "knowledge/payments.md",
    PINK_FRIDAY_SBC_RULES, offer.document, "workflows/scheduling.md"];
  const required = new Set([...CORE_DOCUMENTS, SBC_MANUAL, "knowledge/clinic.md", "knowledge/prices.md", "knowledge/payments.md",
    PINK_FRIDAY_SBC_RULES, offer.document]);
  const selected = paths.flatMap((path) => {
    const document = byPath.get(path);
    if (!document) return [];
    return [{ source: path, content: path === "knowledge/prices.md" ? prices : path === SBC_MANUAL ? promotionManual : document.content }];
  });
  if ([...required].some((path) => !selected.some((document) => document.source === path))
    || selected.some((document) => document.source !== "knowledge/prices.md" && /R\s*\$\s*\d/u.test(document.content))
    || selected.length > MAX_DOCUMENTS || selected.reduce((sum, document) => sum + document.content.length, 0) > MAX_CHARS) return null;
  return selected;
}

function normalized(value: string) {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

function terms(value: string) {
  return new Set(normalized(value).split(/[^a-z0-9]+/).filter((word) => word.length >= 4));
}

function procedurePaths(value: string) {
  const text = normalized(value);
  const paths: string[] = [];
  if (text.includes("glute")) {
    if (/120\s*ml/.test(text)) paths.push("knowledge/gluteos-perfeitos-120ml.md");
    paths.push("knowledge/gluteos-perfeitos.md");
  }
  if (text.includes("barriga trincada")) paths.push("knowledge/barriga-trincada.md");
  if (text.includes("gordura localizada")) paths.push("knowledge/gordura-localizada.md");
  if (text.includes("emagreca") || /\b2\s*kg\b/.test(text)) paths.push("knowledge/emagreca-2kg.md");
  return paths;
}

export function selectAliceKnowledgeDocuments(params: {
  documents: readonly AliceDocument[];
  campaignName: string;
  messageText: string;
  unit?: string;
}) {
  const byPath = new Map(params.documents.map((document) => [document.path, document]));
  if (!CORE_DOCUMENTS.every((path) => byPath.has(path))) return null;
  const promotion = pinkFridaySbcOffer(params.unit, params.campaignName);
  if (promotion) return selectPromotionDocuments(byPath, promotion);
  for (const path of byPath.keys()) {
    if (path.startsWith("knowledge/pink-friday-sbc")) byPath.delete(path);
  }
  const prices = byPath.get("knowledge/prices.md");
  if (prices) byPath.set(prices.path, { ...prices, content: regularPrices(prices.content) });
  const unitDocuments = params.unit === "SBC" ? [SBC_MANUAL] : [];
  if (!unitDocuments.every((path) => byPath.has(path))) return null;

  const campaignPaths = procedurePaths(params.campaignName);
  const messagePaths = procedurePaths(`${params.campaignName} ${params.messageText}`);
  const unitContext = params.unit === "SBC" ? ["knowledge/clinic.md"] : [];
  const essentialPaths = new Set([...CORE_DOCUMENTS, ...unitDocuments, ...unitContext, ...campaignPaths, "knowledge/prices.md"]);
  const text = normalized(`${params.campaignName} ${params.messageText}`);
  const contextualPaths = [
    ...campaignPaths,
    ...messagePaths,
    ...(/reticulad|acido hialuronico/.test(text) ? ["knowledge/reticulado-corporal.md"] : []),
    ...(/agend|avaliacao|horario/.test(text) ? ["workflows/scheduling.md"] : []),
  ];
  const contextualSet = new Set(contextualPaths);
  const requestedTerms = terms(`${params.campaignName} ${params.messageText}`);
  const secondary = [...byPath.values()]
    .filter((document) => document.path !== "PENDENCIAS-RESPOSTAS-OFICIAIS.md"
      && (document.path !== SBC_MANUAL || params.unit === "SBC")
      && (!PROCEDURE_DOCUMENTS.has(document.path) || contextualSet.has(document.path)))
    .map((document) => ({
      path: document.path,
      score: [...terms(`${document.path} ${document.content}`)].filter((word) => requestedTerms.has(word)).length,
    }))
    .filter((document) => document.score > 0)
    .sort((left, right) => right.score - left.score || left.path.localeCompare(right.path))
    .map((document) => document.path);

  const orderedPaths = [...new Set([
    ...CORE_DOCUMENTS,
    ...unitDocuments,
    ...campaignPaths,
    "knowledge/prices.md",
    ...unitContext,
    ...contextualPaths,
    ...GENERAL_DOCUMENTS,
    ...secondary,
    "PENDENCIAS-RESPOSTAS-OFICIAIS.md",
  ])];
  const selected: { source: string; content: string }[] = [];
  let remaining = MAX_CHARS;
  for (const path of orderedPaths) {
    if (selected.length >= MAX_DOCUMENTS || remaining <= 0) break;
    const document = byPath.get(path);
    if (!document) continue;
    if (essentialPaths.has(path) && document.content.length > remaining) return null;
    const content = document.content.slice(0, remaining);
    if (!content) continue;
    selected.push({ source: path, content });
    remaining -= content.length;
  }
  if (!CORE_DOCUMENTS.every((path) => selected.some((document) => document.source === path))) return null;
  if (!unitDocuments.every((path) => selected.some((document) => document.source === path))) return null;
  if (!unitContext.every((path) => selected.some((document) => document.source === path))) return null;
  if (!selected.some((document) => document.source === "knowledge/prices.md")) return null;
  if (campaignPaths.some((path) => byPath.has(path) && !selected.some((document) => document.source === path))) return null;
  return selected;
}
