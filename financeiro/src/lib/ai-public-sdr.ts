export const AI_PUBLIC_SDR_STATE_VERSION = "public-sdr-v2";

export const AI_PUBLIC_SDR_PHASES = [
  "reception",
  "discovery",
  "qualification",
  "education",
  "objection",
  "conversion",
  "handoff",
  "closed",
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
  "qualify_need",
  "answer_question",
  "deepen_interest",
  "handle_objection",
  "offer_next_step",
  "await_choice",
  "handoff",
  "close_politely",
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
const PREVIOUS_EXPERIENCE = /\b(?:primeira\s+vez|nunca\s+fiz|j[aá]\s+fiz|fiz\s+antes|experi[eê]ncia)\b/i;
const PRICE_OBJECTION = /\b(?:caro|muito\s+caro|fora\s+do\s+or[cç]amento|n[aã]o\s+consigo\s+pagar)\b/i;
const RESULT_OBJECTION = /\b(?:n[aã]o\s+funciona|medo\s+de\s+n[aã]o\s+funcionar|garantia\s+de\s+resultado)\b/i;
const PAIN_OBJECTION = /\b(?:medo\s+de\s+dor|d[oó]i\s+muito|doloroso)\b/i;
const TIME_OBJECTION = /\b(?:sem\s+tempo|n[aã]o\s+tenho\s+tempo|demora\s+muito)\b/i;
const TRUST_OBJECTION = /\b(?:n[aã]o\s+confio|tenho\s+receio|tenho\s+medo|[ée]\s+seguro\s+mesmo)\b/i;

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

function emptyQualification(): AiPublicSdrQualification {
  return {
    goalKnown: false,
    procedureKnown: false,
    unitKnown: false,
    timingKnown: false,
    availabilityKnown: false,
    previousExperienceKnown: false,
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
    },
    topicsCovered: [...new Set(topics)],
    nextObjective: enumValue(raw.nextObjective, AI_PUBLIC_SDR_NEXT_OBJECTIVES, fallback.nextObjective),
    outcome: enumValue(raw.outcome, AI_PUBLIC_SDR_OUTCOMES, fallback.outcome),
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
  ].includes(previous.nextObjective);
}

export function classifyAiPublicSdrIntent(message: string, previousValue?: unknown): AiPublicSdrIntent {
  const text = message.trim();
  const previous = normalizeAiPublicSdrState(previousValue);
  if (GREETING_ONLY.test(text)) return "greeting";
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
  if (intent === "learn" || /\b(?:inclui|placas|corrente russa|lipo sem corte|hyper\s*slim)\b/i.test(text)) {
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

function inferredQualification(message: string, intent: AiPublicSdrIntent): Partial<AiPublicSdrQualification> {
  return {
    goalKnown: ["goal", "result"].includes(intent),
    procedureKnown: ["learn", "suitability", "safety", "price"].includes(intent),
    unitKnown: intent === "location",
    timingKnown: intent === "schedule",
    availabilityKnown: ["schedule", "availability"].includes(intent),
    previousExperienceKnown: PREVIOUS_EXPERIENCE.test(message),
  };
}

function mergeQualification(
  previous: AiPublicSdrQualification,
  proposed: AiPublicSdrQualification,
  inferred: Partial<AiPublicSdrQualification>,
) {
  return Object.fromEntries(
    Object.keys(previous).map((key) => {
      const field = key as keyof AiPublicSdrQualification;
      return [field, previous[field] || proposed[field] || Boolean(inferred[field])];
    }),
  ) as AiPublicSdrQualification;
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
  topicsCovered: AiPublicSdrTopic[],
  objection: AiPublicSdrObjection,
): AiPublicSdrNextObjective {
  if (phase === "handoff") return "handoff";
  if (phase === "closed") return "close_politely";
  if (objection !== "none") return "handle_objection";
  if (["schedule", "specialist", "availability"].includes(intent)) return "await_choice";
  if (intent === "positive_confirmation") return "offer_next_step";
  if (intent === "negative_response") return "close_politely";
  if (intent === "greeting") return "discover_concern";
  if (intent === "learn") {
    const alreadyExplained = previous.topicsCovered.includes("campaign_overview")
      || previous.topicsCovered.includes("procedure_function");
    return alreadyExplained ? "offer_next_step" : "deepen_interest";
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
  const phase = params.forceHandoff
    ? "handoff"
    : inferredPhase(latestIntent, previous, proposed, explicitObjection);
  const topicsCovered = [...new Set([
    ...previous.topicsCovered,
    ...proposed.topicsCovered,
    ...topicsFor(latestIntent, params.assistantMessages),
  ])];
  const qualification = mergeQualification(
    previous.qualification,
    proposed.qualification,
    inferredQualification(params.latestClientMessage, latestIntent),
  );
  const nextObjective = params.forceHandoff
    ? "handoff"
    : inferredNextObjective(latestIntent, phase, previous, topicsCovered, explicitObjection);
  const readiness = params.forceHandoff
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
    rules: [
      "Atue como SDR consultiva: acolha, descubra a necessidade, esclareca somente o necessario e avance para avaliacao ou especialista.",
      "Atualize o estado sem incluir nomes, telefones, dados de saude ou texto livre do cliente.",
      "Respostas curtas como sim, os dois, ambos e pode ser devem ser interpretadas pelo contexto do nextObjective anterior.",
      "Nao repita um topico ja coberto quando o interesse estiver confirmado; avance para offer_next_step.",
      "Marque objectionStatus e conduza uma objecao por vez, sem pressionar nem inventar garantias.",
      "Escolha uma unica proxima pergunta comercialmente util e coerente com nextObjective.",
    ],
  };
}
