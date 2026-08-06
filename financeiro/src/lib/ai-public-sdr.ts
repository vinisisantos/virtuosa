import type { AiPublicSchedulingState, AiPublicSchedulingWeekday } from "./ai-public-scheduling";

export const AI_PUBLIC_SDR_STATE_VERSION = "public-sdr-v13";

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
  "present_body_plan_and_confirm_unit",
  "present_facial_proof_and_confirm_unit",
  "await_unit_confirmation",
  "answer_question",
  "explain_campaign_items",
  "handle_objection",
  "offer_evaluation_and_collect_day_type",
  "collect_scheduling_day_type",
  "collect_scheduling_period",
  "confirm_simulated_slot",
  "complete_simulation",
  "handoff",
  "close_politely",
] as const;

export const AI_PUBLIC_SDR_SCRIPT_NODE_IDS = [
  "N0",
  "C1",
  "C2",
  "C3",
  "C4a",
  "C4b",
  "C4b2",
  "C5",
  "C6",
  "C7",
  "C8",
  "F1",
  "F2",
  "F3a",
  "F3b",
  "F4",
  "F5",
  "F6a",
  "F6b",
  "S1",
  "S2",
  "S3",
  "S4",
  "S5",
  "S6",
] as const;

export const AI_PUBLIC_SDR_PENDING_COMMITMENTS = [
  "none",
  "explain_campaign_items",
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
export type AiPublicSdrScriptNodeId = (typeof AI_PUBLIC_SDR_SCRIPT_NODE_IDS)[number];
export type AiPublicSdrPendingCommitment = (typeof AI_PUBLIC_SDR_PENDING_COMMITMENTS)[number];

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
  latestIntents: AiPublicSdrIntent[];
  activeObjection: AiPublicSdrObjection;
  objectionStatus: AiPublicSdrObjectionStatus;
  readiness: AiPublicSdrReadiness;
  leadTemperature: AiPublicSdrLeadTemperature;
  qualification: AiPublicSdrQualification;
  topicsCovered: AiPublicSdrTopic[];
  pendingCommitment: AiPublicSdrPendingCommitment;
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
const POSITIVE_SHORT = /^(?:sim|sim\s+por\s+favor|sou\s+sim|sim,?\s+sou|moro\s+sim|quero|quero\s+sim|pode|pode\s+sim|pode\s+ser|vamos|claro|perfeito|gostei|tenho\s+interesse|os\s+dois|as\s+duas|ambos|tudo\s+bem|ok|beleza)[!,.\s]*$/i;
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
const CAMPAIGN_ITEM_EXPLANATION_OFFER = /\b(?:(?:(?:voc[eê]\s+)?quer(?:\s+que\s+eu)?|gostaria\s+que\s+eu|deseja\s+que\s+eu|posso|podemos)\b[^.!?\n]{0,100}\b(?:explic(?:ar|o|a|amos)|explique|detalh(?:ar|o|a|e|amos)|mostrar)|quer\s+saber\b[^.!?\n]{0,100}|(?:se|caso)\s+(?:voc[eê]\s+)?(?:quiser|queira|desejar)\b[^.!?\n]{0,100}\b(?:explic(?:o|amos)|detalh(?:o|amos)|mostr(?:o|amos)))\b[^.!?\n]{0,120}\b(?:cada\s+(?:etapa|item|procedimento)|itens?\s+do\s+protocolo|etapas?\s+do\s+protocolo)\b/i;

export type AiPublicCampaignDiscoveryGuide = {
  track: "body" | "facial" | "general";
  conversionProfile: "standard" | "facial_injectable";
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
      conversionProfile: "facial_injectable",
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
      conversionProfile: "facial_injectable",
      concernQuestion: "Em qual região você gostaria de fazer o preenchimento: lábios, bigode chinês ou olheiras?",
      concernExamples: ["lábios", "bigode chinês", "olheiras"],
      forbiddenConcernTerms: ["abdômen", "flancos", "costas", "braços", "glúteos", "culote", "coxas"],
      experienceQuestion: "E me diz uma coisa: é a sua primeira vez fazendo um procedimento nessa região ou você já fez antes?",
      negativeExperienceOptions: [...NEGATIVE_EXPERIENCE_OPTIONS],
    };
  }
  if (/\b(?:harmonizacao|preenchimento|modeladora|pump)\b.{0,20}\bgluteos?\b|\bgluteos?\b.{0,20}\b(?:harmonizacao|preenchimento|modeladora|pump)\b/.test(normalized)) {
    return {
      track: "body",
      conversionProfile: "standard",
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
      conversionProfile: "standard",
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
      conversionProfile: "standard",
      concernQuestion: "Qual região do corpo mais te incomoda hoje: abdômen, flancos, costas, braços, glúteos, culote ou outra região?",
      concernExamples: ["abdômen", "flancos", "costas", "braços", "glúteos", "culote", "outra região"],
      forbiddenConcernTerms: ["rosto", "testa", "olheiras", "lábios", "bigode chinês", "queixo", "mandíbula", "bochechas"],
      experienceQuestion: "E me diz uma coisa: é a sua primeira vez fazendo um procedimento nessa região ou você já fez antes?",
      negativeExperienceOptions: [...NEGATIVE_EXPERIENCE_OPTIONS],
    };
  }
  return {
    track: "general",
    conversionProfile: "standard",
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
  const preference = enumValue(raw.preference, ["unknown", "weekday", "saturday"], "unknown");
  const status = enumValue(raw.status, ["idle", "collecting_day_type", "collecting_period", "clarifying_date", "awaiting_confirmation", "confirmed", "declined"], "idle");
  return {
    status: status === "collecting_period" && preference === "unknown" ? "collecting_day_type" : status,
    preference,
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
    reason: ["live_availability", "no_availability", "cancelled_by_client", "reschedule_requested"].includes(String(raw.reason))
      ? raw.reason as AiPublicSchedulingState["reason"]
      : null,
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

function normalizedNextObjective(
  value: unknown,
  campaign: string | null,
): AiPublicSdrNextObjective {
  if (typeof value === "string" && AI_PUBLIC_SDR_NEXT_OBJECTIVES.includes(value as AiPublicSdrNextObjective)) {
    return value as AiPublicSdrNextObjective;
  }
  const facial = aiPublicCampaignDiscoveryGuide(campaign).conversionProfile === "facial_injectable";
  switch (value) {
    case "clarify_experience_origin":
      return "qualify_experience_satisfaction";
    case "explain_campaign":
    case "deepen_interest":
    case "qualify_need":
      return facial ? "present_facial_proof_and_confirm_unit" : "present_body_plan_and_confirm_unit";
    case "confirm_unit":
      return "await_unit_confirmation";
    case "offer_next_step":
    case "await_choice":
      return "offer_evaluation_and_collect_day_type";
    case "collect_scheduling_date":
      return "collect_scheduling_day_type";
    case "collect_scheduling_time":
      return "collect_scheduling_period";
    default:
      return "welcome";
  }
}

export function emptyAiPublicSdrState(): AiPublicSdrState {
  return {
    version: AI_PUBLIC_SDR_STATE_VERSION,
    phase: "reception",
    campaignName: null,
    latestIntent: "greeting",
    latestIntents: ["greeting"],
    activeObjection: "none",
    objectionStatus: "none",
    readiness: "unknown",
    leadTemperature: "unknown",
    qualification: emptyQualification(),
    topicsCovered: [],
    pendingCommitment: "none",
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

  const latestIntent = enumValue(raw.latestIntent, AI_PUBLIC_SDR_INTENTS, fallback.latestIntent);
  const latestIntents = Array.isArray(raw.latestIntents)
    ? raw.latestIntents
      .filter((intent): intent is AiPublicSdrIntent => typeof intent === "string" && AI_PUBLIC_SDR_INTENTS.includes(intent as AiPublicSdrIntent))
      .slice(0, AI_PUBLIC_SDR_INTENTS.length)
    : [latestIntent];

  const normalizedCampaignName = campaignName(raw.campaignName);
  return {
    version: AI_PUBLIC_SDR_STATE_VERSION,
    phase: enumValue(raw.phase, AI_PUBLIC_SDR_PHASES, fallback.phase),
    campaignName: normalizedCampaignName,
    latestIntent,
    latestIntents: [...new Set(latestIntents.length > 0 ? latestIntents : [latestIntent])],
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
    pendingCommitment: enumValue(
      raw.pendingCommitment,
      AI_PUBLIC_SDR_PENDING_COMMITMENTS,
      fallback.pendingCommitment,
    ),
    nextObjective: normalizedNextObjective(raw.nextObjective, normalizedCampaignName),
    outcome: enumValue(raw.outcome, AI_PUBLIC_SDR_OUTCOMES, fallback.outcome),
    scheduling: normalizeAiPublicSchedulingState(raw.scheduling),
    turnCount: typeof raw.turnCount === "number" && Number.isFinite(raw.turnCount)
      ? Math.max(0, Math.min(100, Math.floor(raw.turnCount)))
      : 0,
  };
}

export function aiPublicSdrScriptNodeIds(value: unknown): AiPublicSdrScriptNodeId[] {
  const state = normalizeAiPublicSdrState(value);
  const facial = aiPublicCampaignDiscoveryGuide(state.campaignName).conversionProfile === "facial_injectable";
  switch (state.nextObjective) {
    case "welcome":
      return ["N0"];
    case "discover_concern":
      return [facial ? "F1" : "C1"];
    case "qualify_experience":
      return facial ? ["F2"] : ["C2", "C3"];
    case "qualify_experience_satisfaction":
      return facial ? ["F3b"] : ["C4b"];
    case "understand_negative_experience":
      return facial ? ["F3b"] : ["C4b2"];
    case "present_body_plan_and_confirm_unit":
      return state.qualification.previousExperience === "first_time"
        ? ["C4a", "C5", "C6", "C7"]
        : ["C5", "C6", "C7"];
    case "present_facial_proof_and_confirm_unit":
      return state.qualification.previousExperience === "first_time"
        ? ["F3a", "F4"]
        : ["F3b", "F4"];
    case "await_unit_confirmation":
      return facial ? ["F4", "F5"] : ["C7"];
    case "offer_evaluation_and_collect_day_type":
      if (!facial) return ["C8", "S1"];
      return [state.qualification.previousExperience === "first_time" ? "F6a" : "F6b", "S1"];
    case "collect_scheduling_day_type":
      return ["S1"];
    case "collect_scheduling_period":
      return ["S2"];
    case "confirm_simulated_slot":
      return ["S3", "S4"];
    case "complete_simulation":
      return ["S6"];
    default:
      return [];
  }
}

export function aiPublicSdrStateWithAssistantCommitment(previousValue: unknown, assistantMessage: string) {
  const previous = normalizeAiPublicSdrState(previousValue);
  if (!CAMPAIGN_ITEM_EXPLANATION_OFFER.test(assistantMessage)) return previous;
  return {
    ...previous,
    pendingCommitment: "explain_campaign_items",
  } satisfies AiPublicSdrState;
}

function hasCommercialContext(previous: AiPublicSdrState) {
  return previous.turnCount > 0 && [
    "await_unit_confirmation",
    "offer_evaluation_and_collect_day_type",
    "collect_scheduling_day_type",
    "collect_scheduling_period",
    "handle_objection",
    "confirm_simulated_slot",
  ].includes(previous.nextObjective);
}

export function classifyAiPublicSdrIntents(message: string, previousValue?: unknown): AiPublicSdrIntent[] {
  const text = message.trim();
  const previous = normalizeAiPublicSdrState(previousValue);
  if (GREETING_ONLY.test(text)) return ["greeting"];
  const answersExperienceQuestion = ["qualify_experience", "qualify_experience_satisfaction", "understand_negative_experience"].includes(previous.nextObjective)
    && (PREVIOUS_EXPERIENCE.test(text)
      || POSITIVE_EXPERIENCE.test(text)
      || NEGATIVE_EXPERIENCE.test(text)
      || POSITIVE_SHORT.test(text)
      || NEGATIVE_SHORT.test(text)
      || /\b(?:virtuosa|outra\s+cl[ií]nica|outro\s+lugar)\b/i.test(text));
  if (answersExperienceQuestion) return ["other"];
  if (previous.pendingCommitment === "explain_campaign_items" && POSITIVE_SHORT.test(text)) return ["learn"];
  if (hasCommercialContext(previous) && POSITIVE_SHORT.test(text)) return ["positive_confirmation"];
  if (previous.turnCount > 0 && NEGATIVE_SHORT.test(text)) return ["negative_response"];
  const intents: AiPublicSdrIntent[] = [];
  if (PRICE_INTENT.test(text)) intents.push("price");
  if (LEARN_INTENT.test(text)) intents.push("learn");
  if (SCHEDULE_INTENT.test(text)) intents.push("schedule");
  if (hasCommercialContext(previous) && AVAILABILITY_INTENT.test(text)) intents.push("availability");
  if (SPECIALIST_INTENT.test(text)) intents.push("specialist");
  if (SAFETY_INTENT.test(text)) intents.push("safety");
  if (SUITABILITY_INTENT.test(text)) intents.push("suitability");
  if (LOCATION_INTENT.test(text)) intents.push("location");
  if (RESULT_INTENT.test(text)) intents.push("result");
  if (GOAL_INTENT.test(text)) intents.push("goal");
  return intents.length > 0 ? [...new Set(intents)] : ["other"];
}

export function classifyAiPublicSdrIntent(message: string, previousValue?: unknown): AiPublicSdrIntent {
  return classifyAiPublicSdrIntents(message, previousValue)[0];
}

function topicsFor(
  intents: AiPublicSdrIntent[],
  messages: string[],
  responseObjective: AiPublicSdrNextObjective,
): AiPublicSdrTopic[] {
  const topics: AiPublicSdrTopic[] = [];
  const text = messages.join("\n");
  const campaignExplanationDelivered = [
    "present_body_plan_and_confirm_unit",
    "present_facial_proof_and_confirm_unit",
    "explain_campaign_items",
    "answer_question",
  ].includes(responseObjective) || intents.includes("learn");
  if (messages.length > 0 && campaignExplanationDelivered) {
    topics.push("campaign_overview", "procedure_function");
  }
  if (intents.includes("price")) topics.push("price");
  if (intents.includes("result")) topics.push("result_limits");
  if (intents.some((intent) => ["safety", "suitability"].includes(intent))) topics.push("safety_limits");
  if (intents.some((intent) => ["schedule", "availability"].includes(intent)) || /avalia[cç][aã]o/i.test(text)) topics.push("evaluation");
  if (intents.includes("specialist") || /especialista/i.test(text)) topics.push("specialist");
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
  intents: AiPublicSdrIntent[],
  previous: AiPublicSdrState,
): Partial<AiPublicSdrQualification> {
  const concernArea = CONCERN_AREAS.find(([, pattern]) => pattern.test(message))?.[0] || "unknown";
  const answeringExperience = previous.nextObjective === "qualify_experience";
  const answeringSatisfaction = previous.nextObjective === "qualify_experience_satisfaction";
  const answeringNegativeExperience = previous.nextObjective === "understand_negative_experience";
  const confirmingUnit = previous.nextObjective === "await_unit_confirmation";
  const firstTimeAnswer = /\b(?:primeira\s+vez|nunca\s+(?:fiz|realizei))\b/i.test(message)
    || (answeringExperience && NEGATIVE_SHORT.test(message));
  const mentionsVirtuosa = /\bvirtuosa\b/i.test(message);
  const deniesVirtuosa = /\b(?:n[aã]o|nunca)\s+(?:foi|fiz|realizei)(?:\s+(?:o|isso|esse|procedimento))?\s+(?:na|com\s+a)?\s*virtuosa\b/i.test(message);
  const mentionsOtherClinic = /\b(?:outra\s+cl[ií]nica|em\s+outro\s+lugar)\b/i.test(message);
  const deniesOtherClinic = /\b(?:n[aã]o|nunca)\s+(?:foi|fiz|realizei)(?:\s+(?:o|isso|esse|procedimento))?\s+(?:em\s+)?(?:outra\s+cl[ií]nica|outro\s+lugar)\b/i.test(message);
  const previousExperienceOrigin = mentionsOtherClinic && !deniesOtherClinic && (deniesVirtuosa || !mentionsVirtuosa)
    ? "other_clinic"
    : mentionsVirtuosa && !deniesVirtuosa
      ? "virtuosa"
      : mentionsOtherClinic && !deniesOtherClinic
        ? "other_clinic"
        : null;
  const previousExperience = firstTimeAnswer
    ? "first_time"
    : previousExperienceOrigin
      ? previousExperienceOrigin
        : PREVIOUS_EXPERIENCE.test(message) || (answeringExperience && POSITIVE_SHORT.test(message))
          ? "previous_unspecified"
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
    goalKnown: intents.some((intent) => ["goal", "result"].includes(intent)),
    procedureKnown: intents.some((intent) => ["learn", "suitability", "safety", "price"].includes(intent)),
    unitKnown: intents.includes("location") || (confirmingUnit && POSITIVE_SHORT.test(message)),
    timingKnown: intents.includes("schedule"),
    availabilityKnown: intents.some((intent) => ["schedule", "availability"].includes(intent)),
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
    ["qualify_experience", "qualify_experience_satisfaction"].includes(previousObjective) || Boolean(inferredExperience),
  );
  const previousExperienceSatisfaction = categorical(
    "previousExperienceSatisfaction",
    "unknown",
    previousObjective === "qualify_experience_satisfaction"
      || Boolean(inferredExperienceSatisfaction),
  );
  return {
    goalKnown: previous.goalKnown || proposed.goalKnown || Boolean(inferred.goalKnown),
    procedureKnown: previous.procedureKnown || proposed.procedureKnown || Boolean(inferred.procedureKnown),
    // A unidade só fica confirmada por evidência da mensagem da pessoa; o modelo
    // recebe a unidade do link como contexto e não pode tratá-la como escolha.
    unitKnown: previous.unitKnown || Boolean(inferred.unitKnown),
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
  if (previous.pendingCommitment === "explain_campaign_items" && intent === "learn") return "education";
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

function nextScriptObjective(
  previous: AiPublicSdrState,
  qualification: AiPublicSdrQualification,
  activeCampaignName: string | null,
): AiPublicSdrNextObjective {
  if (qualification.concernArea === "unknown") return "discover_concern";
  if (qualification.previousExperience === "unknown") return "qualify_experience";
  if (qualification.previousExperience !== "first_time" && qualification.previousExperienceSatisfaction === "unknown") {
    return "qualify_experience_satisfaction";
  }
  if (qualification.previousExperienceSatisfaction === "negative" && !qualification.previousExperienceConcernKnown) {
    return "understand_negative_experience";
  }
  if (!qualification.unitKnown) {
    if (previous.nextObjective === "await_unit_confirmation") return "await_unit_confirmation";
    return aiPublicCampaignDiscoveryGuide(activeCampaignName).conversionProfile === "facial_injectable"
      ? "present_facial_proof_and_confirm_unit"
      : "present_body_plan_and_confirm_unit";
  }
  if (["collect_scheduling_day_type", "collect_scheduling_period"].includes(previous.nextObjective)) {
    return previous.nextObjective;
  }
  return "offer_evaluation_and_collect_day_type";
}

function inferredNextObjective(
  intent: AiPublicSdrIntent,
  phase: AiPublicSdrPhase,
  previous: AiPublicSdrState,
  qualification: AiPublicSdrQualification,
  objection: AiPublicSdrObjection,
  activeCampaignName: string | null,
  responseObjective?: AiPublicSdrNextObjective,
): AiPublicSdrNextObjective {
  if (phase === "handoff") return "handoff";
  if (phase === "closed") return "close_politely";
  if (responseObjective === "present_body_plan_and_confirm_unit"
    || responseObjective === "present_facial_proof_and_confirm_unit") {
    return "await_unit_confirmation";
  }
  if (responseObjective === "offer_evaluation_and_collect_day_type") {
    return "collect_scheduling_day_type";
  }
  if (responseObjective && ["answer_question", "explain_campaign_items", "handle_objection"].includes(responseObjective)) {
    return nextScriptObjective(previous, qualification, activeCampaignName);
  }
  if (objection !== "none") return "handle_objection";
  if (previous.pendingCommitment === "explain_campaign_items" && intent === "learn") {
    return "explain_campaign_items";
  }
  if (["schedule", "availability"].includes(intent)) return "offer_evaluation_and_collect_day_type";
  if (intent === "negative_response") return "close_politely";
  if (["learn", "price", "result", "safety", "suitability", "location", "specialist"].includes(intent)) {
    return "answer_question";
  }
  return nextScriptObjective(previous, qualification, activeCampaignName);
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
  responseObjective?: AiPublicSdrNextObjective;
  approvedCampaignName?: string | null;
  forceHandoff?: boolean;
  scheduling?: unknown;
}) {
  const previous = normalizeAiPublicSdrState(params.previous);
  const proposed = normalizeAiPublicSdrState(params.proposed);
  const latestIntents = classifyAiPublicSdrIntents(params.latestClientMessage, previous);
  const latestIntent = latestIntents[0];
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
  const responseObjective = params.responseObjective || previous.nextObjective;
  const acceptsCampaignExplanationTopics = [
    "present_body_plan_and_confirm_unit",
    "present_facial_proof_and_confirm_unit",
    "explain_campaign_items",
    "answer_question",
  ].includes(responseObjective) || latestIntents.includes("learn");
  const proposedTopics = proposed.topicsCovered.filter((topic) => (
    !["campaign_overview", "procedure_function"].includes(topic)
    || acceptsCampaignExplanationTopics
  ));
  const topicsCovered = [...new Set([
    ...previous.topicsCovered,
    ...proposedTopics,
    ...topicsFor(latestIntents, params.assistantMessages, responseObjective),
  ])];
  const pendingCommitment = CAMPAIGN_ITEM_EXPLANATION_OFFER.test(params.assistantMessages.join("\n"))
    ? "explain_campaign_items"
    : "none";
  const qualification = mergeQualification(
    previous.qualification,
    proposed.qualification,
    inferredQualification(params.latestClientMessage, latestIntents, previous),
    previous.nextObjective,
  );
  const schedulingObjective: AiPublicSdrNextObjective | null = ["collecting_day_type", "clarifying_date"].includes(scheduling.status)
    ? "collect_scheduling_day_type"
    : scheduling.status === "collecting_period"
      ? "collect_scheduling_period"
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
          explicitObjection,
          campaignName(params.approvedCampaignName) || previous.campaignName,
          params.responseObjective,
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
      : nextObjective === "offer_evaluation_and_collect_day_type"
          || nextObjective === "collect_scheduling_day_type"
        ? "evaluation_offered"
        : previous.outcome === "not_now" ? "open" : previous.outcome;

  return {
    version: AI_PUBLIC_SDR_STATE_VERSION,
    phase,
    campaignName: campaignName(params.approvedCampaignName) || previous.campaignName,
    latestIntent,
    latestIntents,
    activeObjection,
    objectionStatus,
    readiness,
    leadTemperature: leadTemperatureFor(readiness, phase),
    qualification,
    topicsCovered,
    pendingCommitment,
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
    latestIntents: AI_PUBLIC_SDR_INTENTS,
    activeObjection: AI_PUBLIC_SDR_OBJECTIONS,
    objectionStatus: AI_PUBLIC_SDR_OBJECTION_STATUSES,
    readiness: AI_PUBLIC_SDR_READINESS,
    leadTemperature: AI_PUBLIC_SDR_LEAD_TEMPERATURES,
    qualification: Object.keys(emptyQualification()),
    topicsCovered: AI_PUBLIC_SDR_TOPICS,
    pendingCommitment: AI_PUBLIC_SDR_PENDING_COMMITMENTS,
    nextObjective: AI_PUBLIC_SDR_NEXT_OBJECTIVES,
    scriptNodeIds: AI_PUBLIC_SDR_SCRIPT_NODE_IDS,
    outcome: AI_PUBLIC_SDR_OUTCOMES,
    scheduling: {
      status: ["idle", "collecting_day_type", "collecting_period", "clarifying_date", "awaiting_confirmation", "confirmed", "declined"],
      fields: ["requestedDate", "requestedDateMode", "pendingDate", "pendingDateMode", "requestedTime", "offeredDate", "offeredTime", "confirmedDate", "confirmedTime", "reason"],
    },
    rules: [
      "Atue como SDR consultiva e assistente virtual da clinica: acolha, descubra a necessidade, esclareca somente o necessario e avance para a avaliacao presencial. Nunca fale como se voce fosse a profissional que fara a avaliacao; descreva essa profissional em terceira pessoa como 'nossa especialista'. Nao ofereca transferencia para especialista como alternativa espontanea, salvo pedido explicito ou falta de resposta segura.",
      "Atualize o estado sem incluir nomes, telefones, dados de saude ou texto livre do cliente.",
      "Reconheca todas as intencoes presentes na mesma mensagem em latestIntents; latestIntent e apenas a prioridade principal compativel com consumidores legados.",
      "nextObjective e o cursor canonico da sequencia C/F/S. Perguntas e objecoes sao interrupcoes temporarias: responda e retome o objetivo pendente sem reiniciar o fluxo.",
      "Depois da recepcao, siga a ordem: discover_concern, qualify_experience e, quando ja houve procedimento, qualify_experience_satisfaction. Nao pergunte em qual clinica foi feito.",
      "Em discover_concern, pergunte a regiao pertinente a campanha sem explicar o procedimento ainda.",
      "Em qualify_experience, nao repita literalmente a regiao; acolha com naturalidade e use experienceQuestion do guia da campanha.",
      "Em qualify_experience_satisfaction, pergunte somente se a pessoa gostou da experiencia e do resultado anterior.",
      "Em understand_negative_experience, demonstre empatia, faca uma unica pergunta sobre o que mais incomodou e apresente negativeExperienceOptions do guia para facilitar a resposta.",
      "Depois da qualificacao, present_body_plan_and_confirm_unit cobre C4/C5/C6/C7 e present_facial_proof_and_confirm_unit cobre F3/F4. Use apenas conhecimento aprovado, terceira pessoa clinica e o endereco cadastrado.",
      "await_unit_confirmation preserva C7 ou F4/F5 ate uma confirmacao inequivoca. Nao repita qualificacao nem explicacao.",
      "offer_evaluation_and_collect_day_type cobre C8 ou F6 junto de S1: convide para avaliacao ou reavaliacao e pergunte diretamente semana ou sabado, sem permissao intermediaria.",
      "collect_scheduling_day_type corresponde a S1; collect_scheduling_period a S2; confirm_simulated_slot a S3/S4; complete_simulation a S6. S5 nao coleta nome no link publico.",
      "Nunca crie uma etapa de permissao para explicar. Quando houver conhecimento aprovado, explique na mesma resposta. Quando pendingCommitment for explain_campaign_items, cumpra a explicacao prometida antes de qualquer convite para avaliacao ou agendamento.",
      "Respostas curtas como sim, pode sim, os dois, ambos e pode ser devem executar o que foi oferecido na pergunta anterior, sem reiniciar explicacoes nem pedir nova confirmacao.",
      "Nao repita nem parafraseie um topico ja coberto quando o interesse estiver confirmado; entregue somente informacao nova ou avance no cursor canonico.",
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
