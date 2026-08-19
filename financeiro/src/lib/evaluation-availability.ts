import { SAO_PAULO_TIME_ZONE, saoPauloDateKey } from "#lib/date-filter";

const SAO_PAULO_OFFSET = "-03:00";
const MAX_AVAILABILITY_DAYS = 7;

export const EVALUATION_AVAILABILITY_TIMES = Array.from({ length: 28 }, (_, index) => {
  const hour = Math.floor(index / 2) + 7;
  const minutes = index % 2 === 0 ? "00" : "30";
  return `${String(hour).padStart(2, "0")}:${minutes}`;
});

export type EvaluationAvailabilityPeriod = "all" | "morning" | "afternoon" | "evening";

export type EvaluationAvailabilitySlot = {
  id: string;
  date: string;
  time: string;
  weekdayLabel: string;
  dateLabel: string;
};

function dateFromKey(dateKey: string, hour = "12:00") {
  return new Date(`${dateKey}T${hour}:00${SAO_PAULO_OFFSET}`);
}

export function addDaysToDateKey(dateKey: string, days: number) {
  const parsed = dateFromKey(dateKey);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return saoPauloDateKey(parsed);
}

export function evaluationAvailabilityDateKeys(startDate: string, endDate: string) {
  const keys: string[] = [];
  let current = startDate;

  while (current <= endDate && keys.length < MAX_AVAILABILITY_DAYS) {
    keys.push(current);
    current = addDaysToDateKey(current, 1);
  }

  return keys;
}

export function evaluationAvailabilityRange(startDate: string, endDate: string) {
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!datePattern.test(startDate) || !datePattern.test(endDate)) {
    throw new Error("Período de disponibilidade inválido");
  }
  if (saoPauloDateKey(dateFromKey(startDate)) !== startDate || saoPauloDateKey(dateFromKey(endDate)) !== endDate) {
    throw new Error("Período de disponibilidade inválido");
  }
  if (endDate < startDate) {
    throw new Error("A data final deve ser igual ou posterior à data inicial");
  }

  const dateKeys = evaluationAvailabilityDateKeys(startDate, endDate);
  if (!dateKeys.length || dateKeys.at(-1) !== endDate) {
    throw new Error(`Consulte no máximo ${MAX_AVAILABILITY_DAYS} dias por vez`);
  }

  return {
    dateKeys,
    start: dateFromKey(startDate, "00:00"),
    endExclusive: dateFromKey(addDaysToDateKey(endDate, 1), "00:00"),
  };
}

function periodIncludesTime(period: EvaluationAvailabilityPeriod, time: string) {
  const hour = Number(time.slice(0, 2));
  if (period === "morning") return hour < 12;
  if (period === "afternoon") return hour >= 12 && hour < 18;
  if (period === "evening") return hour >= 18;
  return true;
}

export function evaluationStartSlotKey(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SAO_PAULO_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

function slotLabels(dateKey: string) {
  const date = dateFromKey(dateKey);
  const weekdayLabel = new Intl.DateTimeFormat("pt-BR", {
    timeZone: SAO_PAULO_TIME_ZONE,
    weekday: "long",
  }).format(date);
  return {
    weekdayLabel: weekdayLabel.charAt(0).toUpperCase() + weekdayLabel.slice(1),
    dateLabel: new Intl.DateTimeFormat("pt-BR", {
      timeZone: SAO_PAULO_TIME_ZONE,
      day: "2-digit",
      month: "2-digit",
    }).format(date),
  };
}

export function buildEvaluationAvailabilitySlots(params: {
  startDate: string;
  endDate: string;
  period?: EvaluationAvailabilityPeriod;
  occupiedStartTimes?: Array<Date | string>;
  now?: Date;
}) {
  const range = evaluationAvailabilityRange(params.startDate, params.endDate);
  const period = params.period || "all";
  const now = params.now || new Date();
  const occupied = new Set((params.occupiedStartTimes || []).map(evaluationStartSlotKey));
  const labels = new Map(range.dateKeys.map((dateKey) => [dateKey, slotLabels(dateKey)]));

  return range.dateKeys.flatMap((dateKey) => {
    const weekday = dateFromKey(dateKey).getUTCDay();
    if (weekday === 0) return [];

    return EVALUATION_AVAILABILITY_TIMES.flatMap((time) => {
      if (!periodIncludesTime(period, time)) return [];
      const id = `${dateKey}T${time}`;
      const startTime = dateFromKey(dateKey, time);
      if (startTime.getTime() <= now.getTime() || occupied.has(id)) return [];
      const label = labels.get(dateKey)!;
      return [{ id, date: dateKey, time, ...label } satisfies EvaluationAvailabilitySlot];
    });
  });
}

function displayAvailabilityTime(time: string) {
  const [hour, minute] = time.split(":");
  return minute === "00" ? `${Number(hour)}h` : `${Number(hour)}h${minute}`;
}

export function buildEvaluationAvailabilityMessage(slots: EvaluationAvailabilitySlot[]) {
  const lines = slots.map((slot, index) => (
    `${index + 1} — ${slot.weekdayLabel}, ${slot.dateLabel}, às ${displayAvailabilityTime(slot.time)}`
  ));

  return [
    "Tenho estes horários disponíveis para sua avaliação: 🌸",
    "",
    ...lines,
    "",
    "Qual dessas opções fica melhor para você?",
  ].join("\n");
}
