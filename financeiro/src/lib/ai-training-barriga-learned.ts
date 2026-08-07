export const AI_TRAINING_BARRIGA_LEARNED_RUNTIME = "barriga-learned-v1";
export const AI_TRAINING_BARRIGA_LEARNED_STATE_VERSION = "barriga-learned-state-v1";
export const AI_TRAINING_BARRIGA_PLAYBOOK_VERSION = "barriga-julho-2026-v1";
export const AI_TRAINING_BARRIGA_ALLOWED_UNITS = ["Osasco", "SCS"] as const;

export type AiTrainingBarrigaUnit = (typeof AI_TRAINING_BARRIGA_ALLOWED_UNITS)[number];
export type AiTrainingBarrigaStage = "discover" | "explain_evaluation" | "invite" | "offered_slots" | "scheduled" | "closed";
export type AiTrainingBarrigaIntent = "procedure" | "result" | "price" | "location" | "scheduling" | "payment" | "safety" | "other";

export type AiTrainingBarrigaSlot = {
  id: "slot-a" | "slot-b";
  date: string;
  time: string;
  label: string;
};

export type AiTrainingBarrigaLearnedState = {
  version: typeof AI_TRAINING_BARRIGA_LEARNED_STATE_VERSION;
  runtimeVersion: typeof AI_TRAINING_BARRIGA_LEARNED_RUNTIME;
  playbookVersion: typeof AI_TRAINING_BARRIGA_PLAYBOOK_VERSION;
  unit: AiTrainingBarrigaUnit;
  stage: AiTrainingBarrigaStage;
  intent: AiTrainingBarrigaIntent;
  nonClinicalGoal: string;
  simulatedSlots: AiTrainingBarrigaSlot[];
  selectedSlotId: AiTrainingBarrigaSlot["id"] | null;
  outcome: "active" | "scheduled" | "closed";
  turnCount: number;
  lastAction: string;
};

export type AiTrainingBarrigaScriptedTurn = {
  kind: "scripted";
  state: AiTrainingBarrigaLearnedState;
  messages: string[];
  guardrailFlags: string[];
  action: string;
};

const CLINICAL_OR_SAFETY_QUESTION = /\b(?:contraindica|gr[aá]vid|amament|rem[eé]dio|medicamento|doen[cç]a|diagn[oó]stico|risco|segur[oa]|dor|d[oó]i|sess[oõ]es|protocolo|indicado|indica[cç][aã]o|posso fazer|quantos quilos|quanto vou perder|resultado garantido)\b/i;
const PRICE_OR_PAYMENT_QUESTION = /\b(?:pre[cç]o|valor|quanto custa|pagamento|parcel|pix|cart[aã]o)\b/i;
const LOCATION_QUESTION = /\b(?:endere[cç]o|onde fica|localiza[cç][aã]o|qual unidade|rua|bairro)\b/i;
const SCHEDULING_INTENT = /\b(?:agend|agenda|hor[aá]rio|disponibilidade|marcar|avalia[cç][aã]o)\b/i;
const SIMPLE_CONSENT = /^(?:sim|sim\s+por\s+favor|pode|pode\s+sim|quero|quero\s+sim|vamos|claro|ok|beleza|tenho\s+interesse)[!,.\s]*$/i;
const OPT_OUT = /\b(?:n[aã]o tenho interesse|n[aã]o quero|pare de mandar|n[aã]o me chame|remova meu contato|cliquei por engano|foi engano)\b/i;
const ALTERNATIVE_SLOT = /\b(?:nenhum|outro|outra data|outro dia|outro hor[aá]rio|n[aã]o consigo|n[aã]o posso)\b/i;
const FALSE_CONFIRMATION = /\b(?:agendad[oa]|confirmad[oa]|reservad[oa]|marcad[oa])\b/i;
const PROMISE_OR_CLINICAL_CLAIM = /\b(?:garant|resultado certo|vai perder|vai eliminar|vai emagrecer|sem risco|n[aã]o d[oó]i|indicado para voc[eê]|recomendo (?:o|a|esse|essa)|voc[eê] (?:tem|possui) gordura)\b/i;
const UNAPPROVED_FACT = /\bR\$\s*\d|\b(?:rua|avenida|alameda|travessa)\s+[A-ZÀ-Ú]|\b(?:promo[cç][aã]o|desconto)\s+(?:de|por)\s+\d/i;

function dateAtNoonUtc(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
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

function addDays(value: string, amount: number) {
  const date = dateAtNoonUtc(value);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function nextEligibleDate(value: string, minimumDays: number) {
  let candidate = addDays(value, minimumDays);
  while ([0, 6].includes(dateAtNoonUtc(candidate).getUTCDay())) candidate = addDays(candidate, 1);
  return candidate;
}

function slotLabel(date: string, time: string) {
  const label = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "UTC",
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
  }).format(dateAtNoonUtc(date));
  return `${label}, às ${time.slice(0, 2)}h`;
}

export function aiTrainingBarrigaSimulatedSlots(now = new Date()): AiTrainingBarrigaSlot[] {
  const today = saoPauloDate(now);
  const firstDate = nextEligibleDate(today, 2);
  const secondDate = nextEligibleDate(firstDate, 1);
  return [
    { id: "slot-a", date: firstDate, time: "10:00", label: slotLabel(firstDate, "10:00") },
    { id: "slot-b", date: secondDate, time: "15:00", label: slotLabel(secondDate, "15:00") },
  ];
}

export function createAiTrainingBarrigaLearnedState(unit: string, now = new Date()): AiTrainingBarrigaLearnedState {
  if (!AI_TRAINING_BARRIGA_ALLOWED_UNITS.includes(unit as AiTrainingBarrigaUnit)) {
    throw new Error("Unidade indisponível para a IA TESTE");
  }
  return {
    version: AI_TRAINING_BARRIGA_LEARNED_STATE_VERSION,
    runtimeVersion: AI_TRAINING_BARRIGA_LEARNED_RUNTIME,
    playbookVersion: AI_TRAINING_BARRIGA_PLAYBOOK_VERSION,
    unit: unit as AiTrainingBarrigaUnit,
    stage: "discover",
    intent: "other",
    nonClinicalGoal: "",
    simulatedSlots: aiTrainingBarrigaSimulatedSlots(now),
    selectedSlotId: null,
    outcome: "active",
    turnCount: 0,
    lastAction: "created",
  };
}

export function isAiTrainingBarrigaLearnedState(value: unknown): value is AiTrainingBarrigaLearnedState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const state = value as Partial<AiTrainingBarrigaLearnedState>;
  return state.version === AI_TRAINING_BARRIGA_LEARNED_STATE_VERSION
    && state.runtimeVersion === AI_TRAINING_BARRIGA_LEARNED_RUNTIME
    && AI_TRAINING_BARRIGA_ALLOWED_UNITS.includes(state.unit as AiTrainingBarrigaUnit)
    && Array.isArray(state.simulatedSlots);
}

function withTurn(state: AiTrainingBarrigaLearnedState, action: string) {
  return { ...state, turnCount: state.turnCount + 1, lastAction: action };
}

function offerSlots(state: AiTrainingBarrigaLearnedState, now: Date, alternative = false): AiTrainingBarrigaScriptedTurn {
  const simulatedSlots = alternative ? aiTrainingBarrigaSimulatedSlots(new Date(now.getTime() + 7 * 24 * 60 * 60 * 1_000)) : state.simulatedSlots;
  const next = withTurn({ ...state, stage: "offered_slots", intent: "scheduling", simulatedSlots }, alternative ? "offer_alternative_slots" : "offer_slots");
  return {
    kind: "scripted",
    state: next,
    messages: [
      `Tenho duas opções fictícias para testar o fluxo:\n\n1. ${simulatedSlots[0].label}\n2. ${simulatedSlots[1].label}\n\nQual delas fica melhor para você?`,
    ],
    guardrailFlags: ["barriga_learned_simulated_schedule", "barriga_learned_isolated"],
    action: next.lastAction,
  };
}

function selectedSlot(message: string, slots: AiTrainingBarrigaSlot[]) {
  if (/\b(?:primeir[ao]|1[ªºa]?|10\s*h)\b/i.test(message)) return slots[0] || null;
  if (/\b(?:segund[ao]|2[ªºa]?|15\s*h)\b/i.test(message)) return slots[1] || null;
  return slots.find((slot) => message.includes(slot.date) || message.includes(slot.time)) || null;
}

export function resolveAiTrainingBarrigaScriptedTurn(params: {
  state: AiTrainingBarrigaLearnedState;
  latestClientMessage: string;
  now?: Date;
}): AiTrainingBarrigaScriptedTurn | null {
  const message = params.latestClientMessage.trim();
  const now = params.now || new Date();
  const state = structuredClone(params.state);
  if (!message) return null;

  if (state.outcome !== "active") {
    return {
      kind: "scripted",
      state: withTurn(state, "already_closed"),
      messages: ["Esta simulação já foi encerrada. Crie outra conversa para testar um novo atendimento."],
      guardrailFlags: ["barriga_learned_already_closed"],
      action: "already_closed",
    };
  }

  if (OPT_OUT.test(message)) {
    const next = withTurn({ ...state, stage: "closed", outcome: "closed" }, "respect_opt_out");
    return {
      kind: "scripted",
      state: next,
      messages: ["Tudo bem. Vou encerrar esta simulação e não farei novas sugestões de contato."],
      guardrailFlags: ["barriga_learned_opt_out", "barriga_learned_isolated"],
      action: next.lastAction,
    };
  }

  if (state.stage === "offered_slots") {
    const slot = selectedSlot(message, state.simulatedSlots);
    if (slot) {
      const next = withTurn({ ...state, stage: "scheduled", outcome: "scheduled", selectedSlotId: slot.id }, "confirm_simulated_slot");
      return {
        kind: "scripted",
        state: next,
        messages: [`Perfeito — nesta simulação, a avaliação ficou marcada para ${slot.label}, na unidade ${state.unit}. Nenhum agendamento real foi criado.`],
        guardrailFlags: ["barriga_learned_simulated_confirmation", "barriga_learned_no_real_booking"],
        action: next.lastAction,
      };
    }
    if (ALTERNATIVE_SLOT.test(message)) return offerSlots(state, now, true);
  }

  if (CLINICAL_OR_SAFETY_QUESTION.test(message)) {
    const next = withTurn({ ...state, intent: "safety" }, "clinical_handoff");
    return {
      kind: "scripted",
      state: next,
      messages: ["Não tenho conteúdo clínico aprovado para responder isso com segurança. Essa definição precisa ser feita por um profissional na avaliação."],
      guardrailFlags: ["barriga_learned_clinical_block", "barriga_learned_no_current_knowledge"],
      action: next.lastAction,
    };
  }

  if (PRICE_OR_PAYMENT_QUESTION.test(message)) {
    const next = withTurn({ ...state, intent: PRICE_OR_PAYMENT_QUESTION.test(message) && /pagamento|parcel|pix|cart[aã]o/i.test(message) ? "payment" : "price" }, "missing_commercial_fact");
    return {
      kind: "scripted",
      state: next,
      messages: ["Este protótipo não recebeu preços nem condições de pagamento aprovados. Por isso, não vou inventar essa informação."],
      guardrailFlags: ["barriga_learned_missing_price", "barriga_learned_no_current_knowledge"],
      action: next.lastAction,
    };
  }

  if (LOCATION_QUESTION.test(message)) {
    const next = withTurn({ ...state, intent: "location" }, "missing_location_fact");
    return {
      kind: "scripted",
      state: next,
      messages: [`A unidade selecionada nesta simulação é ${state.unit}, mas este protótipo não recebeu um endereço aprovado. Não vou reutilizar a base das outras IAs.`],
      guardrailFlags: ["barriga_learned_missing_location", "barriga_learned_no_current_knowledge"],
      action: next.lastAction,
    };
  }

  const consentAfterInvite = ["invite", "explain_evaluation"].includes(state.stage) && SIMPLE_CONSENT.test(message);
  if (consentAfterInvite || SCHEDULING_INTENT.test(message)) return offerSlots(state, now);
  return null;
}

export function validateAiTrainingBarrigaModelMessages(messages: string[]) {
  const normalized = messages.map((message) => message.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 2);
  const joined = normalized.join("\n\n");
  const flags: string[] = [];
  if (normalized.length === 0) flags.push("empty_response");
  if (joined.length > 650) flags.push("response_too_long");
  if ((joined.match(/\?/g) || []).length > 1) flags.push("multiple_questions");
  if (FALSE_CONFIRMATION.test(joined)) flags.push("false_booking_confirmation");
  if (PROMISE_OR_CLINICAL_CLAIM.test(joined)) flags.push("unsafe_claim");
  if (UNAPPROVED_FACT.test(joined)) flags.push("unapproved_fact");
  return { valid: flags.length === 0, messages: normalized, flags };
}

export function aiTrainingBarrigaFallback(state: AiTrainingBarrigaLearnedState) {
  if (state.stage === "invite" || state.stage === "explain_evaluation") {
    return "A avaliação é o próximo passo para um profissional entender seu objetivo com segurança. Quer que eu mostre duas opções simuladas de horário?";
  }
  return "Entendi. Qual é o principal objetivo que você gostaria de avaliar na região abdominal?";
}

export function aiTrainingBarrigaMessageAudit(params: {
  state: AiTrainingBarrigaLearnedState;
  source: "model" | "scripted" | "fallback";
  action: string;
}) {
  return {
    version: AI_TRAINING_BARRIGA_LEARNED_STATE_VERSION,
    source: params.source,
    barrigaLearned: {
      playbookVersion: params.state.playbookVersion,
      stage: params.state.stage,
      intent: params.state.intent,
      action: params.action,
      unit: params.state.unit,
      outcome: params.state.outcome,
      currentKnowledgeUsed: false,
      realBookingCreated: false,
    },
  };
}
