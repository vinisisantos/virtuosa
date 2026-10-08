import { normalizeWhatsAppMessageStatus } from "./message-status.ts";

export const PENDING_RECONCILIATION_FIRST_MS = 30_000;
export const PENDING_RECONCILIATION_SECOND_MS = 180_000;
export const PENDING_CONFIRMATION_WARNING_MS = 120_000;
export const PENDING_RECONCILIATION_CONVERSATION_COOLDOWN_MS = 30_000;

type PendingMessage = {
  fromMe: boolean;
  status: string;
  timestamp: string;
  messageId?: string;
  readOnly?: boolean;
};

export type PendingReconciliationCheck = {
  messageId: string;
  checkpoint: 1 | 2;
};

export type PendingReconciliationPlan = {
  nextCheck: PendingReconciliationCheck | null;
  nextWakeAt: number | null;
  hasProlongedPending: boolean;
};

export function pendingReconciliationKey(conversationId: string, messageId: string) {
  return JSON.stringify([conversationId, messageId]);
}

export function pendingReconciliationRetryDelayMs(retryAfterMs: unknown) {
  return typeof retryAfterMs === "number" && Number.isFinite(retryAfterMs) && retryAfterMs > 0
    ? Math.max(5_000, Math.ceil(retryAfterMs))
    : PENDING_RECONCILIATION_CONVERSATION_COOLDOWN_MS;
}

export function releaseSkippedPendingCheck(
  attemptedCheckpoints: Map<string, number>,
  conversationId: string,
  check: PendingReconciliationCheck,
) {
  const key = pendingReconciliationKey(conversationId, check.messageId);
  if (attemptedCheckpoints.get(key) !== check.checkpoint) return;
  if (check.checkpoint === 1) attemptedCheckpoints.delete(key);
  else attemptedCheckpoints.set(key, 1);
}

export function planPendingMessageReconciliation(
  conversationId: string,
  messages: PendingMessage[],
  attemptedCheckpoints: ReadonlyMap<string, number>,
  now: number,
  nextAllowedCheckAt = 0,
): PendingReconciliationPlan {
  let nextCheck: PendingReconciliationCheck | null = null;
  let nextCheckTimestamp = -Infinity;
  let nextWakeAt: number | null = null;
  let hasProlongedPending = false;

  const scheduleWake = (timestamp: number) => {
    if (timestamp <= now) return;
    nextWakeAt = nextWakeAt === null ? timestamp : Math.min(nextWakeAt, timestamp);
  };

  for (const message of messages) {
    if (!message.fromMe || normalizeWhatsAppMessageStatus(message.status) !== "pending") continue;
    const sentAt = Date.parse(message.timestamp);
    if (!Number.isFinite(sentAt)) continue;

    if (now >= sentAt + PENDING_CONFIRMATION_WARNING_MS) hasProlongedPending = true;
    else scheduleWake(sentAt + PENDING_CONFIRMATION_WARNING_MS);

    if (!message.messageId || message.readOnly) continue;
    const attempted = attemptedCheckpoints.get(pendingReconciliationKey(conversationId, message.messageId)) || 0;
    const dueCheckpoint = attempted === 0 && now >= sentAt + PENDING_RECONCILIATION_FIRST_MS
      ? 1
      : attempted === 1 && now >= sentAt + PENDING_RECONCILIATION_SECOND_MS
        ? 2
        : 0;

    if (dueCheckpoint > attempted && sentAt >= nextCheckTimestamp) {
      nextCheck = { messageId: message.messageId, checkpoint: dueCheckpoint as 1 | 2 };
      nextCheckTimestamp = sentAt;
    } else if (attempted < 2) {
      scheduleWake(sentAt + (attempted === 0 ? PENDING_RECONCILIATION_FIRST_MS : PENDING_RECONCILIATION_SECOND_MS));
    }
  }

  if (nextCheck && now < nextAllowedCheckAt) {
    nextCheck = null;
    scheduleWake(nextAllowedCheckAt);
  }

  return { nextCheck, nextWakeAt, hasProlongedPending };
}
