export const AI_PUBLIC_SDR_STATE_VERSION = "public-sdr-v1";

export const AI_PUBLIC_SDR_PHASES = [
  "reception",
  "discovery",
  "education",
  "objection",
  "conversion",
  "handoff",
] as const;

export const AI_PUBLIC_SDR_INTENTS = [
  "greeting",
  "learn",
  "price",
  "result",
  "suitability",
  "safety",
  "schedule",
  "specialist",
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
  "answer_question",
  "deepen_interest",
  "handle_objection",
  "offer_next_step",
  "await_choice",
  "handoff",
] as const;

export type AiPublicSdrPhase = (typeof AI_PUBLIC_SDR_PHASES)[number];
export type AiPublicSdrIntent = (typeof AI_PUBLIC_SDR_INTENTS)[number];
export type AiPublicSdrObjection = (typeof AI_PUBLIC_SDR_OBJECTIONS)[number];
export type AiPublicSdrTopic = (typeof AI_PUBLIC_SDR_TOPICS)[number];
export type AiPublicSdrNextObjective = (typeof AI_PUBLIC_SDR_NEXT_OBJECTIVES)[number];

export type AiPublicSdrState = {
  version: typeof AI_PUBLIC_SDR_STATE_VERSION;
  phase: AiPublicSdrPhase;
  campaignName: string | null;
  latestIntent: AiPublicSdrIntent;
  activeObjection: AiPublicSdrObjection;
  topicsCovered: AiPublicSdrTopic[];
  nextObjective: AiPublicSdrNextObjective;
  turnCount: number;
};

const GREETING_ONLY = /^(?:oi|ol[aá]|oie|opa|bom\s+dia|boa\s+tarde|boa\s+noite)[!,.\s]*$/i;
const PRICE_INTENT = /\b(?:pre[cç]o|valor|custa|custo|quanto|investimento|or[cç]amento|parcela|pagamento)\b/i;
const RESULT_INTENT = /\b(?:resultado|funciona|resolve|emagrece|medida|defin(?:e|ir|i[cç][aã]o)|efeito)\b/i;
const SUITABILITY_INTENT = /\b(?:serve\s+para\s+mim|indicado|indica[cç][aã]o|posso\s+fazer|meu\s+caso)\b/i;
const SAFETY_INTENT = /\b(?:d[oó]i|dor|seguro|risco|contraindica|recupera[cç][aã]o|efeito\s+colateral)\b/i;
const SCHEDULE_INTENT = /\b(?:agend|avalia[cç][aã]o|hor[aá]rio|disponibilidade|data)\b/i;
const SPECIALIST_INTENT = /\b(?:especialista|atendente|consultora|pessoa|humano|equipe)\b/i;
const LEARN_INTENT = /\b(?:como\s+funciona|saber\s+mais|entender|explica|procedimento|protocolo|inclui)\b/i;

function enumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && allowed.includes(value as T) ? value as T : fallback;
}

function campaignName(value: unknown) {
  if (typeof value !== "string") return null;
  const compact = value.replace(/\s+/g, " ").trim();
  return compact ? compact.slice(0, 120) : null;
}

export function emptyAiPublicSdrState(): AiPublicSdrState {
  return {
    version: AI_PUBLIC_SDR_STATE_VERSION,
    phase: "reception",
    campaignName: null,
    latestIntent: "greeting",
    activeObjection: "none",
    topicsCovered: [],
    nextObjective: "welcome",
    turnCount: 0,
  };
}

export function normalizeAiPublicSdrState(value: unknown): AiPublicSdrState {
  const fallback = emptyAiPublicSdrState();
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const raw = value as Record<string, unknown>;
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
    topicsCovered: [...new Set(topics)],
    nextObjective: enumValue(raw.nextObjective, AI_PUBLIC_SDR_NEXT_OBJECTIVES, fallback.nextObjective),
    turnCount: typeof raw.turnCount === "number" && Number.isFinite(raw.turnCount)
      ? Math.max(0, Math.min(100, Math.floor(raw.turnCount)))
      : 0,
  };
}

function intentFor(message: string): AiPublicSdrIntent {
  if (GREETING_ONLY.test(message.trim())) return "greeting";
  if (PRICE_INTENT.test(message)) return "price";
  if (SCHEDULE_INTENT.test(message)) return "schedule";
  if (SPECIALIST_INTENT.test(message)) return "specialist";
  if (SAFETY_INTENT.test(message)) return "safety";
  if (SUITABILITY_INTENT.test(message)) return "suitability";
  if (RESULT_INTENT.test(message)) return "result";
  if (LEARN_INTENT.test(message)) return "learn";
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
  if (intent === "schedule" || /avalia[cç][aã]o/i.test(text)) topics.push("evaluation");
  if (intent === "specialist" || /especialista/i.test(text)) topics.push("specialist");
  return topics;
}

function inferredPhase(intent: AiPublicSdrIntent, previous: AiPublicSdrState): AiPublicSdrPhase {
  if (intent === "greeting") return previous.turnCount === 0 ? "reception" : previous.phase;
  if (["price", "result", "safety", "suitability"].includes(intent)) return "objection";
  if (["schedule", "specialist"].includes(intent)) return "conversion";
  if (intent === "learn") return "education";
  return previous.turnCount === 0 ? "discovery" : previous.phase;
}

function inferredNextObjective(intent: AiPublicSdrIntent, phase: AiPublicSdrPhase): AiPublicSdrNextObjective {
  if (phase === "handoff") return "handoff";
  if (["price", "result", "safety", "suitability"].includes(intent)) return "handle_objection";
  if (["schedule", "specialist"].includes(intent)) return "await_choice";
  if (intent === "greeting") return "discover_concern";
  if (intent === "learn") return "deepen_interest";
  return "answer_question";
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
  const latestIntent = intentFor(params.latestClientMessage);
  const phase = params.forceHandoff
    ? "handoff"
    : proposed.turnCount > 0 || params.proposed
      ? proposed.phase
      : inferredPhase(latestIntent, previous);
  const topicsCovered = [...new Set([
    ...previous.topicsCovered,
    ...proposed.topicsCovered,
    ...topicsFor(latestIntent, params.assistantMessages),
  ])];

  return {
    version: AI_PUBLIC_SDR_STATE_VERSION,
    phase,
    campaignName: campaignName(params.approvedCampaignName) || previous.campaignName,
    latestIntent,
    activeObjection: params.proposed ? proposed.activeObjection : previous.activeObjection,
    topicsCovered,
    nextObjective: params.forceHandoff
      ? "handoff"
      : params.proposed && proposed.nextObjective !== "welcome"
        ? proposed.nextObjective
        : inferredNextObjective(latestIntent, phase),
    turnCount: Math.min(100, previous.turnCount + 1),
  } satisfies AiPublicSdrState;
}

export function aiPublicSdrContractForPrompt() {
  return {
    version: AI_PUBLIC_SDR_STATE_VERSION,
    phase: AI_PUBLIC_SDR_PHASES,
    latestIntent: AI_PUBLIC_SDR_INTENTS,
    activeObjection: AI_PUBLIC_SDR_OBJECTIONS,
    topicsCovered: AI_PUBLIC_SDR_TOPICS,
    nextObjective: AI_PUBLIC_SDR_NEXT_OBJECTIVES,
    rules: [
      "Atualize o estado sem incluir nomes, telefones, dados de saude ou texto livre do cliente.",
      "Nao repita um topico ja coberto, a menos que o cliente peca aprofundamento.",
      "Escolha uma unica proxima pergunta coerente com nextObjective.",
    ],
  };
}
