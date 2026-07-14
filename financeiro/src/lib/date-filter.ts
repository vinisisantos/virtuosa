export const SAO_PAULO_TIME_ZONE = "America/Sao_Paulo";
const SP_OFFSET = "-03:00";
const DAY_MS = 24 * 60 * 60 * 1000;

export function saoPauloDateKey(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SAO_PAULO_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function saoPauloDayRange(date = new Date()) {
  const start = new Date(`${saoPauloDateKey(date)}T00:00:00${SP_OFFSET}`);
  return { start, end: new Date(start.getTime() + DAY_MS) };
}

export function millisecondsUntilNextSaoPauloDay(date = new Date()): number {
  const { end } = saoPauloDayRange(date);
  return Math.max(1_000, end.getTime() - date.getTime() + 1_000);
}

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
