export const AI_PUBLIC_SDR_STATE_VERSION = "public-sdr-v4";

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
  previousExperienceKnown: boolean;
  concernArea: "unknown" | "abdomen" | "flanks" | "back" | "arms" | "glutes" | "culotte" | "thighs" | "face" | "forehead" | "glabella" | "crow_feet" | "lips" | "under_eyes" | "nasolabial_fold" | "chin" | "jawline" | "cheeks" | "other";
  previousExperience: "unknown" | "first_time" | "virtuosa" | "other_clinic" | "previous_unspecified";
  preferredDayType: "unknown" | "weekday" | "saturday";
  preferredPeriod: "unknown" | "morning" | "afternoon" | "evening";
};

export type AiPublicSchedulingState = {
  status: "idle" | "collecting_date" | "collecting_time" | "awaiting_confirmation" | "alternative_offered" | "confirmed" | "declined";
  requestedDate: string | null;
  requestedTime: string | null;
  offeredDate: string | null;
  offeredTime: string | null;
  confirmedDate: string | null;
  confirmedTime: string | null;
  reason: "requested_available" | "requested_unavailable" | "outside_hours" | "closed_day" | "invalid_interval" | null;
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
const POSITIVE_SHORT = /^(?:sim|sim\s+por\s+favor|quero|quero\s+sim|pode\s+ser|vamos|claro|perfeito|gostei|tenho\s+interesse|os\s+dois|as\s+duas|ambos|tudo\s+bem|ok|beleza)[!,.\s]*$/i;
const NEGATIVE_SHORT = /^(?:n[aã]o|agora\s+n[aã]o|depois|vou\s+pensar|sem\s+interesse|n[aã]o\s+quero)[!,.\s]*$/i;
const PREVIOUS_EXPERIENCE = /\b(?:primeira\s+vez|nunca\s+(?:fiz|realizei)|j[aá]\s+(?:fiz|realizei)|fiz\s+antes|realizei\s+antes|experi[eê]ncia)\b/i;
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

export type AiPublicCampaignDiscoveryGuide = {
  track: "body" | "facial" | "general";
  concernQuestion: string;
  concernExamples: string[];
};

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
    };
  }
  if (/\b(?:preenchimento|rinomodelacao|facial|labial|olheira|bioestimulador)\b/.test(normalized)) {
    return {
      track: "facial",
      concernQuestion: "Qual região do rosto mais te incomoda hoje: lábios, olheiras, bigode chinês, queixo, contorno ou outra região?",
      concernExamples: ["lábios", "olheiras", "bigode chinês", "queixo", "contorno", "outra região"],
    };
  }
  if (/\b(?:barriga|hyper\s*slim|hyperslim|gordura|corporal|celulite|flacidez|monjifast|crio|lipo|enzima)\b/.test(normalized)) {
    return {
      track: "body",
      concernQuestion: "Qual região do corpo mais te incomoda hoje: abdômen, flancos, costas, braços, glúteos, culote ou outra região?",
      concernExamples: ["abdômen", "flancos", "costas", "braços", "glúteos", "culote", "outra região"],
    };
  }
  return {
    track: "general",
    concernQuestion: "Qual região ou incômodo você gostaria de cuidar primeiro?",
    concernExamples: ["rosto", "corpo", "outra região"],
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

function emptyAiPublicSchedulingState(): AiPublicSchedulingState {
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

function normalizeAiPublicSchedulingState(value: unknown): AiPublicSchedulingState {
  const fallback = emptyAiPublicSchedulingState();
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const raw = value as Record<string, unknown>;
  const statuses = ["idle", "collecting_date", "collecting_time", "awaiting_confirmation", "alternative_offered", "confirmed", "declined"] as const;
  const reasons = ["requested_available", "requested_unavailable", "outside_hours", "closed_day", "invalid_interval"] as const;
  return {
    status: enumValue(raw.status, statuses, "idle"),
    requestedDate: schedulingDate(raw.requestedDate),
    requestedTime: schedulingTime(raw.requestedTime),
    offeredDate: schedulingDate(raw.offeredDate),
    offeredTime: schedulingTime(raw.offeredTime),
    confirmedDate: schedulingDate(raw.confirmedDate),
    confirmedTime: schedulingTime(raw.confirmedTime),
    reason: raw.reason == null ? null : enumValue(raw.reason, reasons, "requested_available"),
  };
}

function emptyQualification(): AiPublicSdrQualification {
  return {
    goalKnown: false,
    procedureKnown: false,
    unitKnown: false,
    timingKnown: false,
    availabilityKnown: false,
    previousExperienceKnown: false,
    concernArea: "unknown",
    previousExperience: "unknown",
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
      previousExperienceKnown: booleanValue(rawQualification.previousExperienceKnown),
      concernArea: enumValue(rawQualification.concernArea, ["unknown", "abdomen", "flanks", "back", "arms", "glutes", "culotte", "thighs", "face", "forehead", "glabella", "crow_feet", "lips", "under_eyes", "nasolabial_fold", "chin", "jawline", "cheeks", "other"], "unknown"),
      previousExperience: enumValue(rawQualification.previousExperience, ["unknown", "first_time", "virtuosa", "other_clinic", "previous_unspecified"], "unknown"),
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
  const answersExperienceQuestion = ["qualify_experience", "clarify_experience_origin"].includes(previous.nextObjective)
    && (PREVIOUS_EXPERIENCE.test(text)
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

function inferredQualification(
  message: string,
  intent: AiPublicSdrIntent,
  previous: AiPublicSdrState,
): Partial<AiPublicSdrQualification> {
  const concernArea = CONCERN_AREAS.find(([, pattern]) => pattern.test(message))?.[0] || "unknown";
  const answeringExperience = previous.nextObjective === "qualify_experience";
  const clarifyingExperienceOrigin = previous.nextObjective === "clarify_experience_origin";
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
    previousExperienceKnown: previousExperience !== "unknown",
    concernArea,
    previousExperience,
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
  const concernArea = categorical(
    "concernArea",
    "unknown",
    previousObjective === "discover_concern" || Boolean(inferredConcern),
  );
  const previousExperience = categorical(
    "previousExperience",
    "unknown",
    ["qualify_experience", "clarify_experience_origin"].includes(previousObjective) || Boolean(inferredExperience),
  );
  return {
    goalKnown: previous.goalKnown || proposed.goalKnown || Boolean(inferred.goalKnown),
    procedureKnown: previous.procedureKnown || proposed.procedureKnown || Boolean(inferred.procedureKnown),
    unitKnown: previous.unitKnown || proposed.unitKnown || Boolean(inferred.unitKnown),
    timingKnown: previous.timingKnown || proposed.timingKnown || Boolean(inferred.timingKnown),
    availabilityKnown: previous.availabilityKnown || proposed.availabilityKnown || Boolean(inferred.availabilityKnown),
    previousExperienceKnown: previous.previousExperienceKnown
      || previousExperience !== "unknown"
      || Boolean(inferred.previousExperienceKnown),
    concernArea,
    previousExperience,
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
  if (qualification.previousExperience === "previous_unspecified") return "clarify_experience_origin";
  const campaignWasExplained = topicsCovered.includes("campaign_overview")
    || topicsCovered.includes("procedure_function");
  if (hasCampaignContext && !campaignWasExplained) return "explain_campaign";
  if (campaignWasExplained && ["qualify_experience", "clarify_experience_origin", "explain_campaign"].includes(previous.nextObjective)) {
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
  const schedulingObjective: AiPublicSdrNextObjective | null = scheduling.status === "collecting_date"
    ? "collect_scheduling_date"
    : scheduling.status === "collecting_time"
      ? "collect_scheduling_time"
      : ["awaiting_confirmation", "alternative_offered"].includes(scheduling.status)
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
      status: ["idle", "collecting_date", "collecting_time", "awaiting_confirmation", "alternative_offered", "confirmed", "declined"],
      fields: ["requestedDate", "requestedTime", "offeredDate", "offeredTime", "confirmedDate", "confirmedTime", "reason"],
    },
    rules: [
      "Atue como SDR consultiva: acolha, descubra a necessidade, esclareca somente o necessario e avance para avaliacao ou especialista.",
      "Atualize o estado sem incluir nomes, telefones, dados de saude ou texto livre do cliente.",
      "Depois da recepcao, siga a ordem: discover_concern, qualify_experience, clarify_experience_origin quando necessario e explain_campaign.",
      "Em discover_concern, pergunte a regiao pertinente a campanha sem explicar o procedimento ainda.",
      "Em qualify_experience, pergunte se e a primeira experiencia estetica ou se a pessoa ja realizou procedimentos.",
      "Em clarify_experience_origin, pergunte apenas se a experiencia anterior foi na Virtuosa ou em outra clinica.",
      "Em explain_campaign, reconheca a experiencia informada sem promessa e explique o procedimento em paragrafos curtos.",
      "Respostas curtas como sim, os dois, ambos e pode ser devem ser interpretadas pelo contexto do nextObjective anterior.",
      "Nao repita um topico ja coberto quando o interesse estiver confirmado; avance para offer_next_step.",
      "Marque objectionStatus e conduza uma objecao por vez, sem pressionar nem inventar garantias.",
      "Escolha uma unica proxima pergunta comercialmente util e coerente com nextObjective.",
      "O agendamento simulado e controlado pelo servidor. Preserve scheduling sem inventar datas, horarios ou disponibilidade.",
    ],
  };
}
