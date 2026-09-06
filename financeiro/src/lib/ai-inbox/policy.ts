import { createHash } from "node:crypto";

// Prices are pinned to this model; changing it requires a new budget calculation.
export const MODEL = "gpt-5.6-terra";
export const EMBEDDING_MODEL = "text-embedding-3-small";
export const DIMENSIONS = 512;
export const CONFIG_KEY = "ai_inbox_scs_v1";
export const DAILY_MICRO_USD = 5_000_000;
export const MAX_SUGGESTIONS = 100;
export const MAX_BATCHES = 40;
export const MAX_KNOWLEDGE = 500;

export class InboxAiError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export type PilotConfig = {
  enabled: boolean;
  activatedAt: string;
  instanceIds: string[];
  reviewerIds: string[];
  clinicalReviewerIds: string[];
};

export function parseConfig(value: string | null | undefined): PilotConfig {
  try {
    const c = JSON.parse(value || "{}");
    const ids = (v: unknown) =>
      Array.isArray(v)
        ? v.filter((s): s is string => typeof s === "string" && s.length > 0)
        : [];
    return {
      enabled: c.enabled === true && Number.isFinite(Date.parse(c.activatedAt)),
      activatedAt: typeof c.activatedAt === "string" ? c.activatedAt : "",
      instanceIds: ids(c.instanceIds),
      reviewerIds: ids(c.reviewerIds),
      clinicalReviewerIds: ids(c.clinicalReviewerIds),
    };
  } catch {
    return {
      enabled: false,
      activatedAt: "",
      instanceIds: [],
      reviewerIds: [],
      clinicalReviewerIds: [],
    };
  }
}

export function digest(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function dayKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function plainReply(text: string) {
  return text
    .replace(/^\*[^\n*]{1,100}:\*\s*/, "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ");
}

export function redact(text: string, names: string[] = []) {
  let result = text
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[email]")
    .replace(/(?:\+?\d[\d ().-]{8,}\d)/g, "[identificador]")
    .replace(/https?:\/\/\S+/g, "[link]");
  for (const name of names.filter((n) => n.trim().length > 2)) {
    result = result.replace(
      new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"),
      "[pessoa]",
    );
  }
  return result;
}

export type KnowledgeContent = {
  topic: string;
  questions: string[];
  answer: string;
  procedure: string;
  conditions: string;
  clinical: boolean;
};

export function validateKnowledge(value: unknown): KnowledgeContent {
  const k = value as KnowledgeContent;
  if (!k || typeof k !== "object" || typeof k.clinical !== "boolean")
    throw new InboxAiError("Ficha inválida");
  for (const [field, limit] of [
    ["topic", 140],
    ["answer", 2400],
    ["procedure", 160],
    ["conditions", 800],
  ] as const) {
    if (typeof k[field] !== "string" || k[field].length > limit)
      throw new InboxAiError(`Campo ${field} inválido`);
  }
  if (
    !k.topic.trim() ||
    !k.answer.trim() ||
    !Array.isArray(k.questions) ||
    !k.questions.length ||
    k.questions.length > 5 ||
    k.questions.some(
      (q) => typeof q !== "string" || !q.trim() || q.length > 300,
    )
  )
    throw new InboxAiError("Preencha assunto, perguntas e resposta");
  if (k.clinical && !k.procedure.trim())
    throw new InboxAiError(
      "Conteúdo clínico precisa identificar o procedimento/protocolo",
    );
  return {
    topic: k.topic.trim(),
    questions: k.questions.map((q) => q.trim()),
    answer: k.answer.trim(),
    procedure: k.procedure.trim(),
    conditions: k.conditions.trim(),
    clinical: k.clinical,
  };
}

export function knowledgeText(k: KnowledgeContent) {
  return [k.topic, ...k.questions, k.procedure, k.conditions, k.answer].join(
    "\n",
  );
}

export function vectorLiteral(vector: number[]) {
  if (
    vector.length !== DIMENSIONS ||
    vector.some((v) => !Number.isFinite(v)) ||
    !vector.some((v) => v !== 0)
  )
    throw new InboxAiError("Embedding inválido", 502);
  return `[${vector.join(",")}]`;
}

// UTF-8 bytes overestimate BPE text tokens. Include schema/instructions and a
// separate envelope allowance; no truncation of a JSON document after encoding.
export function checkInputSize(input: unknown, limit: number) {
  if (Buffer.byteLength(JSON.stringify(input), "utf8") + 1024 > limit)
    throw new InboxAiError(
      "Contexto grande demais; reduza o conteúdo antes de tentar novamente",
    );
}

export function generationReserve(
  inputLimit: number,
  outputLimit: number,
  embeddingTokens: number,
) {
  return inputLimit * 2 + outputLimit * 12 + Math.ceil(embeddingTokens * 0.02);
}

export function budgetAllows(
  b: { reserved: number; suggestions: number; batches: number },
  amount: number,
  kind: string,
) {
  return (
    b.reserved + amount <= DAILY_MICRO_USD &&
    (kind !== "suggestion" || b.suggestions < MAX_SUGGESTIONS) &&
    (kind !== "observation" || b.batches < MAX_BATCHES)
  );
}
