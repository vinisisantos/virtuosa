export const FOLLOW_UP_CENTER_PILOT_UNIT = "Osasco";
export const FOLLOW_UP_CENTER_PAGE_SIZE = 50;

export const FOLLOW_UP_CENTER_BUCKETS = [
  "priority",
  "recovery",
  "reactivation",
  "first_attempt",
  "all",
] as const;

export type FollowUpCenterBucket = (typeof FOLLOW_UP_CENTER_BUCKETS)[number];

export function parseFollowUpCenterBucket(value?: string | null): FollowUpCenterBucket {
  return FOLLOW_UP_CENTER_BUCKETS.includes(value as FollowUpCenterBucket)
    ? value as FollowUpCenterBucket
    : "priority";
}

export function followUpCenterAgeBucket(
  callbackDueAt: Date | string,
  now = Date.now(),
) {
  const overdueMs = Math.max(0, now - new Date(callbackDueAt).getTime());
  const overdueDays = overdueMs / (24 * 60 * 60 * 1000);

  if (overdueDays < 1) return "today" as const;
  if (overdueDays < 7) return "active" as const;
  if (overdueDays < 14) return "recovery" as const;
  return "reactivation" as const;
}
