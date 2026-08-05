import type { AiPublicSchedulingState, AiPublicSchedulingWeekday } from "./ai-public-scheduling";

export const AI_PUBLIC_SDR_STATE_VERSION = "public-sdr-v9";

export const AI_PUBLIC_SDR_PHASES = [
  "reception",
  "discovery",
  "qualification",
  "education",
  "objection",
  "conversion",
  "handoff",
  "closed",
  "scheduling",
] as const;

export const AI_PUBLIC_SDR_INTENTS = [
  "greeting",
  "learn",
  "price",
  "result",
  "suitability",
  "safety",
  "goal",
  "location",
  "availability",
  "schedule",
  "specialist",
  "positive_confirmation",
  "negative_response",
  "other",
] as const;

export const AI_PUBLIC_SDR_OBJECTIONS = [
  "none",
  "price",
  "result",
  "pain",
  "time",
  "trust",
  "other",
] as const;

export const AI_PUBLIC_SDR_OBJECTION_STATUSES = [
  "none",
  "identified",
  "addressing",
  "resolved",
  "unresolved",
] as const;

export const AI_PUBLIC_SDR_READINESS = [
  "unknown",
  "exploring",
  "interested",
  "ready",
  "not_now",
] as const;

export const AI_PUBLIC_SDR_LEAD_TEMPERATURES = ["unknown", "cold", "warm", "hot"] as const;

export const AI_PUBLIC_SDR_OUTCOMES = [
  "open",
  "evaluation_offered",
  "handoff_requested",
  "not_now",
  "closed",
  "simulated_evaluation_scheduled",
] as const;

export const AI_PUBLIC_SDR_TOPICS = [
  "campaign_overview",
  "procedure_function",
  "price",
  "result_limits",
  "safety_limits",
  "evaluation",
  "specialist",
] as const;

export const AI_PUBLIC_SDR_NEXT_OBJECTIVES = [
  "welcome",
  "discover_concern",
  "qualify_experience",
  "qualify_experience_satisfaction",
  "understand_negative_experience",
  "clarify_experience_origin",
  "explain_campaign",
  "qualify_need",
  "answer_question",
  "deepen_interest",
  "handle_objection",
  "offer_next_step",
  "await_choice",
  "handoff",
  "close_politely",
  "collect_scheduling_date",
  "collect_scheduling_time",
  "confirm_simulated_slot",
  "complete_simulation",
] as const;

export type AiPublicSdrPhase = (typeof AI_PUBLIC_SDR_PHASES)[number];
export type AiPublicSdrIntent = (typeof AI_PUBLIC_SDR_INTENTS)[number];
export type AiPublicSdrObjection = (typeof AI_PUBLIC_SDR_OBJECTIONS)[number];
export type AiPublicSdrObjectionStatus = (typeof AI_PUBLIC_SDR_OBJECTION_STATUSES)[number];
export type AiPublicSdrReadiness = (typeof AI_PUBLIC_SDR_READINESS)[number];
export type AiPublicSdrLeadTemperature = (typeof AI_PUBLIC_SDR_LEAD_TEMPERATURES)[number];
export type AiPublicSdrOutcome = (typeof AI_PUBLIC_SDR_OUTCOMES)[number];
export type AiPublicSdrTopic = (typeof AI_PUBLIC_SDR_TOPICS)[number];
export type AiPublicSdrNextObjective = (typeof AI_PUBLIC_SDR_NEXT_OBJECTIVES)[number];

export type AiPublicSdrQualification = {
  goalKnown: boolean;
  procedureKnown: boolean;
  unitKnown: boolean;
  timingKnown: boolean;
  availabilityKnown: boolean;
  comprehensiveConcernKnown: boolean;
  previousExperienceKnown: boolean;
  previousExperienceConcernKnown: boolean;
  concernArea: "unknown" | "abdomen" | "flanks" | "back" | "arms" | "glutes" | "culotte" | "thighs" | "face" | "forehead" | "glabella" | "crow_feet" | "lips" | "under_eyes" | "nasolabial_fold" | "chin" | "jawline" | "cheeks" | "other";
  previousExperience: "unknown" | "first_time" | "virtuosa" | "other_clinic" | "previous_unspecified";
  previousExperienceSatisfaction: "unknown" | "positive" | "negative";
  preferredDayType: "unknown" | "weekday" | "saturday";
  preferredPeriod: "unknown" | "morning" | "afternoon" | "evening";
};

export type AiPublicSdrState = {
  version: typeof AI_PUBLIC_SDR_STATE_VERSION;
  phase: AiPublicSdrPhase;
  campaignName: string | null;
  latestIntent: AiPublicSdrIntent;
  activeObjection: AiPublicSdrObjection;
  objectionStatus: AiPublicSdrObjectionStatus;
  readiness: AiPublicSdrReadiness;
  leadTemperature: AiPublicSdrLeadTemperature;
  qualification: AiPublicSdrQualification;
  topicsCovered: AiPublicSdrTopic[];
  nextObjective: AiPublicSdrNextObjective;
  outcome: AiPublicSdrOutcome;
  scheduling: AiPublicSchedulingState;
  turnCount: number;
};

const GREETING_ONLY = /^(?:oi|ol[aá]|oie|opa|bom\s+dia|boa\s+tarde|boa\s+noite)[!,.\s]*$/i;
const PRICE_INTENT = /\b(?:pre[cç]o|valor|custa|custo|quanto|investimento|or[cç]amento|parcela|pagamento)\b/i;
const RESULT_INTENT = /\b(?:resultado|resolve|emagrece|medida|defin(?:e|ir|i[cç][aã]o)|efeito)\b/i;
const SUITABILITY_INTENT = /\b(?:serve\s+para\s+mim|indicado|indica[cç][aã]o|posso\s+fazer|meu\s+caso)\b/i;
const SAFETY_INTENT = /\b(?:d[oó]i|dor|seguro|risco|contraindica|recupera[cç][aã]o|efeito\s+colateral)\b/i;
const SCHEDULE_INTENT = /\b(?:agend|avalia[cç][aã]o|hor[aá]rio|disponibilidade|data)\b/i;
const SPECIALIST_INTENT = /\b(?:especialista|atendente|consultora|pessoa|humano|equipe)\b/i;
const LEARN_INTENT = /\b(?:como\s+funciona|funciona|saber\s+mais|entender|explica|procedimento|protocolo|inclui)\b/i;
const GOAL_INTENT = /\b(?:quero|gostaria|objetivo|interesse|melhorar|reduzir|eliminar|tratar)\b/i;
const LOCATION_INTENT = /\b(?:sou\s+de|moro\s+em|fico\s+em|aqui\s+em|unidade|osasco|sbc|s[ãa]o\s+bernardo|scs|s[ãa]o\s+caetano)\b/i;
const AVAILABILITY_INTENT = /\b(?:de\s+manh[ãa]|[àa]\s+tarde|[àa]\s+noite|fim\s+de\s+semana|s[aá]bado|segunda|ter[cç]a|quarta|quinta|sexta)\b/i;
const POSITIVE_SHORT = /^(?:sim|sim\s+por\s+favor|quero|quero\s+sim|pode|pode\s+sim|pode\s+ser|vamos|claro|perfeito|gostei|tenho\s+interesse|os\s+dois|as\s+duas|ambos|tudo\s+bem|ok|beleza)[!,.\s]*$/i;
const NEGATIVE_SHORT = /^(?:n[aã]o|agora\s+n[aã]o|depois|vou\s+pensar|sem\s+interesse|n[aã]o\s+quero)[!,.\s]*$/i;
const PREVIOUS_EXPERIENCE = /\b(?:primeira\s+vez|nunca\s+(?:fiz|realizei)|j[aá]\s+(?:fiz|realizei)|fiz\s+antes|realizei\s+antes|experi[eê]ncia)\b/i;
const POSITIVE_EXPERIENCE = /\b(?:gostei|adorei|amei|satisfeit[oa]|experi[eê]ncia\s+(?:boa|positiva|[oó]tima)|resultado\s+(?:bom|positivo|[oó]timo)|ficou\s+(?:bom|natural|legal)|foi\s+(?:bom|boa|tranquil[oa]|positiv[oa]|[oó]tim[oa]))\b/i;
const NEGATIVE_EXPERIENCE = /\b(?:n[aã]o\s+gostei|n[aã]o\s+curti|insatisfeit[oa]|experi[eê]ncia\s+(?:ruim|negativa)|resultado\s+(?:ruim|negativo)|ficou\s+(?:ruim|artificial|pesado|travado)|me\s+incomodou|assimetr|durou\s+pouco|n[aã]o\s+durou)\b/i;
const CONCERN_AREAS = [
  ["nasolabial_fold", /\b(?:bigode\s+chin[eê]s|sulco\s+nasolabial)\b/i],
  ["under_eyes", /\b(?:olheiras?|embaixo\s+dos\s+olhos?)\b/i],
  ["crow_feet", /\b(?:p[eé]s?\s+de\s+galinha|linhas?\s+ao\s+redor\s+dos\s+olhos?)\b/i],
  ["glabella", /\b(?:glabela|entre\s+as\s+sobrancelhas?)\b/i],
  ["forehead", /\b(?:testa|linhas?\s+da\s+testa)\b/i],
  ["lips", /\b(?:l[aá]bios?|boca)\b/i],
  ["chin", /\b(?:queixo|mento)\b/i],
  ["jawline", /\b(?:mand[ií]bula|contorno\s+mandibular)\b/i],
  ["cheeks", /\b(?:ma[cç][aã]s?\s+do\s+rosto|malar|bochechas?)\b/i],
  ["abdomen", /\b(?:abd[oô]men|abdominal|barriga)\b/i],
  ["flanks", /\b(?:flancos?|pneuzinhos?|laterais?\s+da\s+barriga)\b/i],
  ["back", /\b(?:costas|dorso)\b/i],
  ["arms", /\b(?:bra[cç]os?)\b/i],
  ["glutes", /\b(?:gl[uú]teos?|bumbum)\b/i],
  ["culotte", /\b(?:culotes?)\b/i],
  ["thighs", /\b(?:coxas?|parte\s+interna\s+das\s+pernas?)\b/i],
  ["face", /\b(?:rosto|face|facial)\b/i],
] as const;
const PRICE_OBJECTION = /\b(?:caro|muito\s+caro|fora\s+do\s+or[cç]amento|n[aã]o\s+consigo\s+pagar)\b/i;
const RESULT_OBJECTION = /\b(?:n[aã]o\s+funciona|medo\s+de\s+n[aã]o\s+funcionar|garantia\s+de\s+resultado)\b/i;
const PAIN_OBJECTION = /\b(?:medo\s+de\s+dor|d[oó]i\s+muito|doloroso)\b/i;
const TIME_OBJECTION = /\b(?:sem\s+tempo|n[aã]o\s+tenho\s+tempo|demora\s+muito)\b/i;
const TRUST_OBJECTION = /\b(?:n[aã]o\s+confio|tenho\s+receio|tenho\s+medo|[ée]\s+seguro\s+mesmo)\b/i;
const COMPREHENSIVE_CONCERN = /^(?:(?:tudo|todos?|todas?)(?!\s+bem)|os\s+dois|as\s+duas|ambos|ambas|todas?\s+as\s+op[cç][oõ]es|um\s+pouco\s+de\s+cada)(?:[\s,!.-]*(?:k+|(?:rs)+|(?:ha)+))*[\s!.,-]*$/i;

export type AiPublicCampaignDiscoveryGuide = {
  track: "body" | "facial" | "general";
  concernQuestion: string;
  concernExamples: string[];
  forbiddenConcernTerms: string[];
  experienceQuestion: string;
  negativeExperienceOptions: string[];
};

const NEGATIVE_EXPERIENCE_OPTIONS = [
  "o resultado ficou muito discreto",
  "ficou artificial",
  "durou menos do que você esperava",
  "não resolveu o que você queria",
  "outro motivo",
];

function normalizedCampaignReference(value?: string | null) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}

export function aiPublicCampaignDiscoveryGuide(campaign?: string | null): AiPublicCampaignDiscoveryGuide {
  const normalized = normalizedCampaignReference(campaign);
  if (/\b(?:botox|toxina)\b/.test(normalized)) {
    return {
      track: "facial",
      concernQuestion: "Qual região mais te incomoda hoje: testa, entre as sobrancelhas, ao redor dos olhos ou outra região?",
      concernExamples: ["testa", "entre as sobrancelhas", "ao redor dos olhos", "outra região"],
      forbiddenConcernTerms: ["abdômen", "flancos", "costas", "braços", "glúteos", "culote", "coxas", "lábios", "olheiras", "bigode chinês", "queixo", "mandíbula", "bochechas"],
      experienceQuestion: "E me diz uma coisa: é a sua primeira vez fazendo Botox ou você já fez antes nessa região?",
      negativeExperienceOptions: [...NEGATIVE_EXPERIENCE_OPTIONS],
    };
  }
  if (/\b(?:preenchimento|rinomodelacao|facial|labial|olheira|bioestimulador)\b/.test(normalized)
    && !/\bgluteos?\b/.test(normalized)) {
    return {
      track: "facial",
      concernQuestion: "Qual região do rosto mais te incomoda hoje: lábios, olheiras, bigode chinês, queixo, contorno ou outra região?",
      concernExamples: ["lábios", "olheiras", "bigode chinês", "queixo", "contorno", "outra região"],
      forbiddenConcernTerms: ["abdômen", "flancos", "costas", "braços", "glúteos", "culote", "coxas"],
      experienceQuestion: "E me diz uma coisa: é a sua primeira vez fazendo um procedimento nessa região ou você já fez antes?",
      negativeExperienceOptions: [...NEGATIVE_EXPERIENCE_OPTIONS],
    };
  }
  if (/\b(?:harmonizacao|preenchimento|modeladora|pump)\b.{0,20}\bgluteos?\b|\bgluteos?\b.{0,20}\b(?:harmonizacao|preenchimento|modeladora|pump)\b/.test(normalized)) {
    return {
      track: "body",
      concernQuestion: "O que mais te incomoda na região dos glúteos: depressões laterais (hip dips), assimetria, falta de volume e projeção ou outro ponto?",
      concernExamples: ["depressões laterais (hip dips)", "assimetria", "falta de volume e projeção", "outro ponto"],
      forbiddenConcernTerms: ["abdômen", "barriga", "flancos", "costas", "braços", "culote", "coxas", "rosto", "testa", "olheiras"],
      experienceQuestion: "E me diz uma coisa: é a sua primeira vez fazendo esse tipo de procedimento nos glúteos ou você já fez antes?",
      negativeExperienceOptions: [...NEGATIVE_EXPERIENCE_OPTIONS],
    };
  }
  if (/\bbarriga\s+trincada\b/.test(normalized)) {
    return {
      track: "body",
      concernQuestion: "O que mais te incomoda na região da barriga hoje: abdômen, flancos ou outro ponto dessa região?",
      concernExamples: ["abdômen", "flancos", "outro ponto da região da barriga"],
      forbiddenConcernTerms: ["costas", "braços", "glúteos", "culote", "coxas", "rosto", "testa", "olheiras", "lábios"],
      experienceQuestion: "E me diz uma coisa: é a sua primeira vez fazendo um procedimento nessa região ou você já fez antes?",
      negativeExperienceOptions: [...NEGATIVE_EXPERIENCE_OPTIONS],
    };
  }
  if (/\b(?:barriga|hyper\s*slim|hyperslim|gordura|corporal|celulite|flacidez|monjifast|crio|lipo|enzima)\b/.test(normalized)) {
    return {
      track: "body",
      concernQuestion: "Qual região do corpo mais te incomoda hoje: abdômen, flancos, costas, braços, glúteos, culote ou outra região?",
      concernExamples: ["abdômen", "flancos", "costas", "braços", "glúteos", "culote", "outra região"],
      forbiddenConcernTerms: ["rosto", "testa", "olheiras", "lábios", "bigode chinês", "queixo", "mandíbula", "bochechas"],
      experienceQuestion: "E me diz uma coisa: é a sua primeira vez fazendo um procedimento nessa região ou você já fez antes?",
      negativeExperienceOptions: [...NEGATIVE_EXPERIENCE_OPTIONS],
    };
  }
  return {
    track: "general",
    concernQuestion: "Qual região ou incômodo você gostaria de cuidar primeiro?",
    concernExamples: ["rosto", "corpo", "outra região"],
    forbiddenConcernTerms: [],
    experienceQuestion: "E me diz uma coisa: é a sua primeira experiência com esse tipo de procedimento ou você já fez antes?",
    negativeExperienceOptions: [...NEGATIVE_EXPERIENCE_OPTIONS],
  };
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && allowed.includes(value as T) ? value as T : fallback;
}

function campaignName(value: unknown) {
  if (typeof value !== "string") return null;
  const compact = value.replace(/\s+/g, " ").trim();
  return compact ? compact.slice(0, 120) : null;
}

function booleanValue(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function schedulingDate(value: unknown) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function schedulingTime(value: unknown) {
  return typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : null;
}

function schedulingWeekday(value: unknown): AiPublicSchedulingWeekday | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 6
    ? value as AiPublicSchedulingWeekday
    : null;
}

function emptyAiPublicSchedulingState(): AiPublicSchedulingState {
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

function normalizeAiPublicSchedulingState(value: unknown): AiPublicSchedulingState {
  const fallback = emptyAiPublicSchedulingState();
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const raw = value as Record<string, unknown>;
  const offeredSlots = Array.isArray(raw.offeredSlots)
    ? raw.offeredSlots.flatMap((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return [];
        const slot = item as Record<string, unknown>;
        const date = schedulingDate(slot.date);
        const time = schedulingTime(slot.time);
        return date && time ? [{ date, time }] : [];
      }).slice(0, 2)
    : [];
  return {
    status: enumValue(raw.status, ["idle", "collecting_period", "clarifying_date", "awaiting_confirmation", "confirmed", "declined"], "idle"),
    preference: enumValue(raw.preference, ["unknown", "weekday", "saturday"], "unknown"),
    period: enumValue(raw.period, ["unknown", "morning", "afternoon", "evening"], "unknown"),
    requestedWeekday: schedulingWeekday(raw.requestedWeekday),
    offeredSlots,
    requestedDate: schedulingDate(raw.requestedDate),
    requestedDateMode: enumValue(raw.requestedDateMode, ["none", "not_before", "exact"], "none"),
    pendingDate: schedulingDate(raw.pendingDate),
    pendingDateMode: enumValue(raw.pendingDateMode, ["none", "not_before", "exact"], "none"),
    requestedTime: schedulingTime(raw.requestedTime),
    offeredDate: schedulingDate(raw.offeredDate),
    offeredTime: schedulingTime(raw.offeredTime),
    confirmedDate: schedulingDate(raw.confirmedDate),
    confirmedTime: schedulingTime(raw.confirmedTime),
    reason: raw.reason === "live_availability" || raw.reason === "no_availability" ? raw.reason : null,
  };
}

function emptyQualification(): AiPublicSdrQualification {
  return {
    goalKnown: false,
    procedureKnown: false,
    unitKnown: false,
    timingKnown: false,
    availabilityKnown: false,
    comprehensiveConcernKnown: false,
    previousExperienceKnown: false,
    previousExperienceConcernKnown: false,
    concernArea: "unknown",
    previousExperience: "unknown",
    previousExperienceSatisfaction: "unknown",
    preferredDayType: "unknown",
    preferredPeriod: "unknown",
  };
}

export function emptyAiPublicSdrState(): AiPublicSdrState {
  return {
    version: AI_PUBLIC_SDR_STATE_VERSION,
    phase: "reception",
    campaignName: null,
    latestIntent: "greeting",
    activeObjection: "none",
    objectionStatus: "none",
    readiness: "unknown",
    leadTemperature: "unknown",
    qualification: emptyQualification(),
    topicsCovered: [],
    nextObjective: "welcome",
    outcome: "open",
    scheduling: emptyAiPublicSchedulingState(),
    turnCount: 0,
  };
}

export function normalizeAiPublicSdrState(value: unknown): AiPublicSdrState {
  const fallback = emptyAiPublicSdrState();
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const raw = value as Record<string, unknown>;
  const rawQualification = raw.qualification && typeof raw.qualification === "object" && !Array.isArray(raw.qualification)
    ? raw.qualification as Record<string, unknown>
    : {};
  const topics = Array.isArray(raw.topicsCovered)
    ? raw.topicsCovered
      .filter((topic): topic is AiPublicSdrTopic => typeof topic === "string" && AI_PUBLIC_SDR_TOPICS.includes(topic as AiPublicSdrTopic))
      .slice(0, AI_PUBLIC_SDR_TOPICS.length)
    : [];

  return {
    version: AI_PUBLIC_SDR_STATE_VERSION,
    phase: enumValue(raw.phase, AI_PUBLIC_SDR_PHASES, fallback.phase),
    campaignName: campaignName(raw.campaignName),
    latestIntent: enumValue(raw.latestIntent, AI_PUBLIC_SDR_INTENTS, fallback.latestIntent),
    activeObjection: enumValue(raw.activeObjection, AI_PUBLIC_SDR_OBJECTIONS, fallback.activeObjection),
    objectionStatus: enumValue(raw.objectionStatus, AI_PUBLIC_SDR_OBJECTION_STATUSES, fallback.objectionStatus),
    readiness: enumValue(raw.readiness, AI_PUBLIC_SDR_READINESS, fallback.readiness),
    leadTemperature: enumValue(raw.leadTemperature, AI_PUBLIC_SDR_LEAD_TEMPERATURES, fallback.leadTemperature),
    qualification: {
      goalKnown: booleanValue(rawQualification.goalKnown),
      procedureKnown: booleanValue(rawQualification.procedureKnown),
      unitKnown: booleanValue(rawQualification.unitKnown),
      timingKnown: booleanValue(rawQualification.timingKnown),
      availabilityKnown: booleanValue(rawQualification.availabilityKnown),
      comprehensiveConcernKnown: booleanValue(rawQualification.comprehensiveConcernKnown),
      previousExperienceKnown: booleanValue(rawQualification.previousExperienceKnown),
      previousExperienceConcernKnown: booleanValue(rawQualification.previousExperienceConcernKnown),
      concernArea: enumValue(rawQualification.concernArea, ["unknown", "abdomen", "flanks", "back", "arms", "glutes", "culotte", "thighs", "face", "forehead", "glabella", "crow_feet", "lips", "under_eyes", "nasolabial_fold", "chin", "jawline", "cheeks", "other"], "unknown"),
      previousExperience: enumValue(rawQualification.previousExperience, ["unknown", "first_time", "virtuosa", "other_clinic", "previous_unspecified"], "unknown"),
      previousExperienceSatisfaction: enumValue(rawQualification.previousExperienceSatisfaction, ["unknown", "positive", "negative"], "unknown"),
      preferredDayType: enumValue(rawQualification.preferredDayType, ["unknown", "weekday", "saturday"], "unknown"),
      preferredPeriod: enumValue(rawQualification.preferredPeriod, ["unknown", "morning", "afternoon", "evening"], "unknown"),
    },
    topicsCovered: [...new Set(topics)],
    nextObjective: enumValue(raw.nextObjective, AI_PUBLIC_SDR_NEXT_OBJECTIVES, fallback.nextObjective),
    outcome: enumValue(raw.outcome, AI_PUBLIC_SDR_OUTCOMES, fallback.outcome),
    scheduling: normalizeAiPublicSchedulingState(raw.scheduling),
    turnCount: typeof raw.turnCount === "number" && Number.isFinite(raw.turnCount)
      ? Math.max(0, Math.min(100, Math.floor(raw.turnCount)))
      : 0,
  };
}

function hasCommercialContext(previous: AiPublicSdrState) {
  return previous.turnCount > 0 && [
    "deepen_interest",
    "offer_next_step",
    "await_choice",
    "handle_objection",
    "confirm_simulated_slot",
  ].includes(previous.nextObjective);
}

export function classifyAiPublicSdrIntent(message: string, previousValue?: unknown): AiPublicSdrIntent {
  const text = message.trim();
  const previous = normalizeAiPublicSdrState(previousValue);
  if (GREETING_ONLY.test(text)) return "greeting";
  const answersExperienceQuestion = ["qualify_experience", "qualify_experience_satisfaction", "understand_negative_experience", "clarify_experience_origin"].includes(previous.nextObjective)
    && (PREVIOUS_EXPERIENCE.test(text)
      || POSITIVE_EXPERIENCE.test(text)
      || NEGATIVE_EXPERIENCE.test(text)
      || POSITIVE_SHORT.test(text)
      || NEGATIVE_SHORT.test(text)
      || /\b(?:virtuosa|outra\s+cl[ií]nica|outro\s+lugar)\b/i.test(text));
  if (answersExperienceQuestion) return "other";
  if (hasCommercialContext(previous) && POSITIVE_SHORT.test(text)) return "positive_confirmation";
  if (previous.turnCount > 0 && NEGATIVE_SHORT.test(text)) return "negative_response";
  if (LEARN_INTENT.test(text)) return "learn";
  if (PRICE_INTENT.test(text)) return "price";
  if (SCHEDULE_INTENT.test(text)) return "schedule";
  if (hasCommercialContext(previous) && AVAILABILITY_INTENT.test(text)) return "availability";
  if (SPECIALIST_INTENT.test(text)) return "specialist";
  if (SAFETY_INTENT.test(text)) return "safety";
  if (SUITABILITY_INTENT.test(text)) return "suitability";
  if (LOCATION_INTENT.test(text)) return "location";
  if (RESULT_INTENT.test(text)) return "result";
  if (GOAL_INTENT.test(text)) return "goal";
  return "other";
}

function topicsFor(intent: AiPublicSdrIntent, messages: string[]): AiPublicSdrTopic[] {
  const topics: AiPublicSdrTopic[] = [];
  const text = messages.join("\n");
  if (messages.length > 0 && (intent === "learn" || /\b(?:inclui|placas|corrente russa|lipo sem corte|hyper\s*slim)\b/i.test(text))) {
    topics.push("campaign_overview", "procedure_function");
  }
  if (intent === "price") topics.push("price");
  if (intent === "result") topics.push("result_limits");
  if (["safety", "suitability"].includes(intent)) topics.push("safety_limits");
  if (["schedule", "availability"].includes(intent) || /avalia[cç][aã]o/i.test(text)) topics.push("evaluation");
  if (intent === "specialist" || /especialista/i.test(text)) topics.push("specialist");
  return topics;
}

function objectionFor(message: string): AiPublicSdrObjection {
  if (PRICE_OBJECTION.test(message)) return "price";
  if (RESULT_OBJECTION.test(message)) return "result";
  if (PAIN_OBJECTION.test(message)) return "pain";
  if (TIME_OBJECTION.test(message)) return "time";
  if (TRUST_OBJECTION.test(message)) return "trust";
  return "none";
}

export function classifyAiPublicSdrObjection(message: string): AiPublicSdrObjection {
  return objectionFor(message);
}

function inferredQualification(
  message: string,
  intent: AiPublicSdrIntent,
  previous: AiPublicSdrState,
): Partial<AiPublicSdrQualification> {
  const concernArea = CONCERN_AREAS.find(([, pattern]) => pattern.test(message))?.[0] || "unknown";
  const answeringExperience = previous.nextObjective === "qualify_experience";
  const clarifyingExperienceOrigin = previous.nextObjective === "clarify_experience_origin";
  const answeringSatisfaction = ["qualify_experience_satisfaction", "clarify_experience_origin"].includes(previous.nextObjective);
  const answeringNegativeExperience = previous.nextObjective === "understand_negative_experience";
  const firstTimeAnswer = /\b(?:primeira\s+vez|nunca\s+(?:fiz|realizei))\b/i.test(message)
    || (answeringExperience && NEGATIVE_SHORT.test(message));
  const previousExperience = firstTimeAnswer
    ? "first_time"
    : /\b(?:j[aá]\s+(?:fiz|realizei)|fiz\s+antes|realizei\s+antes)?.{0,30}\bvirtuosa\b/i.test(message)
      ? "virtuosa"
      : /\b(?:outra\s+cl[ií]nica|em\s+outro\s+lugar)\b/i.test(message)
        ? "other_clinic"
        : PREVIOUS_EXPERIENCE.test(message) || (answeringExperience && POSITIVE_SHORT.test(message))
          ? "previous_unspecified"
          : clarifyingExperienceOrigin && /\b(?:outro|outra)\b/i.test(message)
            ? "other_clinic"
          : "unknown";
  const previousExperienceSatisfaction = NEGATIVE_EXPERIENCE.test(message)
    || (answeringSatisfaction && NEGATIVE_SHORT.test(message))
    ? "negative"
    : POSITIVE_EXPERIENCE.test(message)
      || (answeringSatisfaction && POSITIVE_SHORT.test(message))
      ? "positive"
      : "unknown";
  const preferredDayType = /\bs[aá]bado\b/i.test(message)
    ? "saturday"
    : /\b(?:segunda|ter[cç]a|quarta|quinta|sexta)(?:-feira)?\b/i.test(message)
      ? "weekday"
      : "unknown";
  const preferredPeriod = /\b(?:de\s+manh[ãa]|pela\s+manh[ãa])/i.test(message)
    ? "morning"
    : /\b(?:[àa]\s+tarde|pela\s+tarde)\b/i.test(message)
      ? "afternoon"
      : /\b(?:[àa]\s+noite|pela\s+noite)\b/i.test(message)
        ? "evening"
        : "unknown";
  return {
    goalKnown: ["goal", "result"].includes(intent),
    procedureKnown: ["learn", "suitability", "safety", "price"].includes(intent),
    unitKnown: intent === "location",
    timingKnown: intent === "schedule",
    availabilityKnown: ["schedule", "availability"].includes(intent),
    comprehensiveConcernKnown: previous.nextObjective === "discover_concern"
      && COMPREHENSIVE_CONCERN.test(message.trim()),
    previousExperienceKnown: previousExperience !== "unknown",
    previousExperienceConcernKnown: answeringNegativeExperience && message.trim().length > 0,
    concernArea,
    previousExperience,
    previousExperienceSatisfaction,
    preferredDayType,
    preferredPeriod,
  };
}

function mergeQualification(
  previous: AiPublicSdrQualification,
  proposed: AiPublicSdrQualification,
  inferred: Partial<AiPublicSdrQualification>,
  previousObjective: AiPublicSdrNextObjective,
) {
  const categorical = <T extends string>(
    field: keyof AiPublicSdrQualification,
    fallback: T,
    acceptProposed = true,
  ) => {
    const inferredValue = inferred[field];
    if (typeof inferredValue === "string" && inferredValue !== fallback) return inferredValue as T;
    const proposedValue = proposed[field];
    if (acceptProposed && typeof proposedValue === "string" && proposedValue !== fallback) return proposedValue as T;
    return previous[field] as T;
  };
  const inferredConcern = inferred.concernArea && inferred.concernArea !== "unknown";
  const inferredExperience = inferred.previousExperience && inferred.previousExperience !== "unknown";
  const inferredExperienceSatisfaction = inferred.previousExperienceSatisfaction
    && inferred.previousExperienceSatisfaction !== "unknown";
  const concernArea = categorical(
    "concernArea",
    "unknown",
    previousObjective === "discover_concern" || Boolean(inferredConcern),
  );
  const previousExperience = categorical(
    "previousExperience",
    "unknown",
    ["qualify_experience", "qualify_experience_satisfaction", "clarify_experience_origin"].includes(previousObjective) || Boolean(inferredExperience),
  );
  const previousExperienceSatisfaction = categorical(
    "previousExperienceSatisfaction",
    "unknown",
    ["qualify_experience_satisfaction", "clarify_experience_origin"].includes(previousObjective)
      || Boolean(inferredExperienceSatisfaction),
  );
  return {
    goalKnown: previous.goalKnown || proposed.goalKnown || Boolean(inferred.goalKnown),
    procedureKnown: previous.procedureKnown || proposed.procedureKnown || Boolean(inferred.procedureKnown),
    unitKnown: previous.unitKnown || proposed.unitKnown || Boolean(inferred.unitKnown),
    timingKnown: previous.timingKnown || proposed.timingKnown || Boolean(inferred.timingKnown),
    availabilityKnown: previous.availabilityKnown || proposed.availabilityKnown || Boolean(inferred.availabilityKnown),
    comprehensiveConcernKnown: previous.comprehensiveConcernKnown
      || Boolean(inferred.comprehensiveConcernKnown),
    previousExperienceKnown: previous.previousExperienceKnown
      || previousExperience !== "unknown"
      || Boolean(inferred.previousExperienceKnown),
    previousExperienceConcernKnown: previous.previousExperienceConcernKnown
      || (previousObjective === "understand_negative_experience" && Boolean(inferred.previousExperienceConcernKnown)),
    concernArea,
    previousExperience,
    previousExperienceSatisfaction,
    preferredDayType: categorical("preferredDayType", "unknown"),
    preferredPeriod: categorical("preferredPeriod", "unknown"),
  };
}

function inferredPhase(
  intent: AiPublicSdrIntent,
  previous: AiPublicSdrState,
  proposed: AiPublicSdrState,
  objection: AiPublicSdrObjection,
): AiPublicSdrPhase {
  if (objection !== "none") return "objection";
  if (intent === "greeting") return previous.turnCount === 0 ? "reception" : previous.phase;
  if (["schedule", "specialist"].includes(intent)) return "conversion";
  if (intent === "positive_confirmation") {
    return previous.phase === "objection" || previous.phase === "education" || previous.topicsCovered.length > 0
      ? "conversion"
      : "qualification";
  }
  if (intent === "negative_response") return "closed";
  if (intent === "learn") return "education";
  if (["goal", "location", "availability"].includes(intent)) return "qualification";
  if (["price", "result", "safety", "suitability"].includes(intent)) return "education";
  if (previous.turnCount === 0) return "discovery";
  return proposed.phase === "reception" ? previous.phase : proposed.phase;
}

function inferredNextObjective(
  intent: AiPublicSdrIntent,
  phase: AiPublicSdrPhase,
  previous: AiPublicSdrState,
  qualification: AiPublicSdrQualification,
  topicsCovered: AiPublicSdrTopic[],
  objection: AiPublicSdrObjection,
  hasCampaignContext: boolean,
): AiPublicSdrNextObjective {
  if (phase === "handoff") return "handoff";
  if (phase === "closed") return "close_politely";
  if (objection !== "none") return "handle_objection";
  if (["schedule", "specialist", "availability"].includes(intent)) return "await_choice";
  if (intent === "negative_response") return "close_politely";
  if (qualification.concernArea === "unknown") return "discover_concern";
  if (qualification.previousExperience === "unknown") return "qualify_experience";
  if (qualification.previousExperience !== "first_time" && qualification.previousExperienceSatisfaction === "unknown") {
    return "qualify_experience_satisfaction";
  }
  if (qualification.previousExperienceSatisfaction === "negative" && !qualification.previousExperienceConcernKnown) {
    return "understand_negative_experience";
  }
  if (qualification.previousExperienceSatisfaction === "negative" && qualification.previousExperienceConcernKnown) {
    return "offer_next_step";
  }
  if (qualification.previousExperience === "first_time" && qualification.comprehensiveConcernKnown) {
    return "offer_next_step";
  }
  const campaignWasExplained = topicsCovered.includes("campaign_overview")
    || topicsCovered.includes("procedure_function");
  if (hasCampaignContext && !campaignWasExplained) return "explain_campaign";
  if (campaignWasExplained && ["qualify_experience", "qualify_experience_satisfaction", "clarify_experience_origin", "explain_campaign"].includes(previous.nextObjective)) {
    return "deepen_interest";
  }
  if (intent === "positive_confirmation") return "offer_next_step";
  if (intent === "learn") {
    return campaignWasExplained ? "offer_next_step" : "deepen_interest";
  }
  if (["goal", "location"].includes(intent)) return "qualify_need";
  if (["price", "result", "safety", "suitability"].includes(intent)) return "answer_question";
  if (topicsCovered.length >= 2 && phase === "education") return "offer_next_step";
  return "answer_question";
}

function inferredReadiness(intent: AiPublicSdrIntent, previous: AiPublicSdrState): AiPublicSdrReadiness {
  if (intent === "negative_response") return "not_now";
  if (["schedule", "specialist", "availability"].includes(intent)) return "ready";
  if (intent === "positive_confirmation") return previous.phase === "conversion" ? "ready" : "interested";
  if (["learn", "price", "result", "suitability", "safety"].includes(intent)) {
    return ["interested", "ready"].includes(previous.readiness) ? previous.readiness : "exploring";
  }
  return previous.readiness;
}

function leadTemperatureFor(readiness: AiPublicSdrReadiness, phase: AiPublicSdrPhase): AiPublicSdrLeadTemperature {
  if (readiness === "ready" || phase === "handoff") return "hot";
  if (readiness === "interested" || phase === "conversion") return "warm";
  if (readiness === "not_now" || phase === "closed") return "cold";
  return readiness === "exploring" ? "warm" : "unknown";
}

export function advanceAiPublicSdrState(params: {
  previous: unknown;
  proposed?: unknown;
  latestClientMessage: string;
  assistantMessages: string[];
  approvedCampaignName?: string | null;
  forceHandoff?: boolean;
  scheduling?: unknown;
}) {
  const previous = normalizeAiPublicSdrState(params.previous);
  const proposed = normalizeAiPublicSdrState(params.proposed);
  const latestIntent = classifyAiPublicSdrIntent(params.latestClientMessage, previous);
  const explicitObjection = objectionFor(params.latestClientMessage);
  const resolvedPreviousObjection = latestIntent === "positive_confirmation" && previous.activeObjection !== "none";
  const activeObjection = resolvedPreviousObjection
    ? "none"
    : explicitObjection !== "none"
      ? explicitObjection
      : params.proposed
        ? proposed.activeObjection
        : previous.activeObjection;
  const scheduling = params.scheduling != null
    ? normalizeAiPublicSchedulingState(params.scheduling)
    : proposed.scheduling.status !== "idle"
      ? proposed.scheduling
      : previous.scheduling;
  const schedulingActive = !["idle", "declined"].includes(scheduling.status);
  const phase = params.forceHandoff
    ? "handoff"
    : schedulingActive && scheduling.status !== "confirmed"
      ? "scheduling"
      : scheduling.status === "confirmed"
        ? "closed"
    : inferredPhase(latestIntent, previous, proposed, explicitObjection);
  const topicsCovered = [...new Set([
    ...previous.topicsCovered,
    ...proposed.topicsCovered,
    ...topicsFor(latestIntent, params.assistantMessages),
  ])];
  const qualification = mergeQualification(
    previous.qualification,
    proposed.qualification,
    inferredQualification(params.latestClientMessage, latestIntent, previous),
    previous.nextObjective,
  );
  const schedulingObjective: AiPublicSdrNextObjective | null = ["collecting_period", "clarifying_date"].includes(scheduling.status)
    ? "collect_scheduling_date"
    : scheduling.status === "awaiting_confirmation"
        ? "confirm_simulated_slot"
        : scheduling.status === "confirmed"
          ? "complete_simulation"
          : null;
  const nextObjective = params.forceHandoff
    ? "handoff"
    : schedulingObjective
      ? schedulingObjective
    : inferredNextObjective(
        latestIntent,
        phase,
        previous,
        qualification,
        topicsCovered,
        explicitObjection,
        Boolean(campaignName(params.approvedCampaignName) || previous.campaignName),
      );
  const readiness = params.forceHandoff || schedulingActive
    ? "ready"
    : inferredReadiness(latestIntent, previous);
  const objectionStatus: AiPublicSdrObjectionStatus = resolvedPreviousObjection
    ? "resolved"
    : explicitObjection !== "none"
      ? "identified"
      : activeObjection !== "none"
        ? proposed.objectionStatus === "unresolved" ? "unresolved" : "addressing"
        : "none";
  const outcome: AiPublicSdrOutcome = params.forceHandoff
    ? "handoff_requested"
    : scheduling.status === "confirmed"
      ? "simulated_evaluation_scheduled"
    : phase === "closed"
      ? latestIntent === "negative_response" ? "not_now" : "closed"
      : nextObjective === "offer_next_step" || nextObjective === "await_choice"
        ? "evaluation_offered"
        : previous.outcome === "not_now" ? "open" : previous.outcome;

  return {
    version: AI_PUBLIC_SDR_STATE_VERSION,
    phase,
    campaignName: campaignName(params.approvedCampaignName) || previous.campaignName,
    latestIntent,
    activeObjection,
    objectionStatus,
    readiness,
    leadTemperature: leadTemperatureFor(readiness, phase),
    qualification,
    topicsCovered,
    nextObjective,
    outcome,
    scheduling,
    turnCount: Math.min(100, previous.turnCount + 1),
  } satisfies AiPublicSdrState;
}

export function aiPublicSdrContractForPrompt() {
  return {
    version: AI_PUBLIC_SDR_STATE_VERSION,
    phase: AI_PUBLIC_SDR_PHASES,
    latestIntent: AI_PUBLIC_SDR_INTENTS,
    activeObjection: AI_PUBLIC_SDR_OBJECTIONS,
    objectionStatus: AI_PUBLIC_SDR_OBJECTION_STATUSES,
    readiness: AI_PUBLIC_SDR_READINESS,
    leadTemperature: AI_PUBLIC_SDR_LEAD_TEMPERATURES,
    qualification: Object.keys(emptyQualification()),
    topicsCovered: AI_PUBLIC_SDR_TOPICS,
    nextObjective: AI_PUBLIC_SDR_NEXT_OBJECTIVES,
    outcome: AI_PUBLIC_SDR_OUTCOMES,
    scheduling: {
      status: ["idle", "collecting_period", "clarifying_date", "awaiting_confirmation", "confirmed", "declined"],
      fields: ["requestedDate", "requestedDateMode", "pendingDate", "pendingDateMode", "requestedTime", "offeredDate", "offeredTime", "confirmedDate", "confirmedTime", "reason"],
    },
    rules: [
      "Atue como SDR consultiva e assistente virtual da clinica: acolha, descubra a necessidade, esclareca somente o necessario e avance para a avaliacao presencial. Nunca fale como se voce fosse a profissional que fara a avaliacao; descreva essa profissional em terceira pessoa como 'nossa especialista'. Nao ofereca transferencia para especialista como alternativa espontanea, salvo pedido explicito ou falta de resposta segura.",
      "Atualize o estado sem incluir nomes, telefones, dados de saude ou texto livre do cliente.",
      "Depois da recepcao, siga a ordem: discover_concern, qualify_experience e, quando ja houve procedimento, qualify_experience_satisfaction. Nao pergunte em qual clinica foi feito.",
      "Em discover_concern, pergunte a regiao pertinente a campanha sem explicar o procedimento ainda.",
      "Em qualify_experience, nao repita literalmente a regiao; acolha com naturalidade e use experienceQuestion do guia da campanha.",
      "Em qualify_experience_satisfaction, pergunte somente se a pessoa gostou da experiencia e do resultado anterior.",
      "Em understand_negative_experience, demonstre empatia, faca uma unica pergunta sobre o que mais incomodou e apresente negativeExperienceOptions do guia para facilitar a resposta.",
      "Depois que a pessoa explicar uma experiencia negativa, avance para offer_next_step: explique sem diagnostico que resultado e duracao podem variar por caracteristicas individuais e pela avaliacao feita na aplicacao, e pergunte diretamente se fica melhor durante a semana ou no sabado. Nao ofereca especialista como alternativa.",
      "Quando a pessoa responder que tudo ou todas as opcoes a incomodam em discover_concern, marque comprehensiveConcernKnown. Se depois informar que e a primeira experiencia, avance para offer_next_step sem perguntar novamente qual ponto quer melhorar.",
      "Nesse offer_next_step, use a qualificacao conhecida apenas para decidir o proximo passo, sem repeti-la ou parafrasea-la. Explique que na avaliacao a especialista e a pessoa definem juntas a melhor estrategia para buscar um resultado alinhado ao que ela espera, sem prometer satisfacao, e pergunte diretamente se fica melhor durante a semana ou no sabado.",
      "clarify_experience_origin e legado: nunca pergunte onde o procedimento foi feito; redirecione para qualify_experience_satisfaction.",
      "Em explain_campaign, reconheca a experiencia informada sem promessa e explique o procedimento em paragrafos curtos. Se a experiencia anterior foi positiva, diga que a equipe cuidara para que a experiencia na Virtuosa tambem seja positiva, sem garantir resultado.",
      "Respostas curtas como sim, pode sim, os dois, ambos e pode ser devem executar o que foi oferecido na pergunta anterior, sem reiniciar explicacoes nem pedir nova confirmacao.",
      "Nao repita nem parafraseie um topico ja coberto quando o interesse estiver confirmado; entregue somente informacao nova ou avance para offer_next_step.",
      "Use somente concernQuestion e concernExamples do guia da campanha ativa; nunca misture regioes ou opcoes de outra campanha.",
      "Marque objectionStatus e conduza uma objecao por vez, sem pressionar nem inventar garantias.",
      "Analise a mensagem atual como pergunta, objecao, confirmacao ou nova preferencia/restricao. Restricoes de agenda alteram a busca de disponibilidade e nao devem receber a mesma oferta anterior.",
      "Escolha uma unica proxima pergunta comercialmente util e coerente com nextObjective.",
      "O agendamento simulado e controlado pelo servidor. Preserve scheduling sem inventar datas, horarios ou disponibilidade.",
      "No agendamento, uma pergunta, outro dia ou nova restricao temporal nunca e confirmacao. Confirme somente quando a pessoa escolher inequivocamente um horario oferecido.",
      "Use scheduling.requestedDateMode para diferenciar data exata de inicio de periodo e confirme dia sem mes antes de consultar a agenda.",
    ],
  };
}
