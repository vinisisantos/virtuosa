import { z } from "zod";
import { CLAUDE_MODEL } from "@/lib/ai-assistant/claude-provider";
import { aliceAutonomyCostMicroUsd, aliceAutonomyResponseClaimsBooking, aliceHumanReviewReason, type AliceHumanReviewReason } from "@/lib/ai-assistant/autonomy/policy";
import { aliceStructuredDraftSchema, aliceStructuredOutputSchema, type AliceStructuredOutput } from "@/lib/alice/schema";
import { splitAliceMessageParts } from "@/lib/alice/message-parts";
import { buildAliceStructuredRequest, AliceStructuredRequestError, type AliceStructuredContext,
  type AliceStructuredRequestErrorCode } from "@/lib/alice/structured-request";

const GENERATION_BUDGET_MS = 48_000;
const MIN_REPAIR_BUDGET_MS = 2_000;
const tokenCount = z.number().int().nonnegative().safe();
const providerUsageSchema = z.object({
  input_tokens: tokenCount, output_tokens: tokenCount,
  cache_read_input_tokens: tokenCount.optional().default(0), cache_creation_input_tokens: tokenCount.optional().default(0),
});
const textBlocksSchema = z.array(z.object({ type: z.literal("text"), text: z.string() })).min(1);

export type AliceStructuredMetrics = {
  model: typeof CLAUDE_MODEL; attempts: number; inputTokens: number; outputTokens: number;
  cacheReadInputTokens: number; cacheCreationInputTokens: number;
  usageRecorded: boolean; costMicroUsd: number | null; knownCostMicroUsd: number; generationMs: number;
};

export type AliceStructuredFailure = AliceStructuredRequestErrorCode | "not_configured" | "cancelled" | "deadline"
  | "provider_unavailable" | "provider_response_invalid" | "usage_unavailable" | "unexpected_model"
  | "provider_refusal" | "provider_incomplete" | "invalid_output" | "human_review" | "word_limit" | "unproven_booking" | AliceHumanReviewReason;

export type AliceStructuredGeneration =
  | { status: "draft"; proposal: AliceStructuredOutput; metrics: AliceStructuredMetrics }
  | { status: "handoff"; reason: AliceStructuredFailure; proposal: null; metrics: AliceStructuredMetrics };

export type AliceStructuredDependencies = {
  fetcher?: typeof fetch;
  apiKey?: string;
  now?: () => number;
  signal?: AbortSignal;
};

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

// Apenas gera uma proposta; a validação final, persistência e envio pertencem ao worker.
export async function generateAliceStructuredReply(context: AliceStructuredContext,
  dependencies: AliceStructuredDependencies = {}): Promise<AliceStructuredGeneration> {
  const now = dependencies.now ?? (() => performance.now());
  const startedAt = now();
  const elapsed = () => Math.max(0, now() - startedAt);
  const metrics: AliceStructuredMetrics = { model: CLAUDE_MODEL, attempts: 0, inputTokens: 0, outputTokens: 0,
    cacheReadInputTokens: 0, cacheCreationInputTokens: 0, usageRecorded: true, costMicroUsd: 0, knownCostMicroUsd: 0, generationMs: 0 };
  const snapshot = (): AliceStructuredMetrics => ({ ...metrics, generationMs: elapsed(),
    costMicroUsd: metrics.usageRecorded ? metrics.knownCostMicroUsd : null });
  const handoff = (reason: AliceStructuredFailure): AliceStructuredGeneration => ({ status: "handoff", reason, proposal: null, metrics: snapshot() });

  let payloads: string[];
  try {
    payloads = [false, true].map((repair) => JSON.stringify(buildAliceStructuredRequest(context, repair)));
  } catch (error) {
    if (error instanceof AliceStructuredRequestError) return handoff(error.code);
    throw error;
  }
  const key = (dependencies.apiKey ?? process.env.ANTHROPIC_API_KEY)?.trim();
  if (!key) return handoff("not_configured");
  if (dependencies.signal?.aborted) return handoff("cancelled");
  const remaining = GENERATION_BUDGET_MS - elapsed();
  if (remaining <= 0) return handoff("deadline");
  // Uma única janela para ambas as tentativas; o worker também impõe seu orçamento ponta a ponta.
  const timeout = AbortSignal.timeout(Math.ceil(remaining));
  const signal = dependencies.signal ? AbortSignal.any([timeout, dependencies.signal]) : timeout;
  const fetcher = dependencies.fetcher ?? fetch;

  for (const payload of payloads) {
    if (dependencies.signal?.aborted) return handoff("cancelled");
    if (signal.aborted || elapsed() >= GENERATION_BUDGET_MS) return handoff("deadline");
    metrics.attempts++;
    let result: Record<string, unknown> | null;
    try {
      const response = await fetcher("https://api.anthropic.com/v1/messages", {
        method: "POST", headers: { "content-type": "application/json", "anthropic-version": "2023-06-01", "x-api-key": key },
        body: payload, cache: "no-store", signal,
      });
      if (!response.ok) {
        metrics.usageRecorded = false;
        return handoff("provider_unavailable");
      }
      result = object(await response.json());
    } catch {
      metrics.usageRecorded = false;
      return handoff(dependencies.signal?.aborted ? "cancelled" : signal.aborted || elapsed() >= GENERATION_BUDGET_MS ? "deadline" : "provider_unavailable");
    }

    const usage = providerUsageSchema.safeParse(result?.usage);
    if (usage.success && result?.model === CLAUDE_MODEL) {
      const data = usage.data;
      metrics.inputTokens += data.input_tokens;
      metrics.outputTokens += data.output_tokens;
      metrics.cacheReadInputTokens += data.cache_read_input_tokens;
      metrics.cacheCreationInputTokens += data.cache_creation_input_tokens;
      metrics.knownCostMicroUsd += aliceAutonomyCostMicroUsd({ input: data.input_tokens, output: data.output_tokens,
        cacheRead: data.cache_read_input_tokens, cacheCreation: data.cache_creation_input_tokens });
    } else {
      metrics.usageRecorded = false;
    }
    if (dependencies.signal?.aborted) return handoff("cancelled");
    if (signal.aborted || elapsed() >= GENERATION_BUDGET_MS) return handoff("deadline");
    if (!result) return handoff("provider_response_invalid");
    if (result.model !== CLAUDE_MODEL) return handoff("unexpected_model");
    if (!usage.success) return handoff("usage_unavailable");
    if (result.stop_reason === "refusal") return handoff("provider_refusal");
    if (result.stop_reason !== "end_turn") return handoff("provider_incomplete");
    const blocks = textBlocksSchema.safeParse(result.content);
    if (!blocks.success) return handoff("provider_response_invalid");

    let decoded: unknown;
    try { decoded = JSON.parse(blocks.data.map((block) => block.text).join("")); } catch { decoded = undefined; }
    const parsed = aliceStructuredDraftSchema.safeParse(decoded);
    if (parsed.success) {
      const reviewReason = aliceHumanReviewReason(parsed.data);
      if (reviewReason) return handoff(reviewReason);
      if (aliceAutonomyResponseClaimsBooking(parsed.data.resposta)) return handoff("unproven_booking");
      try {
        const proposal = aliceStructuredOutputSchema.parse({ ...parsed.data, resposta: splitAliceMessageParts(parsed.data.resposta) });
        return { status: "draft", proposal, metrics: snapshot() };
      } catch {
        if (metrics.attempts === 2) return handoff("invalid_output");
        if (GENERATION_BUDGET_MS - elapsed() < MIN_REPAIR_BUDGET_MS) return handoff("deadline");
        continue;
      }
    }
    // Não ecoar saída inválida em instruções. Só formato concluído pode gastar uma correção adicional.
    if (metrics.attempts === 2) return handoff("invalid_output");
    if (GENERATION_BUDGET_MS - elapsed() < MIN_REPAIR_BUDGET_MS) return handoff("deadline");
  }
  return handoff("invalid_output");
}
