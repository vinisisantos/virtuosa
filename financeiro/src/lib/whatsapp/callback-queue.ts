export const WHATSAPP_CALLBACK_MAX_TEAM_ATTEMPTS = 6;

export const WHATSAPP_CALLBACK_QUEUE_STATUS = {
  inactive: "inactive",
  waitingResponse: "waiting_response",
  responded: "responded",
  suppressedClosedPackage: "suppressed_closed_package",
} as const;

export type WhatsAppCallbackQueueStatus =
  typeof WHATSAPP_CALLBACK_QUEUE_STATUS[keyof typeof WHATSAPP_CALLBACK_QUEUE_STATUS];

export type WhatsAppCallbackQueueView = "due" | "waiting_response" | "responded" | null;

type CallbackQueueCandidate = {
  status?: string | null;
  lastInboundAt?: Date | string | null;
  lastOutboundAt?: Date | string | null;
  callbackTrackingStartedAt?: Date | string | null;
  callbackDueAt?: Date | string | null;
  callbackStreakCount?: number | null;
  callbackQueueStatus?: string | null;
};

const CLOSED_CONVERSATION_STATUSES = new Set(["closed", "resolved", "lost"]);

function timestampFrom(value?: Date | string | null) {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function whatsAppCallbackQueueView(
  conversation: CallbackQueueCandidate,
  now = Date.now(),
): WhatsAppCallbackQueueView {
  if (CLOSED_CONVERSATION_STATUSES.has(conversation.status || "")) return null;
  if (conversation.callbackQueueStatus === WHATSAPP_CALLBACK_QUEUE_STATUS.suppressedClosedPackage) return null;

  const dueAt = conversation.callbackDueAt
    ? new Date(conversation.callbackDueAt).getTime()
    : Number.POSITIVE_INFINITY;
  const lastInboundAt = timestampFrom(conversation.lastInboundAt);
  const lastOutboundAt = timestampFrom(conversation.lastOutboundAt);
  const teamIsWaitingForLead = lastOutboundAt !== null
    && (lastInboundAt === null || lastOutboundAt > lastInboundAt);
  const isDue = Boolean(
    conversation.callbackTrackingStartedAt
    && teamIsWaitingForLead
    && dueAt <= now
    && (conversation.callbackStreakCount || 0) < WHATSAPP_CALLBACK_MAX_TEAM_ATTEMPTS,
  );
  if (isDue) return "due";

  return null;
}

export function isWhatsAppConversationInCallbackQueue(
  conversation: CallbackQueueCandidate,
  now = Date.now(),
) {
  return whatsAppCallbackQueueView(conversation, now) !== null;
}
