export const AI_PUBLIC_SCHEDULING_TIMEZONE = "America/Sao_Paulo";
export const AI_PUBLIC_SCHEDULING_LOOKAHEAD_DAYS = 90;
export const AI_PUBLIC_SCHEDULING_SEARCH_WINDOW_DAYS = 21;
export const AI_PUBLIC_SCHEDULING_SLOT_MINUTES = 60;

export const AI_PUBLIC_SCHEDULING_STATUSES = [
  "idle",
  "collecting_period",
  "awaiting_confirmation",
  "confirmed",
  "declined",
] as const;

export const AI_PUBLIC_SCHEDULING_REASONS = [
  "live_availability",
  "no_availability",
] as const;

export type AiPublicSchedulingStatus = (typeof AI_PUBLIC_SCHEDULING_STATUSES)[number];
export type AiPublicSchedulingReason = (typeof AI_PUBLIC_SCHEDULING_REASONS)[number];
export type AiPublicSchedulingPreference = "unknown" | "weekday" | "saturday";
export type AiPublicSchedulingPeriod = "unknown" | "morning" | "afternoon" | "evening";
export type AiPublicSchedulingWeekday = 1 | 2 | 3 | 4 | 5 | 6;

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
const WEEKDAY_PREFERENCE = /\b(?:durante\s+a\s+semana|na\s+semana|semana|segunda|ter[cç]a|quarta|quinta|sexta)\b/i;
const SATURDAY_PREFERENCE = /\b(?:s[aá]bado|fim\s+de\s+semana)\b/i;
const FIRST_OPTION = /\b(?:primeir[ao]|1(?:a|ª|o|º)?\s*(?:op[cç][aã]o|hor[aá]rio)?)\b/i;
const SECOND_OPTION = /\b(?:segund[ao]|2(?:a|ª|o|º)?\s*(?:op[cç][aã]o|hor[aá]rio)?)\b/i;
const NEGATIVE_CONFIRMATION = /^(?:n[aã]o|nenhum|outro|outro\s+hor[aá]rio|prefiro\s+outro)[!,.\s]*$/i;
const ALTERNATIVE_SLOT_REQUEST = /\b(?:outro\s+(?:dia|hor[aá]rio)|mais\s+(?:cedo|tarde)|n[aã]o\s+tem|tem\s+outro|prefiro\s+outro|nenhum\s+desses)\b/i;
const SCHEDULING_CONSENT = /^(?:sim|sim\s+por\s+favor|pode|pode\s+sim|quero|quero\s+sim|vamos|claro|ok|beleza)[!,.\s]*$/i;
const SCHEDULING_CONSULTATION_OFFER = /\b(?:posso|podemos|quer\s+que\s+eu)\b.{0,70}\b(?:consultar|verificar|ver)\b.{0,50}\b(?:hor[aá]rios?|disponibilidade|agenda)\b|\b(?:seguir|avan[cç]ar)\b.{0,40}\b(?:agendamento|agenda)\b/i;
const MORNING_PERIOD = /\b(?:manh[aã]|cedo)\b/i;
const AFTERNOON_PERIOD = /\b(?:tarde|depois\s+do\s+almo[cç]o)\b/i;
const EVENING_PERIOD = /\b(?:fim\s+do\s+dia|noite|final\s+do\s+dia)\b/i;

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

export function aiPublicSchedulingNotBeforeFromMessage(message: string, now = new Date()) {
  const normalized = normalizeForMatch(message);
  const today = datePartsInSaoPaulo(now);
  const amountPattern = "(\\d{1,3}|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze)";
  const relativeWeeks = normalized.match(new RegExp(`\\b(?:daqui(?:\\s+a)?|em|depois\\s+de)\\s+${amountPattern}\\s+semanas?\\b`));
  if (relativeWeeks) {
    const amount = relativeAmount(relativeWeeks[1]);
    if (amount && amount <= 12) return addDays(today, amount * 7);
  }
  const relativeDays = normalized.match(new RegExp(`\\b(?:daqui(?:\\s+a)?|em|depois\\s+de)\\s+${amountPattern}\\s+dias?\\b`));
  if (relativeDays) {
    const amount = relativeAmount(relativeDays[1]);
    if (amount && amount <= AI_PUBLIC_SCHEDULING_LOOKAHEAD_DAYS) return addDays(today, amount);
  }
  if (/\b(?:semana\s+que\s+vem|proxima\s+semana)\b/.test(normalized)) return addDays(today, 7);
  if (/\b(?:mes\s+que\s+vem|proximo\s+mes)\b/.test(normalized)) {
    const date = dateAtNoonUtc(today);
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1, 12)).toISOString().slice(0, 10);
  }
  const explicitDate = normalized.match(/\b(\d{1,2})[\/.](\d{1,2})(?:[\/.](\d{2}|\d{4}))?\b/);
  if (explicitDate) {
    const rawYear = explicitDate[3] ? Number(explicitDate[3]) : null;
    const year = rawYear != null && rawYear < 100 ? 2000 + rawYear : rawYear;
    return futureCalendarDate(Number(explicitDate[1]), Number(explicitDate[2]), year, today);
  }
  const dayOfMonth = normalized.match(/\b(?:a\s+partir\s+d[eo]|depois\s+d[eo]|so\s+(?:consigo|posso)\s+(?:a\s+partir\s+d[eo]\s+)?)dia\s+(\d{1,2})\b/);
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
    return futureCalendarDate(day, month, year, today);
  }
  return null;
}

export function aiPublicSchedulingPreferenceFromMessage(message: string): AiPublicSchedulingPreference {
  if (SATURDAY_PREFERENCE.test(message)) return "saturday";
  if (WEEKDAY_PREFERENCE.test(message)) return "weekday";
  return "unknown";
}

export function aiPublicSchedulingPeriodFromMessage(message: string): AiPublicSchedulingPeriod {
  if (AFTERNOON_PERIOD.test(message)) return "afternoon";
  if (MORNING_PERIOD.test(message)) return "morning";
  if (EVENING_PERIOD.test(message)) return "evening";
  return "unknown";
}

export function aiPublicSchedulingWeekdayFromMessage(message: string): AiPublicSchedulingWeekday | null {
  if (/\bsegunda(?:-feira)?\b/i.test(message)) return 1;
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

function selectedOfferedSlot(message: string, slots: AiPublicSchedulingSlot[]) {
  const requestedTime = timeFromMessage(message);
  if (requestedTime) return slots.find((slot) => slot.time === requestedTime) || null;
  if (FIRST_OPTION.test(message)) return slots[0] || null;
  if (SECOND_OPTION.test(message)) return slots[1] || null;
  return null;
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
    requestedTime: normalizedTime(raw.requestedTime),
    offeredDate: normalizedDate(raw.offeredDate),
    offeredTime: normalizedTime(raw.offeredTime),
    confirmedDate: normalizedDate(raw.confirmedDate),
    confirmedTime: normalizedTime(raw.confirmedTime),
    reason: rawReason,
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
  const active = params.forceScheduling === true || previous.status !== "idle" || SCHEDULE_INTENT.test(message);
  if (!active) return { active: false, state: previous };

  if (previous.status === "awaiting_confirmation") {
    const requestedWeekday = aiPublicSchedulingWeekdayFromMessage(message);
    const requestedDate = aiPublicSchedulingNotBeforeFromMessage(message, params.now);
    const directlySelectedSlot = selectedOfferedSlot(message, previous.offeredSlots);
    if (directlySelectedSlot && (requestedDate == null || requestedDate === directlySelectedSlot.date)) {
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
      || requestedDate != null
      || (requestedWeekday != null && offeredOnRequestedDay.length === 0);
    if (asksForAlternative) {
      const effectiveRequestedWeekday = requestedWeekday
        ?? (requestedDate != null ? previous.requestedWeekday : null);
      const preference = effectiveRequestedWeekday === 6
        ? "saturday"
        : effectiveRequestedWeekday ? "weekday" : previous.preference;
      const effectiveRequestedDate = requestedDate || previous.requestedDate;
      if (params.availableSlots === undefined) {
        return {
          active: true,
          state: {
            ...previous,
            status: "collecting_period",
            preference,
            requestedWeekday: effectiveRequestedWeekday,
            requestedDate: effectiveRequestedDate,
            offeredDate: null,
            offeredTime: null,
            reason: null,
          },
        };
      }
      const offeredSlots = params.availableSlots.slice(0, 2);
      if (offeredSlots.length < 2) {
        return {
          active: true,
          state: {
            ...previous,
            status: "collecting_period",
            preference,
            requestedWeekday: effectiveRequestedWeekday,
            requestedDate: effectiveRequestedDate,
            offeredSlots: [],
            offeredDate: null,
            offeredTime: null,
            reason: "no_availability",
          },
        };
      }
      return {
        active: true,
        state: {
          ...previous,
          status: "awaiting_confirmation",
          preference,
          requestedWeekday: effectiveRequestedWeekday,
          requestedDate: effectiveRequestedDate,
          offeredSlots,
          offeredDate: offeredSlots[0].date,
          offeredTime: offeredSlots[0].time,
          reason: "live_availability",
        },
      };
    }
    if (NEGATIVE_CONFIRMATION.test(message)) {
      return { active: true, state: { ...emptySchedulingState(), status: "collecting_period" } };
    }
    const selected = selectedOfferedSlot(message, previous.offeredSlots);
    if (selected) {
      return {
        active: true,
        state: {
          ...previous,
          status: "confirmed",
          confirmedDate: selected.date,
          confirmedTime: selected.time,
        },
      };
    }
    return { active: true, state: previous };
  }

  const preference = aiPublicSchedulingPreferenceFromMessage(message) !== "unknown"
    ? aiPublicSchedulingPreferenceFromMessage(message)
    : previous.preference;
  const period = aiPublicSchedulingPeriodFromMessage(message) !== "unknown"
      ? aiPublicSchedulingPeriodFromMessage(message)
      : previous.period;
  const requestedDate = aiPublicSchedulingNotBeforeFromMessage(message, params.now) || previous.requestedDate;
  if (preference === "unknown") {
    return { active: true, state: { ...previous, status: "collecting_period", period, requestedDate, reason: null } };
  }

  if (params.availableSlots === undefined) {
    return { active: true, state: { ...previous, status: "collecting_period", preference, period, requestedDate, reason: null } };
  }
  const offeredSlots = params.availableSlots.slice(0, 2);
  if (offeredSlots.length < 2) {
    return {
      active: true,
      state: {
        ...previous,
        status: "collecting_period",
        preference,
        period,
        requestedDate,
        offeredSlots: [],
        offeredDate: null,
        offeredTime: null,
        reason: "no_availability",
      },
    };
  }
  return {
    active: true,
    state: {
      ...previous,
      status: "awaiting_confirmation",
      preference,
      period,
      requestedWeekday: aiPublicSchedulingWeekdayFromMessage(message),
      requestedDate,
      offeredSlots,
      offeredDate: offeredSlots[0].date,
      offeredTime: offeredSlots[0].time,
      confirmedDate: null,
      confirmedTime: null,
      reason: "live_availability",
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
      }).format(dateAtNoonUtc(date))
    : null;
}

export function buildAiPublicSchedulingMessages(turn: AiPublicSchedulingTurn) {
  const { state } = turn;
  if (!turn.active || state.status === "idle") return null;
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
      ? `Sem problema. Consultei a agenda a partir de ${formatAiPublicSchedulingDate(state.requestedDate)} e `
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
  return ["Para sua avaliação, fica melhor durante a semana ou no sábado?"];
}

export function aiPublicSchedulingContractForPrompt(turn: AiPublicSchedulingTurn) {
  return {
    version: "public-scheduling-v3",
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
      "state.requestedDate e a primeira data em que a pessoa informou conseguir comparecer; nunca ofereca horario anterior a ela.",
      "A escolha do cliente é uma preferência de teste, não cria, bloqueia ou confirma um agendamento real.",
      "confirmed: diga explicitamente que a agenda real não foi alterada e que a equipe ainda confirma o horário.",
    ],
  };
}
