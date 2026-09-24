export const INBOX_ACTIVE_POLL_INTERVAL_MS = 5_000;
const RECENT_DRAFT_WINDOW_MS = 30_000;
const RECENT_PENDING_WINDOW_MS = 30_000;

type PendingMessage = {
  fromMe: boolean;
  status: string;
  timestamp: string;
};

export function shouldRefreshActiveConversation(params: {
  now: number;
  lastDraftChangeAt: number;
  hasDraft: boolean;
  messages: PendingMessage[];
}) {
  const { now, lastDraftChangeAt, hasDraft, messages } = params;
  if (hasDraft && lastDraftChangeAt > 0 && now - lastDraftChangeAt <= RECENT_DRAFT_WINDOW_MS) {
    return true;
  }

  return messages.some((message) => {
    if (!message.fromMe || message.status !== "pending") return false;
    const age = now - new Date(message.timestamp).getTime();
    return Number.isFinite(age) && age >= 0 && age <= RECENT_PENDING_WINDOW_MS;
  });
}
