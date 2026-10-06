import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(root, "src/generated/alice-knowledge.ts");
const repository = "vinisisantos/virtuosa-agent";
const revision = "4771d4f46702872a50c41b9bdc1cb1bc5e8f6612";
const maxDocumentBytes = 60_000;
const maxTotalBytes = 180_000;
const approvedDocuments = new Set([
  "AGENTS.md", "IDENTITY.md", "RULES.md", "SAFETY.md", "SALES.md", "MEMORY.md", "PENDENCIAS-RESPOSTAS-OFICIAIS.md",
  "knowledge/barriga-trincada.md", "knowledge/clinic.md", "knowledge/emagreca-2kg.md",
  "knowledge/explicacoes-procedimentos.md", "knowledge/faq.md", "knowledge/gluteos-perfeitos-120ml.md",
  "knowledge/gluteos-perfeitos.md", "knowledge/gordura-localizada.md", "knowledge/orientacoes-clinicas.md",
  "knowledge/payments.md", "knowledge/prices.md", "knowledge/reticulado-corporal.md",
  "knowledge/tecnologias-corporais.md", "workflows/follow-up.md", "workflows/human-handoff.md",
  "workflows/new-lead.md", "workflows/objections.md", "workflows/qualification.md",
  "workflows/roteiro-procedimentos.md", "workflows/scheduling.md",
]);
const requiredDocuments = ["AGENTS.md", "IDENTITY.md", "RULES.md", "SAFETY.md", "SALES.md", "MEMORY.md"];

const token = process.env.ALICE_CONTENT_READ_TOKEN?.trim();
if (!token) {
  console.log("Base privada da Alice indisponível neste build; sugestões ao vivo permanecem desativadas.");
  process.exit(0);
}

async function readFileFromPinnedRevision(path) {
  const url = `https://api.github.com/repos/${repository}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${revision}`;
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "virtuosa-alice-knowledge-sync",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Falha ao ler base privada da Alice (${response.status}).`);
  const result = await response.json();
  if (result.type !== "file" || typeof result.content !== "string" || result.encoding !== "base64") {
    throw new Error("Arquivo inesperado na base privada da Alice.");
  }
  const content = Buffer.from(result.content, "base64").toString("utf8");
  if (Buffer.byteLength(content, "utf8") > maxDocumentBytes) throw new Error("Arquivo de conhecimento excede o limite permitido.");
  return content;
}

async function main() {
  const manifest = JSON.parse(await readFileFromPinnedRevision("runtime-scope.json"));
  if (
    manifest.version !== 1
    || JSON.stringify(manifest.activeUnits) !== JSON.stringify(["SBC", "Osasco"])
    || manifest.behavior?.suggestionsRequireHumanReview !== true
    || manifest.behavior?.sendMessagesAutomatically !== false
    || manifest.behavior?.scheduleAutomatically !== false
    || manifest.behavior?.inferUnverifiedClinicalFacts !== false
    || !Array.isArray(manifest.activeDocuments)
    || !["Harmonização de Mamas", "Preenchimento Facial"].every((topic) => manifest.excludedTopics?.includes(topic))
  ) {
    throw new Error("Escopo de produção da Alice não corresponde às restrições aprovadas.");
  }
  const paths = [...new Set(manifest.activeDocuments)];
  if (paths.length < requiredDocuments.length || paths.length > approvedDocuments.size || paths.some((path) => typeof path !== "string" || !approvedDocuments.has(path))) {
    throw new Error("Manifesto contém um arquivo fora do escopo permitido.");
  }
  if (!requiredDocuments.every((path) => paths.includes(path))) throw new Error("A base está sem instruções fundamentais da Alice.");
  if (paths.includes("knowledge/harmonizacao-mamas.md") || paths.includes("knowledge/preenchimento-facial.md")) {
    throw new Error("Procedimento inativo não pode ser incluído na base da Alice.");
  }

  const documents = [];
  let totalBytes = 0;
  for (const path of paths) {
    const content = await readFileFromPinnedRevision(path);
    totalBytes += Buffer.byteLength(content, "utf8");
    if (totalBytes > maxTotalBytes) throw new Error("Base de conhecimento excede o limite permitido.");
    documents.push({ path, content });
  }

  const source = {
    available: true,
    repository,
    revision,
    activeUnits: manifest.activeUnits,
    excludedTopics: manifest.excludedTopics,
    behavior: manifest.behavior,
    documents,
  };
  const generated = `export const ALICE_KNOWLEDGE = ${JSON.stringify(source)} as const;\n`;
  await writeFile(outputPath, generated, { encoding: "utf8", mode: 0o600 });
  console.log(`Base da Alice validada e incluída no artefato do servidor (${documents.length} documentos, revisão fixada).`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Falha ao validar a base privada da Alice.");
  process.exitCode = 1;
});
