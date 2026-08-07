const UNREAD_SUMMARY_PATH = "/api/whatsapp/conversations";

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
