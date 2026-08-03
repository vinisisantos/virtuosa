import { createHash } from "node:crypto";

export const AI_PUBLIC_SCHEDULING_TIMEZONE = "America/Sao_Paulo";
export const AI_PUBLIC_SCHEDULING_UNAVAILABLE_PERCENT = 30;

export const AI_PUBLIC_SCHEDULING_STATUSES = [
  "idle",
  "collecting_date",
  "collecting_time",
  "awaiting_confirmation",
  "alternative_offered",
  "confirmed",
  "declined",
] as const;

export const AI_PUBLIC_SCHEDULING_REASONS = [
  "requested_available",
  "requested_unavailable",
  "outside_hours",
  "closed_day",
  "invalid_interval",
] as const;

export type AiPublicSchedulingStatus = (typeof AI_PUBLIC_SCHEDULING_STATUSES)[number];
export type AiPublicSchedulingReason = (typeof AI_PUBLIC_SCHEDULING_REASONS)[number];

export type AiPublicSchedulingState = {
  status: AiPublicSchedulingStatus;
  requestedDate: string | null;
  requestedTime: string | null;
  offeredDate: string | null;
  offeredTime: string | null;
  confirmedDate: string | null;
  confirmedTime: string | null;
  reason: AiPublicSchedulingReason | null;
};

export type AiPublicSchedulingTurn = {
  active: boolean;
  state: AiPublicSchedulingState;
};

const SCHEDULE_INTENT = /\b(?:agend\w*|hor[aá]rio|disponibilidade|marcar|reservar)\b|\b(?:quero|gostaria|vamos|posso|pode|desejo)\b.{0,30}\bavalia[cç][aã]o\b/i;
const POSITIVE_CONFIRMATION = /^(?:sim(?:\s*,?\s*(?:por\s+favor|pode\s+ser|confirmo))?|quero|quero\s+sim|pode\s+ser|confirmo|vamos|perfeito|ok|beleza|esse|essa|esse\s+hor[aá]rio)[!,.\s]*$/i;
const NEGATIVE_CONFIRMATION = /^(?:n[aã]o|esse\s+n[aã]o|outro|outro\s+hor[aá]rio|prefiro\s+outro)[!,.\s]*$/i;
const WEEKDAYS: Record<string, number> = {
  domingo: 0,
  segunda: 1,
  terca: 2,
  quarta: 3,
  quinta: 4,
  sexta: 5,
  sabado: 6,
};

function normalizeForMatch(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function emptySchedulingState(): AiPublicSchedulingState {
  return {
    status: "idle",
    requestedDate: null,
    requestedTime: null,
    offeredDate: null,
    offeredTime: null,
    confirmedDate: null,
    confirmedTime: null,
    reason: null,
  };
}

function normalizedEnum<T extends string>(value: unknown, values: readonly T[], fallback: T): T {
  return typeof value === "string" && values.includes(value as T) ? value as T : fallback;
}

function normalizedDate(value: unknown) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function normalizedTime(value: unknown) {
  return typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : null;
}

export function emptyAiPublicSchedulingState() {
  return emptySchedulingState();
}

export function normalizeAiPublicSchedulingState(value: unknown): AiPublicSchedulingState {
  const fallback = emptySchedulingState();
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const raw = value as Record<string, unknown>;
  const rawReason = raw.reason == null
    ? null
    : normalizedEnum(raw.reason, AI_PUBLIC_SCHEDULING_REASONS, "requested_available");
  return {
    status: normalizedEnum(raw.status, AI_PUBLIC_SCHEDULING_STATUSES, fallback.status),
    requestedDate: normalizedDate(raw.requestedDate),
    requestedTime: normalizedTime(raw.requestedTime),
    offeredDate: normalizedDate(raw.offeredDate),
    offeredTime: normalizedTime(raw.offeredTime),
    confirmedDate: normalizedDate(raw.confirmedDate),
    confirmedTime: normalizedTime(raw.confirmedTime),
    reason: rawReason,
  };
}

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

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: string, amount: number) {
  const next = dateAtNoonUtc(date);
  next.setUTCDate(next.getUTCDate() + amount);
  return isoDate(next);
}

function weekday(date: string) {
  return dateAtNoonUtc(date).getUTCDay();
}

function validCalendarDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function dateFromMessage(message: string, today: string) {
  const normalized = normalizeForMatch(message);
  if (/\bdepois\s+de\s+amanha\b/.test(normalized)) return addDays(today, 2);
  if (/\bamanha\b/.test(normalized)) return addDays(today, 1);
  if (/\bhoje\b/.test(normalized)) return today;

  const explicit = normalized.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  if (explicit) {
    const currentYear = Number(today.slice(0, 4));
    const yearValue = explicit[3] ? Number(explicit[3]) : currentYear;
    const year = yearValue < 100 ? 2000 + yearValue : yearValue;
    const month = Number(explicit[2]);
    const day = Number(explicit[1]);
    if (validCalendarDate(year, month, day)) {
      const selected = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      return selected < today && !explicit[3]
        ? `${currentYear + 1}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
        : selected;
    }
  }

  const weekdayMatch = Object.keys(WEEKDAYS).find((name) => new RegExp(`\\b${name}(?:-feira)?\\b`, "i").test(normalized));
  if (!weekdayMatch) return null;
  const target = WEEKDAYS[weekdayMatch];
  const offset = (target - weekday(today) + 7) % 7;
  return addDays(today, offset);
}

function timeFromMessage(message: string) {
  const normalized = normalizeForMatch(message);
  const colon = normalized.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  const hour = normalized.match(/\b([01]?\d|2[0-3])\s*h(?:\s*([0-5]\d))?\b/);
  const spoken = normalized.match(/\b(?:[àa]s?|pelas?)\s*([01]?\d|2[0-3])(?:\s*(?::|e)\s*([0-5]\d))?\b/);
  const match = colon || hour || spoken;
  if (!match) return null;
  return `${String(Number(match[1])).padStart(2, "0")}:${String(Number(match[2] || 0)).padStart(2, "0")}`;
}

function minutesFromTime(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function timeFromMinutes(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function aiPublicEvaluationSlots(date: string) {
  const day = weekday(date);
  if (day === 0) return [];
  const start = day === 6 ? 9 * 60 : 10 * 60;
  const lastStart = day === 6 ? 12 * 60 : 18 * 60 + 30;
  const slots: string[] = [];
  for (let current = start; current <= lastStart; current += 30) slots.push(timeFromMinutes(current));
  return slots;
}

function slotUnavailable(sessionSeed: string, date: string, time: string) {
  const hash = createHash("sha256").update(`${sessionSeed}|${date}|${time}`).digest("hex");
  return Number.parseInt(hash.slice(0, 8), 16) % 100 < AI_PUBLIC_SCHEDULING_UNAVAILABLE_PERCENT;
}

export function isAiPublicEvaluationSlotAvailable(sessionSeed: string, date: string, time: string) {
  return aiPublicEvaluationSlots(date).includes(time) && !slotUnavailable(sessionSeed, date, time);
}

function sortedNearestSlots(slots: string[], requestedTime: string) {
  const requestedMinutes = minutesFromTime(requestedTime);
  return [...slots].sort((left, right) => {
    const leftMinutes = minutesFromTime(left);
    const rightMinutes = minutesFromTime(right);
    const distance = Math.abs(leftMinutes - requestedMinutes) - Math.abs(rightMinutes - requestedMinutes);
    if (distance !== 0) return distance;
    const leftIsLater = leftMinutes >= requestedMinutes;
    const rightIsLater = rightMinutes >= requestedMinutes;
    if (leftIsLater !== rightIsLater) return leftIsLater ? -1 : 1;
    return leftMinutes - rightMinutes;
  });
}

function nextOpenDate(date: string) {
  let candidate = date;
  for (let index = 0; index < 8; index += 1) {
    if (aiPublicEvaluationSlots(candidate).length > 0) return candidate;
    candidate = addDays(candidate, 1);
  }
  return addDays(date, 1);
}

function nearestAvailableSlot(sessionSeed: string, date: string, requestedTime: string) {
  const openDate = nextOpenDate(date);
  const slots = sortedNearestSlots(aiPublicEvaluationSlots(openDate), requestedTime);
  const available = slots.find((slot) => isAiPublicEvaluationSlotAvailable(sessionSeed, openDate, slot));
  if (available) return { date: openDate, time: available };

  for (let offset = 1; offset <= 7; offset += 1) {
    const nextDate = nextOpenDate(addDays(openDate, offset));
    const nextSlot = aiPublicEvaluationSlots(nextDate)
      .find((slot) => isAiPublicEvaluationSlotAvailable(sessionSeed, nextDate, slot));
    if (nextSlot) return { date: nextDate, time: nextSlot };
  }
  return null;
}

function resolveRequestedSlot(sessionSeed: string, date: string, time: string) {
  const slots = aiPublicEvaluationSlots(date);
  if (slots.length === 0) {
    return {
      alternative: nearestAvailableSlot(sessionSeed, addDays(date, 1), time),
      reason: "closed_day" as const,
    };
  }
  if (!slots.includes(time)) {
    return {
      alternative: nearestAvailableSlot(sessionSeed, date, time),
      reason: (minutesFromTime(time) % 30 === 0 ? "outside_hours" : "invalid_interval") as AiPublicSchedulingReason,
    };
  }
  if (!isAiPublicEvaluationSlotAvailable(sessionSeed, date, time)) {
    return {
      alternative: nearestAvailableSlot(sessionSeed, date, time),
      reason: "requested_unavailable" as const,
    };
  }
  return {
    alternative: { date, time },
    reason: "requested_available" as const,
  };
}

export function resolveAiPublicSchedulingTurn(params: {
  sessionSeed: string;
  previous: unknown;
  latestClientMessage: string;
  now?: Date;
}): AiPublicSchedulingTurn {
  const previous = normalizeAiPublicSchedulingState(params.previous);
  const message = params.latestClientMessage.trim();
  const active = previous.status !== "idle" || SCHEDULE_INTENT.test(message);
  if (!active) return { active: false, state: previous };

  if (["awaiting_confirmation", "alternative_offered"].includes(previous.status)) {
    if (POSITIVE_CONFIRMATION.test(message) && previous.offeredDate && previous.offeredTime) {
      return {
        active: true,
        state: {
          ...previous,
          status: "confirmed",
          confirmedDate: previous.offeredDate,
          confirmedTime: previous.offeredTime,
        },
      };
    }
    if (NEGATIVE_CONFIRMATION.test(message)) {
      return {
        active: true,
        state: {
          ...previous,
          status: "collecting_date",
          requestedDate: null,
          requestedTime: null,
          offeredDate: null,
          offeredTime: null,
          reason: null,
        },
      };
    }
  }

  const today = datePartsInSaoPaulo(params.now || new Date());
  const requestedDate = dateFromMessage(message, today) || previous.requestedDate;
  const requestedTime = timeFromMessage(message) || previous.requestedTime;

  if (!requestedDate) {
    return {
      active: true,
      state: { ...previous, status: "collecting_date", requestedTime },
    };
  }
  if (!requestedTime) {
    return {
      active: true,
      state: { ...previous, status: "collecting_time", requestedDate },
    };
  }

  const resolved = resolveRequestedSlot(params.sessionSeed, requestedDate, requestedTime);
  if (!resolved.alternative) {
    return {
      active: true,
      state: { ...previous, status: "collecting_date", requestedDate, requestedTime },
    };
  }
  const requestedAvailable = resolved.reason === "requested_available";
  return {
    active: true,
    state: {
      ...previous,
      status: requestedAvailable ? "awaiting_confirmation" : "alternative_offered",
      requestedDate,
      requestedTime,
      offeredDate: resolved.alternative.date,
      offeredTime: resolved.alternative.time,
      confirmedDate: null,
      confirmedTime: null,
      reason: resolved.reason,
    },
  };
}

export function formatAiPublicSchedulingDate(date: string | null) {
  return date
    ? new Intl.DateTimeFormat("pt-BR", {
        timeZone: "UTC",
        weekday: "long",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).format(dateAtNoonUtc(date))
    : null;
}

export function buildAiPublicSchedulingMessages(turn: AiPublicSchedulingTurn) {
  const { state } = turn;
  if (!turn.active || state.status === "idle") return null;
  if (state.status === "collecting_date") {
    return ["Vamos simular o agendamento da sua avaliação. Qual dia ou data você prefere?"];
  }
  if (state.status === "collecting_time") {
    const date = formatAiPublicSchedulingDate(state.requestedDate);
    return [`Perfeito. Para ${date}, qual horário você prefere? Atendemos das 10:00 às 19:00 durante a semana e das 09:00 às 12:30 aos sábados.`];
  }
  const date = formatAiPublicSchedulingDate(state.offeredDate || state.confirmedDate);
  const time = state.offeredTime || state.confirmedTime;
  if (!date || !time) {
    return ["Qual outro dia ou horário você prefere para continuarmos a simulação?"];
  }
  if (state.status === "confirmed") {
    return [`Prontinho. Nesta simulação, sua avaliação ficou reservada para ${date}, às ${time}. Nenhuma agenda real foi alterada.`];
  }
  if (state.status === "awaiting_confirmation") {
    return [`Na agenda simulada, ${date}, às ${time}, está disponível. Posso reservar esse horário para concluirmos o teste?`];
  }
  if (state.status === "alternative_offered") {
    const reason = state.reason === "closed_day"
      ? "Nesse dia não realizamos avaliações."
      : state.reason === "outside_hours" || state.reason === "invalid_interval"
        ? "Esse horário fica fora dos horários disponíveis para avaliação."
        : "Esse horário não está disponível na agenda simulada.";
    return [`${reason} O horário mais próximo é ${date}, às ${time}. Funciona para você?`];
  }
  return ["Qual outro dia ou horário você prefere para continuarmos a simulação?"];
}

export function aiPublicSchedulingContractForPrompt(turn: AiPublicSchedulingTurn) {
  return {
    version: "public-scheduling-v1",
    simulationOnly: true,
    timezone: AI_PUBLIC_SCHEDULING_TIMEZONE,
    weekdayHours: "segunda a sexta, das 10:00 às 19:00; último início às 18:30",
    saturdayHours: "sábado, das 09:00 às 12:30; último início às 12:00",
    sundayHours: "sem avaliações",
    slotMinutes: 30,
    unavailablePercent: AI_PUBLIC_SCHEDULING_UNAVAILABLE_PERCENT,
    active: turn.active,
    state: turn.state,
    display: {
      requestedDate: formatAiPublicSchedulingDate(turn.state.requestedDate),
      offeredDate: formatAiPublicSchedulingDate(turn.state.offeredDate),
      confirmedDate: formatAiPublicSchedulingDate(turn.state.confirmedDate),
    },
    rules: [
      "Use somente a data e o horario resolvidos neste contrato; nunca invente outra disponibilidade.",
      "collecting_date: pergunte apenas o dia ou a data preferida.",
      "collecting_time: pergunte apenas o horario preferido dentro do expediente.",
      "awaiting_confirmation: informe que o horario esta livre na agenda simulada e pergunte se pode reservar.",
      "alternative_offered: diga que o horario solicitado nao esta disponivel na simulacao, ofereca offeredDate/offeredTime e pergunte se funciona.",
      "confirmed: conclua sem pergunta e diga explicitamente que a reserva existe apenas nesta simulacao.",
      "Nunca afirme que houve alteracao no CRM, WhatsApp ou agenda real.",
    ],
  };
}
