import { prisma } from "@/lib/db";
import {
  AI_PUBLIC_SCHEDULING_LOOKAHEAD_DAYS,
  AI_PUBLIC_SCHEDULING_SEARCH_WINDOW_DAYS,
  AI_PUBLIC_SCHEDULING_SLOT_MINUTES,
  AI_PUBLIC_SCHEDULING_TIMEZONE,
  type AiPublicSchedulingDateMode,
  type AiPublicSchedulingPeriod,
  type AiPublicSchedulingPreference,
  type AiPublicSchedulingSlot,
  type AiPublicSchedulingWeekday,
} from "@/lib/ai-public-scheduling";

function datePartsInSaoPaulo(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: AI_PUBLIC_SCHEDULING_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function dateAtNoonUtc(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

function dateAtSaoPauloTime(date: string, time: string) {
  return new Date(`${date}T${time}:00-03:00`);
}

function addDays(date: string, amount: number) {
  const next = dateAtNoonUtc(date);
  next.setUTCDate(next.getUTCDate() + amount);
  return next.toISOString().slice(0, 10);
}

function weekday(date: string) {
  return dateAtNoonUtc(date).getUTCDay();
}

function matchesPreference(date: string, preference: Exclude<AiPublicSchedulingPreference, "unknown">) {
  const day = weekday(date);
  return preference === "saturday" ? day === 6 : day >= 1 && day <= 5;
}

function slotsForDate(date: string) {
  const day = weekday(date);
  const startHour = day === 6 ? 9 : 10;
  const lastStartHour = day === 6 ? 12 : 18;
  return Array.from({ length: lastStartHour - startHour + 1 }, (_, index) => (
    `${String(startHour + index).padStart(2, "0")}:00`
  ));
}

function matchesPeriod(time: string, period: AiPublicSchedulingPeriod) {
  const hour = Number(time.slice(0, 2));
  if (period === "morning") return hour < 12;
  if (period === "afternoon") return hour >= 12 && hour < 18;
  if (period === "evening") return hour >= 18;
  return true;
}

function selectTwoSlots(slots: AiPublicSchedulingSlot[]) {
  if (slots.length <= 2) return slots;
  const first = slots[0];
  const firstStart = dateAtSaoPauloTime(first.date, first.time).getTime();
  const spacedAlternative = slots.find((slot) => dateAtSaoPauloTime(slot.date, slot.time).getTime() - firstStart >= 2 * 60 * 60 * 1000);
  return [first, spacedAlternative || slots[1]];
}

export async function findAiPublicEvaluationAvailability(params: {
  unit: string;
  preference: Exclude<AiPublicSchedulingPreference, "unknown">;
  period?: AiPublicSchedulingPeriod;
  requestedWeekday?: AiPublicSchedulingWeekday | null;
  requestedDate?: string | null;
  requestedDateMode?: AiPublicSchedulingDateMode;
  excludeSlots?: AiPublicSchedulingSlot[];
  now?: Date;
}) {
  const now = params.now || new Date();
  const today = datePartsInSaoPaulo(now);
  const maximumDate = addDays(today, AI_PUBLIC_SCHEDULING_LOOKAHEAD_DAYS);
  const requestedDate = params.requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(params.requestedDate)
    ? params.requestedDate
    : null;
  if (requestedDate && requestedDate > maximumDate) return [];
  if (params.requestedDateMode === "exact" && requestedDate && requestedDate <= today) return [];
  const firstDate = requestedDate && requestedDate > today ? requestedDate : addDays(today, 1);
  const lastDate = params.requestedDateMode === "exact" && requestedDate
    ? firstDate
    : [addDays(firstDate, AI_PUBLIC_SCHEDULING_SEARCH_WINDOW_DAYS - 1), maximumDate].sort()[0];
  const rangeStart = dateAtSaoPauloTime(firstDate, "00:00");
  const rangeEnd = dateAtSaoPauloTime(lastDate, "23:59");
  const appointments = await prisma.agendamento.findMany({
    where: {
      unit: params.unit,
      procedimento: { contains: "Avalia", mode: "insensitive" },
      status: { notIn: ["cancelado", "falta"] },
      startTime: { lt: rangeEnd },
      endTime: { gt: rangeStart },
    },
    select: { startTime: true, endTime: true },
  });
  const earliestStart = now.getTime() + 60 * 60 * 1000;
  const available: AiPublicSchedulingSlot[] = [];
  const excludedSlots = new Set((params.excludeSlots || []).map((slot) => `${slot.date}T${slot.time}`));

  for (let date = firstDate; date <= lastDate; date = addDays(date, 1)) {
    if (!matchesPreference(date, params.preference)) continue;
    if (params.requestedWeekday != null && weekday(date) !== params.requestedWeekday) continue;
    for (const time of slotsForDate(date)) {
      if (!matchesPeriod(time, params.period || "unknown")) continue;
      if (excludedSlots.has(`${date}T${time}`)) continue;
      const startTime = dateAtSaoPauloTime(date, time);
      const endTime = new Date(startTime.getTime() + AI_PUBLIC_SCHEDULING_SLOT_MINUTES * 60 * 1000);
      const conflicts = appointments.some((appointment) => (
        appointment.startTime < endTime && appointment.endTime > startTime
      ));
      if (!conflicts && startTime.getTime() >= earliestStart) available.push({ date, time });
    }
  }

  return selectTwoSlots(available);
}
