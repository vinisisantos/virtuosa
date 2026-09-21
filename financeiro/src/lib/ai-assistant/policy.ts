import { createHash } from "node:crypto";
import { getEvaluationScheduleUnitConfigByUnit } from "@/lib/whatsapp/evaluation-schedule-confirmation-message";

export const AI_ASSISTANT_CONFIG_KEY = "ai_assistant_sbc_v1";
export const AI_ASSISTANT_UNIT = "SBC";
export const AI_ASSISTANT_MODEL = "deepseek-flash";
export const AI_ASSISTANT_DAILY_BUDGET_MICRO_USD = 1_000_000;
export const AI_ASSISTANT_MAX_DAILY_REQUESTS = 300;
export const AI_ASSISTANT_RESERVED_MICRO_USD = 2_500;

export type AiAssistantMode = "manual" | "suggestions";
export type AiAssistantConfig = {
  enabled: boolean;
  activatedAt: string;
  unit: "SBC";
  businessDescription: string;
  businessHours: string;
  email: string;
  website: string;
  purchasePolicy: string;
  paymentPolicy: string;
  discountPolicy: string;
  customInstructions: string;
  allowEmojis: boolean;
  sharePrices: boolean;
  askClientInfoAt: "ready_to_schedule" | "conversation_start" | "when_needed";
  dailyBudgetMicroUsd: number;
  agentEnabled: false;
};

export class AiAssistantError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const DEFAULT_CONFIG: AiAssistantConfig = {
  enabled: false,
  activatedAt: "",
  unit: AI_ASSISTANT_UNIT,
  businessDescription: "Clínica Virtuosa São Bernardo, especializada em estética facial e corporal.",
  businessHours: "",
  email: "",
  website: "",
  purchasePolicy: "O atendimento começa por uma avaliação para entender o objetivo do cliente e indicar o cuidado adequado.",
  paymentPolicy: "",
  discountPolicy: "",
  customInstructions: "Conduza uma etapa por vez, sem repetir informações já confirmadas. Quando não compreender a mensagem, peça ao cliente para explicar novamente.",
  allowEmojis: true,
  sharePrices: true,
  askClientInfoAt: "ready_to_schedule",
  dailyBudgetMicroUsd: AI_ASSISTANT_DAILY_BUDGET_MICRO_USD,
  agentEnabled: false,
};

function limitedString(value: unknown, fallback: string, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : fallback;
}

export function parseAiAssistantConfig(value: string | null | undefined): AiAssistantConfig {
  let raw: Record<string, unknown> = {};
  try {
    raw = JSON.parse(value || "{}");
  } catch {}
  const requestedBudget = Number(raw.dailyBudgetMicroUsd);
  const askClientInfoAt = new Set(["ready_to_schedule", "conversation_start", "when_needed"]).has(String(raw.askClientInfoAt))
    ? raw.askClientInfoAt as AiAssistantConfig["askClientInfoAt"]
    : DEFAULT_CONFIG.askClientInfoAt;

  return {
    enabled: raw.enabled === true,
    activatedAt: typeof raw.activatedAt === "string" ? raw.activatedAt : "",
    unit: AI_ASSISTANT_UNIT,
    businessDescription: limitedString(raw.businessDescription, DEFAULT_CONFIG.businessDescription, 1_200),
    businessHours: limitedString(raw.businessHours, "", 600),
    email: limitedString(raw.email, "", 240),
    website: limitedString(raw.website, "", 500),
    purchasePolicy: limitedString(raw.purchasePolicy, DEFAULT_CONFIG.purchasePolicy, 1_500),
    paymentPolicy: limitedString(raw.paymentPolicy, "", 1_500),
    discountPolicy: limitedString(raw.discountPolicy, "", 1_500),
    customInstructions: limitedString(raw.customInstructions, DEFAULT_CONFIG.customInstructions, 2_000),
    allowEmojis: raw.allowEmojis !== false,
    sharePrices: raw.sharePrices === true,
    askClientInfoAt,
    dailyBudgetMicroUsd: Number.isFinite(requestedBudget)
      ? Math.min(AI_ASSISTANT_DAILY_BUDGET_MICRO_USD, Math.max(100_000, Math.floor(requestedBudget)))
      : AI_ASSISTANT_DAILY_BUDGET_MICRO_USD,
    agentEnabled: false,
  };
}

export function validateAiAssistantConfigInput(value: unknown, current: AiAssistantConfig) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AiAssistantError("Configuração inválida");
  }
  const input = value as Record<string, unknown>;
  return parseAiAssistantConfig(JSON.stringify({
    ...current,
    businessDescription: input.businessDescription,
    businessHours: input.businessHours,
    email: input.email,
    website: input.website,
    purchasePolicy: input.purchasePolicy,
    paymentPolicy: input.paymentPolicy,
    discountPolicy: input.discountPolicy,
    customInstructions: input.customInstructions,
    allowEmojis: input.allowEmojis,
    sharePrices: input.sharePrices,
    askClientInfoAt: input.askClientInfoAt,
    enabled: true,
    agentEnabled: false,
    activatedAt: current.activatedAt || new Date().toISOString(),
  }));
}

export function aiAssistantPublicConfig(config: AiAssistantConfig) {
  const unit = getEvaluationScheduleUnitConfigByUnit(AI_ASSISTANT_UNIT);
  return {
    ...config,
    address: unit?.address || "",
    locationUrl: unit?.locationUrl || "",
    clinicName: unit?.clinicName || "Clínica Virtuosa São Bernardo",
    model: AI_ASSISTANT_MODEL,
  };
}

export function normalizeAiAssistantMode(value: unknown): AiAssistantMode {
  if (value === "manual" || value === "suggestions") return value;
  throw new AiAssistantError("Modo de atendimento inválido");
}

export function aiAssistantDigest(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function aiAssistantDayKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function aiAssistantActualCost(inputTokens: number, outputTokens: number) {
  return Math.ceil(inputTokens * 0.3 + outputTokens * 1.2);
}
