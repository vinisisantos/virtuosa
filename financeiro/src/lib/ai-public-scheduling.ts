export const AI_PUBLIC_SCHEDULING_TIMEZONE = "America/Sao_Paulo";
export const AI_PUBLIC_SCHEDULING_LOOKAHEAD_DAYS = 90;
export const AI_PUBLIC_SCHEDULING_SEARCH_WINDOW_DAYS = 21;
export const AI_PUBLIC_SCHEDULING_SLOT_MINUTES = 60;

export const AI_PUBLIC_SCHEDULING_STATUSES = [
  "idle",
  "collecting_period",
  "clarifying_date",
  "awaiting_confirmation",
  "confirmed",
  "declined",
] as const;

export const AI_PUBLIC_SCHEDULING_REASONS = [
  "live_availability",
  "no_availability",
  "cancelled_by_client",
  "reschedule_requested",
] as const;

export type AiPublicSchedulingStatus = (typeof AI_PUBLIC_SCHEDULING_STATUSES)[number];
export type AiPublicSchedulingReason = (typeof AI_PUBLIC_SCHEDULING_REASONS)[number];
export type AiPublicSchedulingPreference = "unknown" | "weekday" | "saturday";
export type AiPublicSchedulingPeriod = "unknown" | "morning" | "afternoon" | "evening";
export type AiPublicSchedulingWeekday = 1 | 2 | 3 | 4 | 5 | 6;
export type AiPublicSchedulingDateMode = "none" | "not_before" | "exact";

export type AiPublicSchedulingSlot = {
  date: string;
  time: string;
};

export type AiPublicSchedulingState = {
  status: AiPublicSchedulingStatus;
  preference: AiPublicSchedulingPreference;
  period: AiPublicSchedulingPeriod;
  requestedWeekday: AiPublicSchedulingWeekday | null;
  offeredSlots: AiPublicSchedulingSlot[];
  requestedDate: string | null;
  requestedDateMode: AiPublicSchedulingDateMode;
  pendingDate: string | null;
  pendingDateMode: AiPublicSchedulingDateMode;
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

const SCHEDULE_INTENT = /\b(?:agend\w*|hor[aá]rio|disponibilidade|marcar|reservar)\b|\b(?:quero|gostaria|vamos|posso|pode|desejo)\b.{0,30}\bavalia[cç][aã]o\b|\b(?:s[oó]\s+)?(?:consigo|posso)\s+ir\b.{0,50}\b(?:daqui|semana|m[eê]s|dias?)\b/i;
const WEEKDAY_PREFERENCE = /\b(?:durante\s+a\s+semana|na\s+semana|semana)\b/i;
const SATURDAY_PREFERENCE = /\b(?:s[aá]bado|fim\s+de\s+semana)\b/i;
const ORDINAL_OPTION = /\b(?:a\s+)?(primeira|segunda|terceira)\s+(?:op[cç][aã]o|alternativa)\b|\b(?:o\s+)?(primeiro|segundo|terceiro)\s+hor[aá]rio\b|\b([123])(?:a|ª|o|º)?\s*(?:op[cç][aã]o|hor[aá]rio)\b/i;
const NEGATIVE_CONFIRMATION = /^(?:n[aã]o|nenhum|outro|outro\s+hor[aá]rio|prefiro\s+outro)[!,.\s]*$/i;
const ALTERNATIVE_SLOT_REQUEST = /\b(?:outro\s+(?:dia|hor[aá]rio)|mais\s+(?:cedo|tarde)|n[aã]o\s+tem|tem\s+outro|prefiro\s+outro|nenhum\s+desses)\b/i;
const SCHEDULING_CONSENT = /^(?:sim|sim\s+por\s+favor|pode|pode\s+sim|quero|quero\s+sim|vamos|claro|ok|beleza)[!,.\s]*$/i;
const SCHEDULING_CONSULTATION_OFFER = /\b(?:posso|podemos|quer\s+que\s+eu)\b.{0,70}\b(?:consultar|verificar|ver)\b.{0,50}\b(?:hor[aá]rios?|disponibilidade|agenda)\b|\b(?:seguir|avan[cç]ar)\b.{0,40}\b(?:agendamento|agenda)\b/i;
const MORNING_PERIOD = /\b(?:manh[aã]|cedo)\b/i;
const AFTERNOON_PERIOD = /\b(?:tarde|depois\s+do\s+almo[cç]o)\b/i;
const EVENING_PERIOD = /\b(?:fim\s+do\s+dia|noite|final\s+do\s+dia)\b/i;
const CANCELLATION_REQUEST = /\b(?:cancelar|cancele|cancela|desmarcar|desmarque|desmarca|n[aã]o\s+vou\s+conseguir\s+ir|n[aã]o\s+posso\s+mais\s+ir)\b/i;
const RESCHEDULE_REQUEST = /\b(?:remarcar|remarque|remarca|reagendar|reagende|reagenda)\b|\b(?:mudar|trocar)\b.{0,45}\b(?:dia|data|hor[aá]rio|agendamento|avalia[cç][aã]o)\b/i;

function normalizeForMatch(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function emptySchedulingState(): AiPublicSchedulingState {
  return {
    status: "idle",
    preference: "unknown",
    period: "unknown",
    requestedWeekday: null,
    offeredSlots: [],
    requestedDate: null,
    requestedDateMode: "none",
    pendingDate: null,
    pendingDateMode: "none",
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

function normalizedWeekday(value: unknown): AiPublicSchedulingWeekday | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 6
    ? value as AiPublicSchedulingWeekday
    : null;
}

function normalizeSlot(value: unknown): AiPublicSchedulingSlot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const date = normalizedDate(source.date);
  const time = normalizedTime(source.time);
  return date && time ? { date, time } : null;
}

function dateAtNoonUtc(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
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

function addDays(date: string, amount: number) {
  const next = dateAtNoonUtc(date);
  next.setUTCDate(next.getUTCDate() + amount);
  return next.toISOString().slice(0, 10);
}

function nextMonday(date: string) {
  const weekday = dateAtNoonUtc(date).getUTCDay();
  return addDays(date, weekday === 0 ? 1 : 8 - weekday);
}

function firstBusinessDay(date: string) {
  const weekday = dateAtNoonUtc(date).getUTCDay();
  if (weekday === 6) return addDays(date, 2);
  if (weekday === 0) return addDays(date, 1);
  return date;
}

function relativeAmount(value: string) {
  const normalized = normalizeForMatch(value).trim();
  const numeric = Number.parseInt(normalized, 10);
  if (Number.isInteger(numeric)) return numeric;
  return ({
    um: 1,
    uma: 1,
    dois: 2,
    duas: 2,
    tres: 3,
    quatro: 4,
    cinco: 5,
    seis: 6,
    sete: 7,
    oito: 8,
    nove: 9,
    dez: 10,
    onze: 11,
    doze: 12,
  } as Record<string, number>)[normalized] || null;
}

function futureCalendarDate(day: number, month: number, year: number | null, today: string) {
  const todayDate = dateAtNoonUtc(today);
  const candidateYear = year || todayDate.getUTCFullYear();
  let candidate = new Date(Date.UTC(candidateYear, month - 1, day, 12));
  if (candidate.getUTCMonth() !== month - 1 || candidate.getUTCDate() !== day) return null;
  if (!year && candidate.toISOString().slice(0, 10) < today) {
    candidate = new Date(Date.UTC(candidateYear + 1, month - 1, day, 12));
  }
  return candidate.toISOString().slice(0, 10);
}

export type AiPublicSchedulingDateRequest =
  | { kind: "none" }
  | { kind: "resolved"; date: string; mode: Exclude<AiPublicSchedulingDateMode, "none">; resetsWeekday: boolean }
  | { kind: "clarify"; proposedDate: string; mode: Exclude<AiPublicSchedulingDateMode, "none">; resetsWeekday: boolean };

export function aiPublicSchedulingDateRequestFromMessage(message: string, now = new Date()): AiPublicSchedulingDateRequest {
  const normalized = normalizeForMatch(message);
  const today = datePartsInSaoPaulo(now);
  const amountPattern = "(\\d{1,3}|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze)";
  const relativeWeeks = normalized.match(new RegExp(`\\b(?:daqui(?:\\s+a)?|em|depois\\s+de)\\s+${amountPattern}\\s+semanas?\\b`));
  if (relativeWeeks) {
    const amount = relativeAmount(relativeWeeks[1]);
    if (amount && amount <= 12) {
      return { kind: "resolved", date: addDays(today, amount * 7), mode: "not_before", resetsWeekday: true };
    }
  }
  const relativeDays = normalized.match(new RegExp(`\\b(?:daqui(?:\\s+a)?|em|depois\\s+de)\\s+${amountPattern}\\s+dias?\\b`));
  if (relativeDays) {
    const amount = relativeAmount(relativeDays[1]);
    if (amount && amount <= AI_PUBLIC_SCHEDULING_LOOKAHEAD_DAYS) {
      return { kind: "resolved", date: addDays(today, amount), mode: "not_before", resetsWeekday: true };
    }
  }
  if (/\b(?:semana\s+que\s+vem|proxima\s+semana)\b/.test(normalized)) {
    return { kind: "resolved", date: nextMonday(today), mode: "not_before", resetsWeekday: true };
  }
  if (/\b(?:mes\s+que\s+vem|proximo\s+mes)\b/.test(normalized)) {
    const date = dateAtNoonUtc(today);
    const firstDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1, 12)).toISOString().slice(0, 10);
    return { kind: "resolved", date: firstBusinessDay(firstDay), mode: "not_before", resetsWeekday: true };
  }
  const explicitDate = normalized.match(/\b(\d{1,2})[\/.](\d{1,2})(?:[\/.](\d{2}|\d{4}))?\b/);
  if (explicitDate) {
    const rawYear = explicitDate[3] ? Number(explicitDate[3]) : null;
    const year = rawYear != null && rawYear < 100 ? 2000 + rawYear : rawYear;
    const date = futureCalendarDate(Number(explicitDate[1]), Number(explicitDate[2]), year, today);
    if (date) {
      const mode = /\b(?:a\s+partir|depois)\b/.test(normalized) ? "not_before" : "exact";
      return { kind: "resolved", date, mode, resetsWeekday: true };
    }
  }
  const dayOfMonth = normalized.match(/\bdia\s+(\d{1,2})\b/);
  if (dayOfMonth) {
    const todayDate = dateAtNoonUtc(today);
    const day = Number(dayOfMonth[1]);
    let month = todayDate.getUTCMonth() + 1;
    let year = todayDate.getUTCFullYear();
    if (day < todayDate.getUTCDate()) {
      month += 1;
      if (month > 12) {
        month = 1;
        year += 1;
      }
    }
    const proposedDate = futureCalendarDate(day, month, year, today);
    if (proposedDate) {
      const mode = /\b(?:a\s+partir|depois)\b/.test(normalized) ? "not_before" : "exact";
      return { kind: "clarify", proposedDate, mode, resetsWeekday: true };
    }
  }
  return { kind: "none" };
}

export function aiPublicSchedulingNotBeforeFromMessage(message: string, now = new Date()) {
  const request = aiPublicSchedulingDateRequestFromMessage(message, now);
  return request.kind === "resolved" ? request.date : null;
}

export function aiPublicSchedulingPreferenceFromMessage(message: string): AiPublicSchedulingPreference {
  if (SATURDAY_PREFERENCE.test(message)) return "saturday";
  if (WEEKDAY_PREFERENCE.test(message)) return "weekday";
  const weekday = aiPublicSchedulingWeekdayFromMessage(message);
  if (weekday != null && weekday !== 6) return "weekday";
  return "unknown";
}

export function aiPublicSchedulingPeriodFromMessage(message: string): AiPublicSchedulingPeriod {
  if (AFTERNOON_PERIOD.test(message)) return "afternoon";
  if (MORNING_PERIOD.test(message)) return "morning";
  if (EVENING_PERIOD.test(message)) return "evening";
  return "unknown";
}

export function aiPublicSchedulingWeekdayFromMessage(message: string): AiPublicSchedulingWeekday | null {
  if (/\bsegunda-feira\b/i.test(message) || /\bsegunda\b(?!\s+(?:op[cç][aã]o|alternativa|hor[aá]rio))/i.test(message)) return 1;
  if (/\bter[cç]a(?:-feira)?\b/i.test(message)) return 2;
  if (/\bquarta(?:-feira)?\b/i.test(message)) return 3;
  if (/\bquinta(?:-feira)?\b/i.test(message)) return 4;
  if (/\bsexta(?:-feira)?\b/i.test(message)) return 5;
  if (/\bs[aá]bado\b/i.test(message)) return 6;
  return null;
}

export function aiPublicSchedulingConsentFromMessage(message: string) {
  return SCHEDULING_CONSENT.test(message.trim());
}

export function aiPublicSchedulingWasOffered(message: string) {
  return SCHEDULING_CONSULTATION_OFFER.test(message);
}

function weekdayLabel(weekday: AiPublicSchedulingWeekday | null) {
  return weekday == null
    ? null
    : ["", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"][weekday];
}

function periodLabel(period: AiPublicSchedulingPeriod) {
  if (period === "morning") return "no período da manhã";
  if (period === "afternoon") return "no período da tarde";
  if (period === "evening") return "no fim do dia";
  return "";
}

function timeFromMessage(message: string) {
  const normalized = normalizeForMatch(message);
  const colon = normalized.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  const hour = normalized.match(/\b([01]?\d|2[0-3])\s*h(?:\s*([0-5]\d))?\b/);
  const bareHour = normalized.match(/^\s*([01]?\d|2[0-3])\s*(?:horas?)?\s*[!?.]*\s*$/);
  const match = colon || hour || bareHour;
  if (!match) return null;
  return `${String(Number(match[1])).padStart(2, "0")}:${String(Number(match[2] || 0)).padStart(2, "0")}`;
}

function ordinalOptionIndex(message: string) {
  const normalized = normalizeForMatch(message);
  const match = normalized.match(ORDINAL_OPTION);
  const ordinal = match?.[1] || match?.[2] || match?.[3];
  if (!ordinal) return null;
  if (["primeira", "primeiro", "1"].includes(ordinal)) return 0;
  if (["segunda", "segundo", "2"].includes(ordinal)) return 1;
  return 2;
}

function isSchedulingQuestion(message: string) {
  const normalized = normalizeForMatch(message);
  return message.includes("?")
    || /\b(?:quais?|quando|tem|ha|existe|consegue)\b.{0,50}\b(?:horarios?|disponibilidade|agenda)\b/.test(normalized);
}

export function aiPublicSchedulingSelectedOfferedSlot(message: string, slots: AiPublicSchedulingSlot[]) {
  const requestedTime = timeFromMessage(message);
  if (requestedTime) return slots.find((slot) => slot.time === requestedTime) || null;
  const optionIndex = ordinalOptionIndex(message);
  return optionIndex == null ? null : slots[optionIndex] || null;
}

export function emptyAiPublicSchedulingState() {
  return emptySchedulingState();
}

export function normalizeAiPublicSchedulingState(value: unknown): AiPublicSchedulingState {
  const fallback = emptySchedulingState();
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const raw = value as Record<string, unknown>;
  const offeredSlots = Array.isArray(raw.offeredSlots)
    ? raw.offeredSlots.map(normalizeSlot).filter((slot): slot is AiPublicSchedulingSlot => slot !== null).slice(0, 2)
    : [];
  const rawReason = raw.reason == null
    ? null
    : normalizedEnum(raw.reason, AI_PUBLIC_SCHEDULING_REASONS, "live_availability");
  return {
    status: normalizedEnum(raw.status, AI_PUBLIC_SCHEDULING_STATUSES, fallback.status),
    preference: normalizedEnum(raw.preference, ["unknown", "weekday", "saturday"], "unknown"),
    period: normalizedEnum(raw.period, ["unknown", "morning", "afternoon", "evening"], "unknown"),
    requestedWeekday: normalizedWeekday(raw.requestedWeekday),
    offeredSlots,
    requestedDate: normalizedDate(raw.requestedDate),
    requestedDateMode: normalizedEnum(raw.requestedDateMode, ["none", "not_before", "exact"], "none"),
    pendingDate: normalizedDate(raw.pendingDate),
    pendingDateMode: normalizedEnum(raw.pendingDateMode, ["none", "not_before", "exact"], "none"),
    requestedTime: normalizedTime(raw.requestedTime),
    offeredDate: normalizedDate(raw.offeredDate),
    offeredTime: normalizedTime(raw.offeredTime),
    confirmedDate: normalizedDate(raw.confirmedDate),
    confirmedTime: normalizedTime(raw.confirmedTime),
    reason: rawReason,
  };
}

function schedulingStateWithAvailability(params: {
  previous: AiPublicSchedulingState;
  preference: AiPublicSchedulingPreference;
  period: AiPublicSchedulingPeriod;
  requestedWeekday: AiPublicSchedulingWeekday | null;
  requestedDate: string | null;
  requestedDateMode: AiPublicSchedulingDateMode;
  availableSlots?: AiPublicSchedulingSlot[];
}) {
  const base = {
    ...params.previous,
    preference: params.preference,
    period: params.period,
    requestedWeekday: params.requestedWeekday,
    requestedDate: params.requestedDate,
    requestedDateMode: params.requestedDateMode,
    pendingDate: null,
    pendingDateMode: "none" as const,
    offeredDate: null,
    offeredTime: null,
    confirmedDate: null,
    confirmedTime: null,
    reason: null,
  };
  if (params.availableSlots === undefined) {
    return { ...base, status: "collecting_period" as const };
  }
  const offeredSlots = params.availableSlots.slice(0, 2);
  if (offeredSlots.length < 2) {
    return {
      ...base,
      status: "collecting_period" as const,
      offeredSlots: [],
      reason: "no_availability" as const,
    };
  }
  return {
    ...base,
    status: "awaiting_confirmation" as const,
    offeredSlots,
    offeredDate: offeredSlots[0].date,
    offeredTime: offeredSlots[0].time,
    reason: "live_availability" as const,
  };
}

function confirmedSchedulingWasRescheduled(previous: AiPublicSchedulingState) {
  return {
    ...emptySchedulingState(),
    status: "declined" as const,
    confirmedDate: previous.confirmedDate,
    confirmedTime: previous.confirmedTime,
    reason: "reschedule_requested" as const,
  };
}

export function resolveAiPublicSchedulingTurn(params: {
  previous: unknown;
  latestClientMessage: string;
  availableSlots?: AiPublicSchedulingSlot[];
  forceScheduling?: boolean;
  now?: Date;
}): AiPublicSchedulingTurn {
  const previous = normalizeAiPublicSchedulingState(params.previous);
  const message = params.latestClientMessage.trim();
  const continuesRescheduling = previous.status === "declined" && previous.reason === "reschedule_requested";
  const active = params.forceScheduling === true
    || !["idle", "declined"].includes(previous.status)
    || continuesRescheduling
    || SCHEDULE_INTENT.test(message)
    || RESCHEDULE_REQUEST.test(message);
  if (!active) return { active: false, state: previous };

  const dateRequest = aiPublicSchedulingDateRequestFromMessage(message, params.now);
  const messagePreference = aiPublicSchedulingPreferenceFromMessage(message);
  const messagePeriod = aiPublicSchedulingPeriodFromMessage(message);
  const requestedWeekday = aiPublicSchedulingWeekdayFromMessage(message);
  const period = messagePeriod === "unknown" ? previous.period : messagePeriod;

  if (previous.status === "confirmed") {
    if (RESCHEDULE_REQUEST.test(message)) {
      const rescheduling = confirmedSchedulingWasRescheduled(previous);
      if (dateRequest.kind === "clarify") {
        return {
          active: true,
          state: {
            ...rescheduling,
            preference: messagePreference,
            period: messagePeriod,
            pendingDate: dateRequest.proposedDate,
            pendingDateMode: dateRequest.mode,
          },
        };
      }
      const requestedDate = dateRequest.kind === "resolved" ? dateRequest.date : null;
      const requestedDateMode = dateRequest.kind === "resolved" ? dateRequest.mode : "none";
      const dateWeekday = requestedDate ? dateAtNoonUtc(requestedDate).getUTCDay() : null;
      const preference = requestedWeekday === 6
        ? "saturday"
        : requestedWeekday != null
          ? "weekday"
          : messagePreference !== "unknown"
            ? messagePreference
            : dateWeekday === 6 ? "saturday" : dateWeekday != null ? "weekday" : "unknown";
      if (preference === "unknown") return { active: true, state: rescheduling };
      if (params.availableSlots === undefined) {
        return {
          active: true,
          state: {
            ...rescheduling,
            preference,
            period: messagePeriod,
            requestedWeekday,
            requestedDate,
            requestedDateMode,
          },
        };
      }
      return {
        active: true,
        state: schedulingStateWithAvailability({
          previous: rescheduling,
          preference,
          period: messagePeriod,
          requestedWeekday,
          requestedDate,
          requestedDateMode,
          availableSlots: params.availableSlots,
        }),
      };
    }
    if (CANCELLATION_REQUEST.test(message)) {
      return {
        active: true,
        state: {
          ...previous,
          status: "declined",
          reason: "cancelled_by_client",
        },
      };
    }
    return { active: true, state: previous };
  }

  if (dateRequest.kind === "clarify") {
    return {
      active: true,
      state: {
        ...previous,
        status: "clarifying_date",
        preference: messagePreference === "unknown" ? previous.preference : messagePreference,
        period,
        pendingDate: dateRequest.proposedDate,
        pendingDateMode: dateRequest.mode,
        reason: null,
      },
    };
  }

  const isReschedulingDateClarification = previous.status === "declined"
    && previous.reason === "reschedule_requested"
    && previous.pendingDate != null;
  if ((previous.status === "clarifying_date" || isReschedulingDateClarification) && dateRequest.kind === "none") {
    if (!aiPublicSchedulingConsentFromMessage(message)) {
      if (NEGATIVE_CONFIRMATION.test(message)) {
        return {
          active: true,
          state: {
            ...previous,
            status: "collecting_period",
            pendingDate: null,
            pendingDateMode: "none",
            reason: null,
          },
        };
      }
      return { active: true, state: previous };
    }
    const confirmedDate = previous.pendingDate;
    const confirmedMode = previous.pendingDateMode === "none" ? "exact" : previous.pendingDateMode;
    if (!confirmedDate) return { active: true, state: previous };
    const dateWeekday = dateAtNoonUtc(confirmedDate).getUTCDay();
    const preference = previous.preference !== "unknown"
      ? previous.preference
      : dateWeekday === 6 ? "saturday" : "weekday";
    return {
      active: true,
      state: schedulingStateWithAvailability({
        previous,
        preference,
        period,
        requestedWeekday: null,
        requestedDate: confirmedDate,
        requestedDateMode: confirmedMode,
        availableSlots: params.availableSlots,
      }),
    };
  }

  const resolvedDate = dateRequest.kind === "resolved" ? dateRequest.date : previous.requestedDate;
  const resolvedDateMode = dateRequest.kind === "resolved" ? dateRequest.mode : previous.requestedDateMode;
  const effectiveRequestedWeekday = requestedWeekday
    ?? (dateRequest.kind === "resolved" && dateRequest.resetsWeekday ? null : previous.requestedWeekday);
  const requestedDateWeekday = resolvedDate ? dateAtNoonUtc(resolvedDate).getUTCDay() : null;
  const preference = effectiveRequestedWeekday === 6
    ? "saturday"
    : effectiveRequestedWeekday != null
      ? "weekday"
      : messagePreference !== "unknown"
        ? messagePreference
        : previous.preference !== "unknown"
          ? previous.preference
          : requestedDateWeekday === 6 ? "saturday" : requestedDateWeekday != null ? "weekday" : "unknown";

  if (previous.status === "awaiting_confirmation") {
    const directlySelectedSlot = aiPublicSchedulingSelectedOfferedSlot(message, previous.offeredSlots);
    const selectedDateMatches = dateRequest.kind === "none"
      || (dateRequest.mode === "exact" && dateRequest.date === directlySelectedSlot?.date);
    const selectedWeekdayMatches = requestedWeekday == null
      || (directlySelectedSlot != null && dateAtNoonUtc(directlySelectedSlot.date).getUTCDay() === requestedWeekday);
    if (directlySelectedSlot && !isSchedulingQuestion(message) && selectedDateMatches && selectedWeekdayMatches) {
      return {
        active: true,
        state: {
          ...previous,
          status: "confirmed",
          confirmedDate: directlySelectedSlot.date,
          confirmedTime: directlySelectedSlot.time,
        },
      };
    }
    const offeredOnRequestedDay = requestedWeekday == null
      ? []
      : previous.offeredSlots.filter((slot) => dateAtNoonUtc(slot.date).getUTCDay() === requestedWeekday);
    const asksForAlternative = ALTERNATIVE_SLOT_REQUEST.test(message)
      || dateRequest.kind === "resolved"
      || (requestedWeekday != null && offeredOnRequestedDay.length === 0);
    if (asksForAlternative) {
      return {
        active: true,
        state: schedulingStateWithAvailability({
          previous,
          preference,
          period,
          requestedWeekday: effectiveRequestedWeekday,
          requestedDate: resolvedDate,
          requestedDateMode: resolvedDateMode,
          availableSlots: params.availableSlots,
        }),
      };
    }
    if (NEGATIVE_CONFIRMATION.test(message)) {
      return { active: true, state: { ...emptySchedulingState(), status: "collecting_period" } };
    }
    return { active: true, state: previous };
  }

  if (preference === "unknown") {
    return {
      active: true,
      state: {
        ...previous,
        status: "collecting_period",
        period,
        requestedWeekday: effectiveRequestedWeekday,
        requestedDate: resolvedDate,
        requestedDateMode: resolvedDateMode,
        reason: null,
      },
    };
  }
  return {
    active: true,
    state: schedulingStateWithAvailability({
      previous,
      preference,
      period,
      requestedWeekday: effectiveRequestedWeekday,
      requestedDate: resolvedDate,
      requestedDateMode: resolvedDateMode,
      availableSlots: params.availableSlots,
    }),
  };
}

export function formatAiPublicSchedulingDate(date: string | null) {
  return date
    ? new Intl.DateTimeFormat("pt-BR", {
        timeZone: "UTC",
        weekday: "long",
        day: "2-digit",
        month: "2-digit",
      }).format(dateAtNoonUtc(date))
    : null;
}

export function buildAiPublicSchedulingMessages(turn: AiPublicSchedulingTurn) {
  const { state } = turn;
  if (!turn.active || state.status === "idle") return null;
  if (state.status === "clarifying_date") {
    return [`Você quis dizer ${formatAiPublicSchedulingDate(state.pendingDate)}?`];
  }
  if (state.status === "collecting_period") {
    const requestedDay = weekdayLabel(state.requestedWeekday);
    const requestedDate = formatAiPublicSchedulingDate(state.requestedDate);
    return [state.reason === "no_availability"
      ? requestedDay
        ? `Não encontrei duas opções livres na ${requestedDay} nos próximos dias. Você prefere tentar outro dia da semana ou sábado?`
        : requestedDate
          ? `Não encontrei duas opções livres a partir de ${requestedDate} nesse período. Você prefere tentar outro período ou outro dia?`
          : "Não encontrei duas opções livres nesse período nos próximos dias. Para sua avaliação, fica melhor durante a semana ou no sábado?"
      : "Para sua avaliação, fica melhor durante a semana ou no sábado?"];
  }
  if (state.status === "awaiting_confirmation") {
    const [first, second] = state.offeredSlots;
    const period = periodLabel(state.period);
    const temporalAcknowledgement = state.requestedDate
      ? state.requestedDateMode === "exact"
        ? `Consultei a agenda para ${formatAiPublicSchedulingDate(state.requestedDate)} e `
        : `Sem problema. Consultei a agenda a partir de ${formatAiPublicSchedulingDate(state.requestedDate)} e `
      : "Consultei aqui e ";
    if (first.date === second.date) {
      return [`${temporalAcknowledgement}${period ? `${period} ` : ""}tenho disponibilidade ${formatAiPublicSchedulingDate(first.date)}, às ${first.time} e às ${second.time}.\n\nQual desses horários ficaria melhor para você?`];
    }
    return [`${temporalAcknowledgement}${period ? `${period} ` : ""}tenho estas disponibilidades:\n\n- ${formatAiPublicSchedulingDate(first.date)}, às ${first.time}\n- ${formatAiPublicSchedulingDate(second.date)}, às ${second.time}\n\nQual desses horários ficaria melhor para você?`];
  }
  if (state.status === "confirmed") {
    const date = formatAiPublicSchedulingDate(state.confirmedDate);
    return [`Nesta simulação, registraríamos sua preferência para ${date}, às ${state.confirmedTime}. Nenhuma agenda real foi alterada; a equipe ainda confirma o horário.`];
  }
  if (state.status === "declined") {
    if (state.reason === "cancelled_by_client") {
      return ["Certo. A preferência foi cancelada somente nesta simulação. Nenhuma agenda real foi alterada."];
    }
    if (state.reason === "reschedule_requested" && state.pendingDate) {
      return [`Você quis dizer ${formatAiPublicSchedulingDate(state.pendingDate)}?`];
    }
    if (state.reason === "reschedule_requested") {
      return ["Sem problema. A preferência anterior foi descartada somente nesta simulação. Para buscar novas opções, fica melhor durante a semana ou no sábado?"];
    }
  }
  return ["Para sua avaliação, fica melhor durante a semana ou no sábado?"];
}

export function aiPublicSchedulingContractForPrompt(turn: AiPublicSchedulingTurn) {
  return {
    version: "public-scheduling-v4",
    simulationOnly: true,
    liveAvailabilityReadOnly: true,
    timezone: AI_PUBLIC_SCHEDULING_TIMEZONE,
    evaluationDurationMinutes: AI_PUBLIC_SCHEDULING_SLOT_MINUTES,
    active: turn.active,
    state: turn.state,
    display: {
      offeredSlots: turn.state.offeredSlots.map((slot) => ({
        date: formatAiPublicSchedulingDate(slot.date),
        time: slot.time,
      })),
      confirmedDate: formatAiPublicSchedulingDate(turn.state.confirmedDate),
    },
    rules: [
      "A disponibilidade foi consultada somente para leitura no calendário real de avaliações da unidade.",
      "Use exclusivamente os dois horários em state.offeredSlots; nunca invente ou consulte outros horários.",
      "requestedDateMode=not_before define o inicio da busca; requestedDateMode=exact restringe a busca somente aquela data.",
      "Uma pergunta, pedido de outro dia ou nova restricao nunca confirma um horario. Confirme somente uma escolha inequivoca de um horario oferecido.",
      "Em clarifying_date, confirme o dia e o mes antes de consultar a agenda.",
      "Depois de confirmed, cancelar encerra a preferencia simulada e remarcar inicia uma nova busca sem alterar agenda real.",
      "A escolha do cliente é uma preferência de teste, não cria, bloqueia ou confirma um agendamento real.",
      "confirmed: diga explicitamente que a agenda real não foi alterada e que a equipe ainda confirma o horário.",
    ],
  };
}
