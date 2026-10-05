type AliceDocument = { path: string; content: string };

const CORE_DOCUMENTS = ["AGENTS.md", "IDENTITY.md", "RULES.md", "SAFETY.md", "SALES.md"];
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
}) {
  const byPath = new Map(params.documents.map((document) => [document.path, document]));
  if (!CORE_DOCUMENTS.every((path) => byPath.has(path))) return null;

  const campaignPaths = procedurePaths(params.campaignName);
  const messagePaths = procedurePaths(`${params.campaignName} ${params.messageText}`);
  const essentialPaths = new Set([...CORE_DOCUMENTS, ...campaignPaths, "knowledge/prices.md"]);
  const text = normalized(`${params.campaignName} ${params.messageText}`);
  const contextualPaths = [
    ...campaignPaths,
    ...messagePaths,
    ...(/reticulad|acido hialuronico/.test(text) ? ["knowledge/reticulado-corporal.md"] : []),
    ...(/agend|avaliacao|horario/.test(text) ? ["workflows/scheduling.md"] : []),
  ];
  const contextualSet = new Set(contextualPaths);
  const requestedTerms = terms(`${params.campaignName} ${params.messageText}`);
  const secondary = params.documents
    .filter((document) => document.path !== "PENDENCIAS-RESPOSTAS-OFICIAIS.md"
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
  if (campaignPaths.some((path) => byPath.has(path) && !selected.some((document) => document.source === path))) return null;
  return selected;
}
