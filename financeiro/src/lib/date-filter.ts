const SP_OFFSET = "-03:00";

export function parseDateTimeRange(searchParams: URLSearchParams) {
  const startAt =
    searchParams.get("startAt") ||
    buildLocalDateTime(searchParams.get("startDate"), searchParams.get("startTime"), "00:00");
  const endAt =
    searchParams.get("endAt") ||
    buildLocalDateTime(searchParams.get("endDate"), searchParams.get("endTime"), "23:59");

  const range: { gte?: Date; lte?: Date } = {};
  if (startAt) {
    const date = new Date(startAt);
    if (!Number.isNaN(date.getTime())) range.gte = date;
  }
  if (endAt) {
    const date = new Date(endAt);
    if (!Number.isNaN(date.getTime())) range.lte = date;
  }

  return Object.keys(range).length ? range : null;
}

function buildLocalDateTime(date: string | null, time: string | null, fallbackTime: string) {
  if (!date) return null;
  const safeTime = time && /^\d{2}:\d{2}$/.test(time) ? time : fallbackTime;
  const seconds = safeTime === "23:59" ? ":59.999" : ":00.000";
  return `${date}T${safeTime}${seconds}${SP_OFFSET}`;
}
