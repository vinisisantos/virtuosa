import { prisma } from "@/lib/db";
import {
  AI_PUBLIC_SCHEDULING_LOOKAHEAD_DAYS,
  AI_PUBLIC_SCHEDULING_SLOT_MINUTES,
  AI_PUBLIC_SCHEDULING_TIMEZONE,
  type AiPublicSchedulingPreference,
  type AiPublicSchedulingSlot,
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
  now?: Date;
}) {
  const now = params.now || new Date();
  const today = datePartsInSaoPaulo(now);
  const firstDate = addDays(today, 1);
  const lastDate = addDays(today, AI_PUBLIC_SCHEDULING_LOOKAHEAD_DAYS);
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

  for (let offset = 1; offset <= AI_PUBLIC_SCHEDULING_LOOKAHEAD_DAYS; offset += 1) {
    const date = addDays(today, offset);
    if (!matchesPreference(date, params.preference)) continue;
    for (const time of slotsForDate(date)) {
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
