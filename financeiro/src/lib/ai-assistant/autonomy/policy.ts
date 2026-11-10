import { LEADS_SBC_INSTANCE_ID } from "@/lib/whatsapp/evaluation-schedule-confirmation-message";

export const ALICE_AUTONOMY_CONFIG_KEY = "alice_autonomous_sbc_v1";
export const ALICE_AUTONOMY_UNIT = "SBC";
export const ALICE_AUTONOMY_INSTANCE_ID = LEADS_SBC_INSTANCE_ID;
export const ALICE_AUTONOMY_MODEL = "claude-sonnet-4-6";
export const ALICE_AUTONOMY_DELAY_MS = 30_000;
export const ALICE_AUTONOMY_COMPLEMENT_MS = 3_000;
export const ALICE_AUTONOMY_LEASE_MS = 120_000;
export const ALICE_AUTONOMY_ACTIVE_STATES = ["queued", "processing", "sending"];

const SOFT_HANDOFF_ERRORS = new Set([
  "human_review", "generation_requires_review", "word_limit", "invalid_message_sequence",
  "structured_proposal_missing", "provider_unavailable", "provider_response_invalid", "provider_incomplete",
  "provider_refusal", "invalid_output", "usage_unavailable", "unexpected_model", "deadline",
  "worker_budget_exhausted", "worker_failed_before_send",
]);

export function aliceAutonomyRequiresHumanOwnership(status: "skipped" | "needs_human" | "uncertain" | "failed", error: string) {
  if (status === "skipped") return false;
  if (status === "uncertain") return true;
  return !aliceCanContinueAfterSoftHandoff(error);
}

export function aliceCanContinueAfterSoftHandoff(error: string) {
  return SOFT_HANDOFF_ERRORS.has(error);
}

export function aliceRetryableTurnError(error: string | null | undefined) {
  return Boolean(error && (SOFT_HANDOFF_ERRORS.has(error) || error === "schedule_option_expired_or_invalid"));
}

export function aliceRetryAttemptLimit(error: string | null | undefined) {
  // human_review may be retried once after explicit operator review and prompt correction.
  return error === "human_review" ? 2 : 1;
}

export type AliceAutonomyConfig = {
  enabled: boolean;
  activatedAt: string | null;
  instanceId: string;
  backlogAnchorConversationId: string | null;
  initialDelayMs: 30_000;
  complementDelayMs: 3_000;
  monthlyLimitMicroUsd: null;
};

export function parseAliceAutonomyConfig(value: string | null | undefined): AliceAutonomyConfig {
  let raw: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(value || "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) raw = parsed;
  } catch {}
  const activatedAt = typeof raw.activatedAt === "string" && Number.isFinite(Date.parse(raw.activatedAt))
    ? new Date(raw.activatedAt).toISOString() : null;
  return {
    enabled: raw.enabled === true && raw.instanceId === ALICE_AUTONOMY_INSTANCE_ID && Boolean(activatedAt),
    activatedAt,
    instanceId: ALICE_AUTONOMY_INSTANCE_ID,
    backlogAnchorConversationId: typeof raw.backlogAnchorConversationId === "string" ? raw.backlogAnchorConversationId : null,
    initialDelayMs: ALICE_AUTONOMY_DELAY_MS,
    complementDelayMs: ALICE_AUTONOMY_COMPLEMENT_MS,
    monthlyLimitMicroUsd: null,
  };
}

export function aliceAutonomyAvailableAt(receivedAt: Date, now = new Date(), backlog = false) {
  return new Date(backlog ? now.getTime() + ALICE_AUTONOMY_DELAY_MS
    : Math.max(now.getTime(), receivedAt.getTime() + ALICE_AUTONOMY_DELAY_MS));
}

export function aliceAutonomyConversationEligible(conversation: {
  instanceId: string; status: string; blockedAt: Date | null; archivedAt: Date | null;
  commercialPaused: boolean; aiMode: string;
}, instanceId = ALICE_AUTONOMY_INSTANCE_ID) {
  return instanceId === ALICE_AUTONOMY_INSTANCE_ID && conversation.instanceId === instanceId
    && conversation.aiMode === "agent" && !conversation.blockedAt && !conversation.archivedAt
    && !conversation.commercialPaused && !["closed", "resolved", "lost"].includes(conversation.status);
}

export function aliceAutonomyCostMicroUsd(usage: {
  input: number; output: number; cacheRead?: number; cacheCreation?: number;
}) {
  return Math.ceil(usage.input * 3 + usage.output * 15 + (usage.cacheRead || 0) * 0.3 + (usage.cacheCreation || 0) * 3.75);
}

export function aliceAutonomyResponseClaimsBooking(messages: string[]) {
  const text = messages.join(" ").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  return /\b(?:agendei|agendamos|reservei|reservamos|confirmamos sua (?:avaliacao|presenca)|(?:avaliacao|horario|agendamento|reserva) (?:ja )?(?:esta |foi |ficou |esta tudo )?(?:agendad[oa]|reservad[oa]|confirmad[oa]))\b/u.test(text);
}
