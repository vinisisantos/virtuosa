export const AI_WHATSAPP_CANARY_BARRIGA_VERSION = "whatsapp-canary-barriga-v1";

export type AiWhatsAppCanaryBarrigaStage =
  | "welcome"
  | "ask_region"
  | "ask_experience"
  | "ask_day_type"
  | "offer_slots"
  | "scheduled";

export type AiWhatsAppCanaryBarrigaState = {
  version: typeof AI_WHATSAPP_CANARY_BARRIGA_VERSION;
  stage: AiWhatsAppCanaryBarrigaStage;
  regions: string[];
  experience: "first_time" | "previous" | null;
  offeredDate: string | null;
  offeredTimes: string[];
  selectedTime: string | null;
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
    turnCount: 0,
  };
}

export function isAiWhatsAppCanaryBarrigaState(value: unknown): value is AiWhatsAppCanaryBarrigaState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const state = value as Partial<AiWhatsAppCanaryBarrigaState>;
  return state.version === AI_WHATSAPP_CANARY_BARRIGA_VERSION
    && ["welcome", "ask_region", "ask_experience", "ask_day_type", "offer_slots", "scheduled"].includes(String(state.stage))
    && Array.isArray(state.regions)
    && Array.isArray(state.offeredTimes);
}

function inferredStage(messages: ConversationMessage[]): AiWhatsAppCanaryBarrigaStage {
  const assistantMessages = messages
    .filter((message) => message.role === "assistant")
    .map((message) => normalized(message.content))
    .reverse();
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
  if (isAiWhatsAppCanaryBarrigaState(value)) return structuredClone(value);
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

function nextWeekday(now: Date, weekday: 1 | 6) {
  const date = dateAtNoonUtc(saoPauloDate(now));
  let days = (weekday - date.getUTCDay() + 7) % 7;
  if (days === 0) days = 7;
  date.setUTCDate(date.getUTCDate() + days);
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
    return { date: nextWeekday(now, 6), times: ["10:00", "12:00"] };
  }
  if (/\bsemana\b|\bsegunda(?:-feira)?\b|\bterca(?:-feira)?\b|\bquarta(?:-feira)?\b|\bquinta(?:-feira)?\b|\bsexta(?:-feira)?\b/.test(text)) {
    return { date: nextWeekday(now, 1), times: ["16:00", "18:00"] };
  }
  return null;
}

function selectedTime(message: string, offeredTimes: string[]) {
  const text = normalized(message);
  return offeredTimes.find((time) => {
    const hour = Number(time.slice(0, 2));
    return new RegExp(`(?:^|\\D)${hour}(?:\\s*(?:h|horas?)|:00)?(?![:\\d])`).test(text);
  }) || null;
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
    const [firstTime, secondTime] = offer.times;
    const firstHour = Number(firstTime.slice(0, 2));
    const secondHour = Number(secondTime.slice(0, 2));
    return scriptedTurn(
      withTurn(state, {
        stage: "offer_slots",
        offeredDate: offer.date,
        offeredTimes: offer.times,
      }),
      [
        `Perfeito. Tenho disponibilidade na *${weekdayLabel(offer.date)} (${formattedDate(offer.date)})* às *${firstHour}h* ou às *${secondHour}h*.\n\nQual desses horários fica melhor para você?`,
      ],
      "offer_simulated_slots",
      ["whatsapp_canary_simulated_slots"],
    );
  }

  if (state.stage === "offer_slots" && state.offeredDate) {
    const time = selectedTime(message, state.offeredTimes);
    if (!time) {
      return scriptedTurn(
        withTurn(state, {}),
        [`Qual desses horários fica melhor para você: *${Number(state.offeredTimes[0]?.slice(0, 2))}h* ou *${Number(state.offeredTimes[1]?.slice(0, 2))}h*?`],
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

  if (state.stage === "scheduled") {
    return scriptedTurn(
      withTurn(state, {}),
      ["Combinado! Se quiser começar um novo teste, envie o comando {{reiniciar}}."],
      "already_scheduled",
    );
  }

  return null;
}
