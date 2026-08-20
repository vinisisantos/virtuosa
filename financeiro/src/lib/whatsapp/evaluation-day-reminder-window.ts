import { saoPauloDateKey } from "#lib/date-filter";

export const EVALUATION_DAY_REMINDER_HOURS_BEFORE = 2;
export const EVALUATION_DAY_REMINDER_EARLIEST_HOUR = 8;
export const EVALUATION_DAY_REMINDER_MANUAL_HOURS_BEFORE = 10;
export const EVALUATION_DAY_REMINDER_MANUAL_EARLIEST_HOUR = 0;

const HOUR_MS = 60 * 60 * 1000;
const SAO_PAULO_OFFSET = "-03:00";

export type EvaluationDayReminderWindowState =
  | "not_today"
  | "too_early"
  | "available"
  | "expired";

export function evaluationDayReminderWindow(params: {
  startTime: Date;
  now?: Date;
  hoursBefore?: number;
  earliestHour?: number;
}) {
  const now = params.now || new Date();
  const appointmentDateKey = saoPauloDateKey(params.startTime);
  const nowDateKey = saoPauloDateKey(now);
  const hoursBefore = params.hoursBefore ?? EVALUATION_DAY_REMINDER_HOURS_BEFORE;
  const earliestHour = params.earliestHour ?? EVALUATION_DAY_REMINDER_EARLIEST_HOUR;
  const earliestAt = new Date(
    `${appointmentDateKey}T${String(earliestHour).padStart(2, "0")}:00:00${SAO_PAULO_OFFSET}`,
  );
  const reminderAt = new Date(Math.max(
    params.startTime.getTime() - hoursBefore * HOUR_MS,
    earliestAt.getTime(),
  ));

  if (appointmentDateKey !== nowDateKey) {
    return { state: "not_today" as const, reminderAt };
  }
  if (now.getTime() >= params.startTime.getTime()) {
    return { state: "expired" as const, reminderAt };
  }
  if (now.getTime() < reminderAt.getTime()) {
    return { state: "too_early" as const, reminderAt };
  }
  return { state: "available" as const, reminderAt };
}
