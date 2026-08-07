export const AI_WHATSAPP_CANARY_BARRIGA_VERSION = "whatsapp-canary-barriga-v1";

export type AiWhatsAppCanaryBarrigaStage =
  | "welcome"
  | "ask_region"
  | "ask_experience"
  | "ask_day_type"
  | "offer_slots"
  | "ask_availability"
  | "scheduled";

export type AiWhatsAppCanaryBarrigaState = {
  version: typeof AI_WHATSAPP_CANARY_BARRIGA_VERSION;
  stage: AiWhatsAppCanaryBarrigaStage;
  regions: string[];
  experience: "first_time" | "previous" | null;
  offeredDate: string | null;
  offeredTimes: string[];
  selectedTime: string | null;
  schedulePreference: "weekday" | "saturday" | null;
  scheduleRejections: number;
  rejectedDates: string[];
  turnCount: number;
};

export type AiWhatsAppCanaryBarrigaTurn = {
  state: AiWhatsAppCanaryBarrigaState;
  messages: string[];
  action: string;
  guardrailFlags: string[];
};

type ConversationMessage = {
  role: "assistant" | "client";
  content: string;
};

const ADDRESS = "Rua Eloy Cândido Lopes, 61 — Centro, Osasco";
const KNOWLEDGE_QUESTION = /\?|como funciona|o que (?:inclui|vem)|protocolo|procedimento|tratamento|sess[oõ]es|valor|pre[cç]o|pagamento|resultado|d[oó]i|contraindica/i;
const CAMPAIGN_INTEREST = /barriga\s+trincada|tenho\s+interesse|estou\s+interessad[oa]|vi\s+(?:o|a)\s+an[uú]ncio/i;
const SCHEDULE_REJECTION = /\b(?:nao posso|nao consigo|nao da|nao tenho disponibilidade|indisponivel|outra data|outro dia|outro horario|outros horarios|esses horarios nao|nenhum desses|nenhum horario)\b/i;
const AVAILABILITY_REQUEST = "Sem problemas! Para conseguirmos encontrar um horário que fique melhor para você, me conta: *qual dia e horário você teria disponibilidade para vir até a clínica?* 🌸\n\nAssim verifico a melhor opção para a sua avaliação. ✨";

function normalized(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function emptyState(stage: AiWhatsAppCanaryBarrigaStage = "welcome"): AiWhatsAppCanaryBarrigaState {
  return {
    version: AI_WHATSAPP_CANARY_BARRIGA_VERSION,
    stage,
    regions: [],
    experience: null,
    offeredDate: null,
    offeredTimes: [],
    selectedTime: null,
    schedulePreference: null,
    scheduleRejections: 0,
    rejectedDates: [],
    turnCount: 0,
  };
}

export function isAiWhatsAppCanaryBarrigaState(value: unknown): value is AiWhatsAppCanaryBarrigaState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const state = value as Partial<AiWhatsAppCanaryBarrigaState>;
  return state.version === AI_WHATSAPP_CANARY_BARRIGA_VERSION
    && ["welcome", "ask_region", "ask_experience", "ask_day_type", "offer_slots", "ask_availability", "scheduled"].includes(String(state.stage))
    && Array.isArray(state.regions)
    && Array.isArray(state.offeredTimes);
}

function inferredStage(messages: ConversationMessage[]): AiWhatsAppCanaryBarrigaStage {
  const assistantMessages = messages
    .filter((message) => message.role === "assistant")
    .map((message) => normalized(message.content))
    .reverse();
  if (assistantMessages.some((message) => /qual dia e horario voce teria disponibilidade/.test(message))) return "ask_availability";
  if (assistantMessages.some((message) => /qual desses horarios fica melhor/.test(message))) return "offer_slots";
  if (assistantMessages.some((message) => /durante a semana.*aos sabados/.test(message))) return "ask_day_type";
  if (assistantMessages.some((message) => /ja fez algum tratamento para essa regiao antes/.test(message))) return "ask_experience";
  if (assistantMessages.some((message) => /o que mais te incomoda hoje/.test(message))) return "ask_region";
  return "welcome";
}

export function normalizeAiWhatsAppCanaryBarrigaState(
  value: unknown,
  recentMessages: ConversationMessage[] = [],
) {
  if (isAiWhatsAppCanaryBarrigaState(value)) {
    const state = structuredClone(value);
    return {
      ...emptyState(state.stage),
      ...state,
      schedulePreference: state.schedulePreference === "weekday" || state.schedulePreference === "saturday"
        ? state.schedulePreference
        : null,
      scheduleRejections: Number.isInteger(state.scheduleRejections) && state.scheduleRejections >= 0
        ? state.scheduleRejections
        : 0,
      rejectedDates: Array.isArray(state.rejectedDates)
        ? state.rejectedDates.filter((date): date is string => typeof date === "string")
        : [],
    };
  }
  return emptyState(inferredStage(recentMessages));
}

function withTurn(
  state: AiWhatsAppCanaryBarrigaState,
  updates: Partial<AiWhatsAppCanaryBarrigaState>,
) {
  return {
    ...state,
    ...updates,
    turnCount: state.turnCount + 1,
  } satisfies AiWhatsAppCanaryBarrigaState;
}

function firstName(value?: string | null) {
  const compact = String(value || "")
    .replace(/[^\p{L}\p{M}' -]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return compact.split(" ")[0]?.slice(0, 40) || null;
}

function regionNames(message: string) {
  const text = normalized(message).replace(/barriga\s+trincada/g, "");
  const regions = new Set<string>();
  if (/\b(?:abdomen|abdominal|barriga|pochete)\b/.test(text)) regions.add("abdômen");
  if (/\bflancos?\b|\blaterais?\b/.test(text)) regions.add("flancos");
  if (/\b(?:costas|dorsal)\b/.test(text)) regions.add("costas");
  if (/\b(?:bracos?|culote|coxas?|gluteos?)\b/.test(text)) regions.add("outra região");
  if (/\boutra\s+(?:regiao|area)\b/.test(text)) regions.add("outra região");
  return [...regions];
}

function experienceAnswer(message: string) {
  const text = normalized(message);
  if (/\bnao (?:e|eh|seria) (?:(?:a )?minha |a )?primeira vez\b|\bja\b|\bsim\b|\bfiz\b|\brealizei\b|\btenho experiencia\b/.test(text)) {
    return "previous" as const;
  }
  if (/\bprimeira vez\b|\bnunca\b|\bjamais\b|\bainda nao\b|^nao[.!]?$/.test(text)) {
    return "first_time" as const;
  }
  return null;
}

function saoPauloDate(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function dateAtNoonUtc(value: string) {
  return new Date(`${value}T12:00:00.000Z`);
}

function nextWeekday(now: Date, weekday: 1 | 2 | 3 | 4 | 5 | 6) {
  const date = dateAtNoonUtc(saoPauloDate(now));
  let days = (weekday - date.getUTCDay() + 7) % 7;
  if (days === 0) days = 7;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function nextDateAfter(value: string, preference: "weekday" | "saturday") {
  const date = dateAtNoonUtc(value);
  if (preference === "saturday") {
    date.setUTCDate(date.getUTCDate() + 7);
    return date.toISOString().slice(0, 10);
  }
  do {
    date.setUTCDate(date.getUTCDate() + 1);
  } while (date.getUTCDay() === 0 || date.getUTCDay() === 6);
  return date.toISOString().slice(0, 10);
}

function formattedDate(value: string) {
  const [, month, day] = value.split("-");
  return `${day}/${month}`;
}

function weekdayLabel(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", weekday: "long" })
    .format(dateAtNoonUtc(value));
}

function offeredSchedule(message: string, now: Date) {
  const text = normalized(message);
  if (/\bsabados?\b/.test(text)) {
    return { date: nextWeekday(now, 6), times: ["10:00", "12:00"], preference: "saturday" as const };
  }
  if (/\bsemana\b|\bsegunda(?:-feira)?\b|\bterca(?:-feira)?\b|\bquarta(?:-feira)?\b|\bquinta(?:-feira)?\b|\bsexta(?:-feira)?\b/.test(text)) {
    return { date: nextWeekday(now, 1), times: ["16:00", "18:00"], preference: "weekday" as const };
  }
  return null;
}

function requestedWeekday(message: string) {
  const text = normalized(message);
  const weekdays = [
    { pattern: /\bsegunda(?:-feira)?\b/, value: 1 as const },
    { pattern: /\bterca(?:-feira)?\b/, value: 2 as const },
    { pattern: /\bquarta(?:-feira)?\b/, value: 3 as const },
    { pattern: /\bquinta(?:-feira)?\b/, value: 4 as const },
    { pattern: /\bsexta(?:-feira)?\b/, value: 5 as const },
    { pattern: /\bsabado\b/, value: 6 as const },
  ];
  return weekdays.find((weekday) => weekday.pattern.test(text))?.value || null;
}

function requestedTimes(message: string) {
  const text = normalized(message);
  if (/\bmanha\b/.test(text)) return ["10:00", "12:00"];
  if (/\btarde\b|\bfim do dia\b/.test(text)) return ["16:00", "18:00"];
  const withPreposition = text.match(/\bas\s+([01]?\d|2[0-3])(?:(?::|h)([0-5]\d)?)?\b/);
  const withHourSuffix = text.match(/\b([01]?\d|2[0-3])h([0-5]\d)?\b/);
  const match = withPreposition || withHourSuffix;
  if (!match) return [];
  const hour = Number(match[1]);
  const minutes = Number(match[2] || "0");
  return [`${String(hour).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`];
}

function requestedSchedule(message: string, now: Date) {
  const weekday = requestedWeekday(message);
  const times = requestedTimes(message);
  if (!weekday || times.length === 0) return null;
  return {
    date: nextWeekday(now, weekday),
    times,
    preference: weekday === 6 ? "saturday" as const : "weekday" as const,
  };
}

function inferredSchedulePreference(state: AiWhatsAppCanaryBarrigaState) {
  if (state.schedulePreference) return state.schedulePreference;
  return state.offeredDate && dateAtNoonUtc(state.offeredDate).getUTCDay() === 6
    ? "saturday" as const
    : "weekday" as const;
}

function offerMessage(date: string, times: string[], introduction: string) {
  const hours = times.map((time) => `*${Number(time.slice(0, 2))}h*`);
  const availability = hours.length === 1
    ? `às ${hours[0]}`
    : `às ${hours[0]} ou às ${hours[1]}`;
  const question = hours.length === 1
    ? "Esse horário fica bom para você?"
    : "Qual desses horários fica melhor para você?";
  return `${introduction} *${weekdayLabel(date)} (${formattedDate(date)})* ${availability}.\n\n${question}`;
}

function scheduleRejection(message: string) {
  return SCHEDULE_REJECTION.test(normalized(message));
}

function selectedTime(message: string, offeredTimes: string[]) {
  const text = normalized(message);
  return offeredTimes.find((time) => {
    const hour = Number(time.slice(0, 2));
    return new RegExp(`(?:^|\\D)${hour}(?:\\s*(?:h|horas?)|:00)?(?![:\\d])`).test(text);
  }) || null;
}

function acceptsSingleSlot(message: string) {
  return /^(?:sim|pode ser|confirmo|esse horario|esse fica bom|perfeito|combinado)[.! ]*$/i.test(normalized(message));
}

function clarifySlotMessage(times: string[]) {
  const hours = times.map((time) => `*${Number(time.slice(0, 2))}h*`);
  if (hours.length === 1) return `Esse horário fica bom para você: ${hours[0]}?`;
  return `Qual desses horários fica melhor para você: ${hours[0]} ou ${hours[1]}?`;
}

function scriptedTurn(
  state: AiWhatsAppCanaryBarrigaState,
  messages: string[],
  action: string,
  extraFlags: string[] = [],
): AiWhatsAppCanaryBarrigaTurn {
  return {
    state,
    messages,
    action,
    guardrailFlags: [
      "whatsapp_canary_barriga_scripted",
      "whatsapp_canary_private_target_only",
      "whatsapp_canary_no_real_booking",
      ...extraFlags,
    ],
  };
}

export function resolveAiWhatsAppCanaryBarrigaTurn(params: {
  state: unknown;
  latestClientMessage: string;
  recentMessages?: ConversationMessage[];
  contactName?: string | null;
  now?: Date;
}): AiWhatsAppCanaryBarrigaTurn | null {
  const message = params.latestClientMessage.trim();
  if (!message) return null;
  const recentMessages = params.recentMessages || [];
  const state = normalizeAiWhatsAppCanaryBarrigaState(params.state, recentMessages);
  const now = params.now || new Date();

  if (state.stage === "welcome") {
    const name = firstName(params.contactName);
    const greeting = name ? `Olá, *${name}*, tudo bem? ☀️🌸` : "Olá, tudo bem? ☀️🌸";
    return scriptedTurn(
      withTurn(state, { stage: "ask_region" }),
      [
        `${greeting}\n\nMe chamo *Alice*, sou atendente da *Clínica Virtuosa Osasco*. Seja muito bem-vinda! 💗✨`,
        "Vi que você demonstrou interesse no *Barriga Trincada*, nosso protocolo com foco na redução da gordura localizada. ✨\n\nMe conta: o que mais te incomoda hoje? Abdômen, flancos, costas ou outra região? 😊",
      ],
      "welcome_and_ask_region",
    );
  }

  if (state.stage === "ask_region") {
    if (CAMPAIGN_INTEREST.test(message) && regionNames(message).length === 0) {
      return scriptedTurn(
        withTurn(state, {}),
        ["Me conta: o que mais te incomoda hoje? Abdômen, flancos, costas ou outra região? 😊"],
        "repeat_region_question_after_campaign_interest",
      );
    }
    const regions = regionNames(message);
    if (regions.length === 0) {
      if (KNOWLEDGE_QUESTION.test(message)) return null;
      return scriptedTurn(
        withTurn(state, {}),
        ["Para eu te orientar melhor, qual região mais te incomoda hoje: abdômen, flancos, costas ou outra região? 😊"],
        "clarify_region",
      );
    }
    const acknowledgement = regions.length > 1
      ? "Perfeito! É possível tratar mais de uma região no mesmo protocolo. ✨\n\nDurante a avaliação, nossa especialista irá definir a quantidade de sessões ideal para alcançar o melhor resultado para você."
      : "Perfeito! Esse protocolo foi desenvolvido justamente para tratar essa região.";
    return scriptedTurn(
      withTurn(state, { stage: "ask_experience", regions }),
      [acknowledgement, "Você já fez algum tratamento para essa região antes?"],
      regions.length > 1 ? "acknowledge_multiple_regions" : "acknowledge_single_region",
    );
  }

  if (state.stage === "ask_experience") {
    const experience = experienceAnswer(message);
    if (!experience) {
      if (KNOWLEDGE_QUESTION.test(message)) return null;
      return scriptedTurn(
        withTurn(state, {}),
        ["Você já fez algum tratamento para essa região antes ou será a primeira vez?"],
        "clarify_experience",
      );
    }
    const acknowledgement = experience === "first_time"
      ? "Ah, que legal!\n\nSerá um prazer para nós da *Clínica Virtuosa* fazer parte da sua transformação e acompanhar você durante todo esse processo. ✨💗"
      : "Entendi!\n\nIsso ajuda bastante, porque nossa especialista poderá avaliar o tratamento que você já realizou e indicar a melhor estratégia para alcançar o resultado que você busca. ✨💗";
    return scriptedTurn(
      withTurn(state, { stage: "ask_day_type", experience }),
      [
        acknowledgement,
        "O próximo passo é agendarmos uma avaliação presencial. ✨\n\nAssim, nossa especialista poderá entender melhor os seus objetivos, avaliar a região e montar um plano de tratamento totalmente personalizado para você. 💗\n\nPara você, qual costuma ser o melhor período para agendar: *durante a semana* ou *aos sábados*? 😊",
      ],
      experience === "first_time" ? "welcome_first_experience" : "acknowledge_previous_experience",
    );
  }

  if (state.stage === "ask_day_type") {
    const offer = offeredSchedule(message, now);
    if (!offer) {
      if (KNOWLEDGE_QUESTION.test(message)) return null;
      return scriptedTurn(
        withTurn(state, {}),
        ["Para você fica melhor durante a semana ou aos sábados? 😊"],
        "clarify_day_type",
      );
    }
    return scriptedTurn(
      withTurn(state, {
        stage: "offer_slots",
        offeredDate: offer.date,
        offeredTimes: offer.times,
        schedulePreference: offer.preference,
        scheduleRejections: 0,
        rejectedDates: [],
      }),
      [
        offerMessage(offer.date, offer.times, "Perfeito. Tenho disponibilidade na"),
      ],
      "offer_simulated_slots",
      ["whatsapp_canary_simulated_slots"],
    );
  }

  if (state.stage === "offer_slots" && state.offeredDate) {
    if (scheduleRejection(message)) {
      const scheduleRejections = state.scheduleRejections + 1;
      const rejectedDates = [...state.rejectedDates, state.offeredDate];
      if (scheduleRejections >= 2) {
        return scriptedTurn(
          withTurn(state, {
            stage: "ask_availability",
            scheduleRejections,
            rejectedDates,
          }),
          [AVAILABILITY_REQUEST],
          "ask_lead_availability_after_rejections",
          ["whatsapp_canary_schedule_objection"],
        );
      }
      const alternativeDate = nextDateAfter(state.offeredDate, inferredSchedulePreference(state));
      return scriptedTurn(
        withTurn(state, {
          offeredDate: alternativeDate,
          scheduleRejections,
          rejectedDates,
        }),
        [offerMessage(alternativeDate, state.offeredTimes, "Sem problemas! Tenho outra disponibilidade na")],
        "offer_alternative_simulated_date",
        ["whatsapp_canary_schedule_objection", "whatsapp_canary_simulated_slots"],
      );
    }
    const time = selectedTime(message, state.offeredTimes)
      || (state.offeredTimes.length === 1 && acceptsSingleSlot(message) ? state.offeredTimes[0] : null);
    if (!time) {
      return scriptedTurn(
        withTurn(state, {}),
        [clarifySlotMessage(state.offeredTimes)],
        "clarify_simulated_slot",
      );
    }
    const hour = Number(time.slice(0, 2));
    return scriptedTurn(
      withTurn(state, { stage: "scheduled", selectedTime: time }),
      [
        `Perfeito! 💗\n\nSua avaliação ficou agendada para *${weekdayLabel(state.offeredDate)}*, *${formattedDate(state.offeredDate)}*, às *${hour}h*. 🗓️✨\n\n📍 ${ADDRESS}\n\nEstaremos esperando por você. Será um prazer receber você na *Clínica Virtuosa*! 🌸`,
      ],
      "confirm_simulated_slot",
      ["whatsapp_canary_simulated_confirmation"],
    );
  }

  if (state.stage === "ask_availability") {
    const requested = requestedSchedule(message, now);
    if (requested) {
      return scriptedTurn(
        withTurn(state, {
          stage: "offer_slots",
          offeredDate: requested.date,
          offeredTimes: requested.times,
          schedulePreference: requested.preference,
        }),
        [offerMessage(requested.date, requested.times, "Perfeito! Tenho disponibilidade na")],
        "offer_requested_simulated_availability",
        ["whatsapp_canary_schedule_objection", "whatsapp_canary_simulated_slots"],
      );
    }
    return scriptedTurn(
      withTurn(state, {}),
      [AVAILABILITY_REQUEST],
      "repeat_availability_request",
      ["whatsapp_canary_schedule_objection"],
    );
  }

  if (state.stage === "scheduled") {
    return scriptedTurn(
      withTurn(state, {}),
      ["Combinado! Se quiser começar um novo teste, envie a palavra reset."],
      "already_scheduled",
    );
  }

  return null;
}
