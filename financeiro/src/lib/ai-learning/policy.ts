import { createHash } from "node:crypto";

export const AI_LEARNING_CONFIG_KEY = "ai_learning_sbc_v1";
export const AI_LEARNING_UNIT = "SBC";
export const AI_LEARNING_MODEL = "deepseek-flash";
export const AI_LEARNING_DAILY_BUDGET_MICRO_USD = 500_000;
export const AI_LEARNING_MAX_DAILY_BATCHES = 24;
export const AI_LEARNING_MAX_ACTIVE_CANDIDATES = 500;

export class AiLearningError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export type AiLearningConfig = {
  enabled: boolean;
  activatedAt: string;
  unit: "SBC";
  dailyBudgetMicroUsd: number;
};

export function parseAiLearningConfig(value: string | null | undefined): AiLearningConfig {
  try {
    const raw = JSON.parse(value || "{}");
    const activatedAt = typeof raw.activatedAt === "string" ? raw.activatedAt : "";
    const requestedBudget = Number(raw.dailyBudgetMicroUsd);
    return {
      enabled: raw.enabled === true && Number.isFinite(Date.parse(activatedAt)),
      activatedAt,
      unit: AI_LEARNING_UNIT,
      dailyBudgetMicroUsd: Number.isFinite(requestedBudget)
        ? Math.min(AI_LEARNING_DAILY_BUDGET_MICRO_USD, Math.max(0, Math.floor(requestedBudget)))
        : AI_LEARNING_DAILY_BUDGET_MICRO_USD,
    };
  } catch {
    return {
      enabled: false,
      activatedAt: "",
      unit: AI_LEARNING_UNIT,
      dailyBudgetMicroUsd: AI_LEARNING_DAILY_BUDGET_MICRO_USD,
    };
  }
}

export function aiLearningDigest(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function aiLearningDayKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function plainLearningText(text: string) {
  return text.normalize("NFKC").trim().replace(/\s+/g, " ");
}

const SENSITIVE_HEALTH_PATTERN = /\b(?:alerg(?:ia|ico|ica)|medica(?:cao|mento)|remedio|doenca|diabet(?:es|ica|ico)|cancer|gestante|gravida|amament|cirurg|diagnostic|sintoma|infecc|sangramento|pressao|exame|dose|mg\b|dor\b)/i;

export function sanitizeLearningText(text: string, names: string[] = []) {
  let sanitized = plainLearningText(text)
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[email]")
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[documento]")
    .replace(/(?:\+?\d[\d ().-]{8,}\d)/g, "[telefone]")
    .replace(/https?:\/\/\S+/g, "[link]")
    .replace(/\b(?:[0-2]?\d|3[01])[/-](?:0?\d|1[0-2])(?:[/-]\d{2,4})?\b/g, "[data]")
    .replace(/\b(?:[01]?\d|2[0-3])[:h][0-5]\d\b/gi, "[horário]")
    .replace(/R\$\s*\d[\d.,]*/gi, "[valor]");

  for (const name of names.filter((candidate) => candidate.trim().length > 2)) {
    const escaped = name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    sanitized = sanitized.replace(new RegExp(`\\b${escaped}\\b`, "gi"), "[pessoa]");
  }

  if (SENSITIVE_HEALTH_PATTERN.test(sanitized)) return "[conteúdo clínico individual omitido]";
  return sanitized.slice(0, 1_200);
}

export type AiLearningCandidateContent = {
  topic: string;
  questions: string[];
  answer: string;
  procedure: string;
  conditions: string;
  clinical: boolean;
};

export function validateAiLearningCandidate(value: unknown): AiLearningCandidateContent {
  const candidate = value as AiLearningCandidateContent;
  if (!candidate || typeof candidate !== "object" || typeof candidate.clinical !== "boolean") {
    throw new AiLearningError("Aprendizado inválido");
  }
  const limits = { topic: 140, answer: 1_200, procedure: 160, conditions: 400 } as const;
  for (const field of Object.keys(limits) as (keyof typeof limits)[]) {
    if (typeof candidate[field] !== "string" || candidate[field].length > limits[field]) {
      throw new AiLearningError(`Campo ${field} inválido`);
    }
  }
  if (
    !candidate.topic.trim()
    || !candidate.answer.trim()
    || !Array.isArray(candidate.questions)
    || candidate.questions.length < 1
    || candidate.questions.length > 3
    || candidate.questions.some((question) => typeof question !== "string" || !question.trim() || question.length > 160)
  ) {
    throw new AiLearningError("Aprendizado incompleto");
  }
  if (candidate.clinical && !candidate.procedure.trim()) {
    throw new AiLearningError("Conteúdo clínico precisa identificar o procedimento");
  }
  return {
    topic: candidate.topic.trim(),
    questions: candidate.questions.map((question) => question.trim()),
    answer: candidate.answer.trim(),
    procedure: candidate.procedure.trim(),
    conditions: candidate.conditions.trim(),
    clinical: candidate.clinical,
  };
}

export function aiLearningReservation(inputTokens: number, outputTokens: number) {
  // Preço de pico do DeepSeek V4.1 Flash: US$ 0,30/M input e US$ 1,20/M output.
  return Math.ceil(inputTokens * 0.3 + outputTokens * 1.2);
}

export function aiLearningBudgetAllows(
  budget: { reserved: number; batches: number },
  amount: number,
  dailyLimit = AI_LEARNING_DAILY_BUDGET_MICRO_USD,
) {
  return budget.reserved + amount <= dailyLimit && budget.batches < AI_LEARNING_MAX_DAILY_BATCHES;
}
