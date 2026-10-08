const UNREAD_SUMMARY_PATH = "/api/whatsapp/conversations";
export const WHATSAPP_INBOUND_REALTIME_EVENT = "whatsapp-inbound-realtime";
export const WHATSAPP_CONVERSATION_READ_EVENT = "whatsapp-conversation-read";

export function realtimeRefreshDelay(now: number, lastRefreshAt: number, cooldownMs: number, debounceMs: number) {
  return Math.max(debounceMs, cooldownMs - (now - lastRefreshAt));
}

export function isNewInboundRealtimePayload(payload: unknown) {
  if (!payload || typeof payload !== "object") return false;
  const change = payload as { kind?: unknown; isNewInboundMessage?: unknown };
  return change.kind === "message" && change.isNewInboundMessage === true;
}

export function diffUnreadConversationSnapshot<T extends { id: string; unreadCount: number }>(
  conversations: T[],
  previousCounts: Readonly<Record<string, number>>,
) {
  const nextCounts: Record<string, number> = {};
  const newlyUnread: T[] = [];
  for (const conversation of conversations) {
    if (conversation.unreadCount > (previousCounts[conversation.id] || 0)) {
      newlyUnread.push(conversation);
    }
    nextCounts[conversation.id] = conversation.unreadCount;
  }
  return { nextCounts, newlyUnread };
}

export function withConversationReadBaseline(
  counts: Readonly<Record<string, number>>,
  conversationId: string,
) {
  if (!Object.prototype.hasOwnProperty.call(counts, conversationId)) return counts;
  return { ...counts, [conversationId]: 0 };
}

export function excludeConversationsReadAfterRequest<T extends { id: string }>(
  conversations: T[],
  readVersions: ReadonlyMap<string, number>,
  requestReadVersion: number,
) {
  return conversations.filter((conversation) => (
    (readVersions.get(conversation.id) || 0) <= requestReadVersion
  ));
}

export type WhatsAppUnreadNotificationCandidate = {
  instanceId?: string | null;
};

export type WhatsAppFollowUpNotificationCandidate = {
  id: string;
  scheduledAt: string | Date;
  conversation: {
    id: string;
    instanceId?: string | null;
    contact?: { name?: string | null; phone?: string | null } | null;
  };
};

export function hasAudibleWhatsAppNotification(
  conversations: WhatsAppUnreadNotificationCandidate[],
  mutedInstanceIds: ReadonlySet<string>,
) {
  return conversations.some((conversation) => (
    !conversation.instanceId || !mutedInstanceIds.has(conversation.instanceId)
  ));
}

export function buildWhatsappUnreadSummaryUrl(pathname: string, search: string) {
  const requestParams = new URLSearchParams({ summary: "unread" });
  if (!pathname.startsWith("/crm/inbox")) {
    return `${UNREAD_SUMMARY_PATH}?${requestParams.toString()}`;
  }

  const inboxParams = new URLSearchParams(search);
  const targetInstanceId = inboxParams.get("targetInstanceId");
  const targetUserId = inboxParams.get("targetUserId");
  const unit = inboxParams.get("unit");

  if (targetInstanceId) {
    requestParams.set("targetInstanceId", targetInstanceId);
  } else if (targetUserId) {
    requestParams.set("targetUserId", targetUserId);
  }
  if (unit) requestParams.set("unit", unit);

  return `${UNREAD_SUMMARY_PATH}?${requestParams.toString()}`;
}

export function newDueWhatsAppFollowUps(
  followUps: WhatsAppFollowUpNotificationCandidate[],
  seenKeys: ReadonlySet<string>,
  mutedInstanceIds: ReadonlySet<string>,
) {
  return followUps.filter((followUp) => {
    const key = `${followUp.id}:${new Date(followUp.scheduledAt).toISOString()}`;
    return !seenKeys.has(key)
      && (!followUp.conversation.instanceId || !mutedInstanceIds.has(followUp.conversation.instanceId));
  });
}

export function dueWhatsAppFollowUpKeys(
  followUps: WhatsAppFollowUpNotificationCandidate[],
) {
  return new Set(followUps.map(whatsappFollowUpNotificationKey));
}

export function whatsappFollowUpNotificationKey(
  followUp: Pick<WhatsAppFollowUpNotificationCandidate, "id" | "scheduledAt">,
) {
  return `${followUp.id}:${new Date(followUp.scheduledAt).toISOString()}`;
}
