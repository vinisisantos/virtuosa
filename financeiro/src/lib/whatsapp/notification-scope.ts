const UNREAD_SUMMARY_PATH = "/api/whatsapp/conversations";

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
