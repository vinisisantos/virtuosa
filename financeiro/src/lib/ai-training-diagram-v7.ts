import {
  aiPublicSchedulingDateRequestFromMessage,
  aiPublicSchedulingPeriodFromMessage,
  aiPublicSchedulingPreferenceFromMessage,
  aiPublicSchedulingWeekdayFromMessage,
  buildAiPublicSchedulingMessages,
  emptyAiPublicSchedulingState,
  resolveAiPublicSchedulingTurn,
  type AiPublicSchedulingPeriod,
  type AiPublicSchedulingSlot,
  type AiPublicSchedulingState,
  type AiPublicSchedulingWeekday,
} from "#lib/ai-public-scheduling";
import {
  classifyAiTrainingDiagramV6Campaign,
  type AiTrainingDiagramV6Campaign,
  type AiTrainingDiagramV6Family,
  type AiTrainingDiagramV6MediaKey,
} from "#lib/ai-training-diagram-v6";

export const AI_TRAINING_DIAGRAM_V7_RUNTIME = "diagram-v7-hybrid";
export const AI_TRAINING_DIAGRAM_V7_STATE_VERSION = "diagram-v7-state-v1";

export type AiTrainingDiagramV7Node =
  | "collect_concern"
  | "qualify_experience"
  | "qualify_experience_satisfaction"
  | "understand_negative_experience"
  | "confirm_unit"
  | "schedule_day_type"
  | "schedule_period"
  | "confirm_simulated_slot"
  | "completed";

export type AiTrainingDiagramV7State = {
  version: typeof AI_TRAINING_DIAGRAM_V7_STATE_VERSION;
  runtimeVersion: typeof AI_TRAINING_DIAGRAM_V7_RUNTIME;
  family: AiTrainingDiagramV6Family;
  node: AiTrainingDiagramV7Node;
  crmStatus: "em_atendimento" | "agendado" | "finalizado";
  outcome: "active" | "scheduled" | "finalized";
  finalReason: "scheduled" | "declined" | "no_response" | null;
  campaign: AiTrainingDiagramV6Campaign;
  unitAddress: string;
  qualification: {
    concernArea: "abdomen" | "flanks" | "back" | "arms" | "outer_thighs" | "glutes" | "lips" | "under_eyes" | "nasolabial" | "forehead" | "glabella" | "crow_feet" | "face" | "other" | "unknown";
    concernScope: "single" | "multiple" | "unknown";
    previousExperience: "first_time" | "previous" | "unknown";
    previousSatisfaction: "positive" | "negative" | "unknown";
    negativeExperienceReason: "discreet" | "artificial" | "short_duration" | "unresolved" | "other" | "unknown";
  };
  scheduling: AiPublicSchedulingState;
  followUpDay: number;
};

export type AiTrainingDiagramV7Message = {
  content: string;
  mediaKey?: AiTrainingDiagramV6MediaKey;
};

export type AiTrainingDiagramV7Turn = {
  kind: "scripted" | "compose" | "faq";
  state: AiTrainingDiagramV7State;
  messages: AiTrainingDiagramV7Message[];
  guardrailFlags: string[];
  objective?: string;
  compositionInstructions?: string;
  fallbackMessages?: AiTrainingDiagramV7Message[];
  faqQuestion?: string;
  resumePrompt?: string;
};

const DEFAULT_OSASCO_ADDRESS = "Rua Eloy Cândido Lopes, 61 - Centro, Osasco";

function normalized(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

function campaignText(campaign: AiTrainingDiagramV6Campaign) {
  return normalized([campaign.name, campaign.objective || "", ...campaign.offerItems.map((item) => item.procedureName)].join(" "));
}

function isGluteCampaign(campaign: AiTrainingDiagramV6Campaign) {
  return /glute|bumbum/.test(campaignText(campaign));
}

function isAbdominalCampaign(campaign: AiTrainingDiagramV6Campaign) {
  return /barriga trincada|abdomen|abdominal/.test(campaignText(campaign));
}

function isBotoxCampaign(campaign: AiTrainingDiagramV6Campaign) {
  return /botox|toxina/.test(campaignText(campaign));
}

function isFillerCampaign(campaign: AiTrainingDiagramV6Campaign) {
  return /preench|labial|olheira|bigode chines/.test(campaignText(campaign));
}

function concernQuestion(state: AiTrainingDiagramV7State) {
  if (isFillerCampaign(state.campaign)) {
    return "Qual região você gostaria de cuidar?\n\n• lábios\n• olheiras\n• bigode chinês\n• outra região";
  }
  if (isBotoxCampaign(state.campaign)) {
    return "Qual região você gostaria de cuidar?\n\n• testa\n• entre as sobrancelhas\n• pés de galinha\n• mais de uma região";
  }
  if (isGluteCampaign(state.campaign)) {
    return "O que mais te incomoda hoje nessa região?\n\n• depressões laterais (hip dips)\n• assimetria\n• falta de volume e projeção\n• mais de um ponto";
  }
  if (isAbdominalCampaign(state.campaign)) {
    return "O que mais te incomoda hoje na região abdominal?\n\n• barriga\n• flancos\n• definição do contorno\n• mais de um ponto";
  }
  if (state.family === "body") {
    return "Qual região mais te incomoda hoje?\n\n• abdômen\n• flancos\n• costas\n• braços\n• culote\n• outra região";
  }
  return `O que você mais gostaria de melhorar com ${state.campaign.name}?`;
}

function experienceQuestion(state: AiTrainingDiagramV7State) {
  if (isBotoxCampaign(state.campaign)) return "É a sua primeira vez fazendo Botox ou você já fez antes nessa região?";
  return "É a sua primeira vez fazendo esse procedimento ou você já fez antes?";
}

function mediaForConcern(state: AiTrainingDiagramV7State): AiTrainingDiagramV6MediaKey | null {
  const byConcern: Partial<Record<AiTrainingDiagramV7State["qualification"]["concernArea"], AiTrainingDiagramV6MediaKey>> = {
    abdomen: "body-abdomen-before-after",
    flanks: "body-flanks-before-after",
    back: "body-back-before-after",
    arms: "body-arms-before-after",
    outer_thighs: "body-outer-thighs-before-after",
    glutes: "body-glutes-before-after",
    lips: "facial-lips-before-after",
    under_eyes: "facial-under-eyes-before-after",
    nasolabial: "facial-nasolabial-before-after",
    forehead: "facial-forehead-before-after",
    glabella: "facial-glabella-before-after",
    crow_feet: "facial-crow-feet-before-after",
  };
  return byConcern[state.qualification.concernArea] || null;
}

export function createAiTrainingDiagramV7Simulation(params: {
  campaign: AiTrainingDiagramV6Campaign;
  unitAddress?: string | null;
}) {
  const state: AiTrainingDiagramV7State = {
    version: AI_TRAINING_DIAGRAM_V7_STATE_VERSION,
    runtimeVersion: AI_TRAINING_DIAGRAM_V7_RUNTIME,
    family: classifyAiTrainingDiagramV6Campaign(params.campaign),
    node: "collect_concern",
    crmStatus: "em_atendimento",
    outcome: "active",
    finalReason: null,
    campaign: params.campaign,
    unitAddress: params.unitAddress?.trim() || DEFAULT_OSASCO_ADDRESS,
    qualification: {
      concernArea: "unknown",
      concernScope: "unknown",
      previousExperience: "unknown",
      previousSatisfaction: "unknown",
      negativeExperienceReason: "unknown",
    },
    scheduling: emptyAiPublicSchedulingState(),
    followUpDay: 1,
  };
  return {
    state,
    messages: [
      { content: "Oi! Tudo bem? Sou a assistente virtual da Clínica Virtuosa 😊" },
      { content: `Vi que você se interessou pela campanha ${state.campaign.name}.`, mediaKey: "campaign" as const },
      { content: concernQuestion(state) },
    ] satisfies AiTrainingDiagramV7Message[],
  };
}

export function isAiTrainingDiagramV7State(value: unknown): value is AiTrainingDiagramV7State {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const state = value as Partial<AiTrainingDiagramV7State>;
  return state.version === AI_TRAINING_DIAGRAM_V7_STATE_VERSION
    && state.runtimeVersion === AI_TRAINING_DIAGRAM_V7_RUNTIME
    && !!state.campaign?.id;
}

export function aiTrainingDiagramV7MessageAudit(params: {
  state: AiTrainingDiagramV7State;
  mediaKey?: AiTrainingDiagramV6MediaKey;
  source?: "scripted" | "model";
  objective?: string;
}) {
  return {
    version: AI_TRAINING_DIAGRAM_V7_STATE_VERSION,
    source: params.source || "scripted",
    diagramV7: {
      node: params.state.node,
      family: params.state.family,
      crmStatus: params.state.crmStatus,
      followUpDay: params.state.followUpDay,
      campaignId: params.state.campaign.id,
      campaignName: params.state.campaign.name,
      mediaKey: params.mediaKey || null,
      objective: params.objective || null,
    },
  };
}

function concernAreaFor(state: AiTrainingDiagramV7State, message: string): AiTrainingDiagramV7State["qualification"]["concernArea"] {
  const text = normalized(message);
  if (isGluteCampaign(state.campaign) && /tud|mais de um|hip dip|assimetr|volume|projec|glute|bumbum/.test(text)) return "glutes";
  if (isAbdominalCampaign(state.campaign) && /tud|mais de um|contorno|abdomen|barriga|flanco/.test(text)) {
    return /flanco/.test(text) && !/abdomen|barriga|tud|mais de um/.test(text) ? "flanks" : "abdomen";
  }
  if (/abdomen|barriga/.test(text)) return "abdomen";
  if (/flanco/.test(text)) return "flanks";
  if (/costa/.test(text)) return "back";
  if (/braco/.test(text)) return "arms";
  if (/culote|coxa externa/.test(text)) return "outer_thighs";
  if (/glute|bumbum|hip dip|assimetr|projec/.test(text)) return "glutes";
  if (/labio|boca/.test(text)) return "lips";
  if (/olheira/.test(text)) return "under_eyes";
  if (/bigode|nasolabial/.test(text)) return "nasolabial";
  if (/testa/.test(text)) return "forehead";
  if (/sobrancelha|glabela/.test(text)) return "glabella";
  if (/pes? de galinha|canto dos olhos/.test(text)) return "crow_feet";
  if (/rosto|face/.test(text)) return "face";
  return text.length >= 2 ? "other" : "unknown";
}

function concernScopeFor(message: string) {
  return /tud[oa]s?|mais de um|varias|varios|as duas|os dois|abdomen.*flanco|flanco.*abdomen/i.test(normalized(message))
    ? "multiple" as const
    : "single" as const;
}

function previousExperienceFor(message: string): AiTrainingDiagramV7State["qualification"]["previousExperience"] {
  const text = normalized(message);
  if (/nao (?:e|seria) (?:a )?minha primeira|nao e primeira|ja fiz|ja realizei|fiz antes|tenho experiencia|outra clinica|na virtuosa/.test(text) || /^(?:nao)$/.test(text)) return "previous";
  if (/primeira|nunca|nao fiz|nao realizei|seria a primeira/.test(text) || /^(?:sim|isso)$/.test(text)) return "first_time";
  return "unknown";
}

function satisfactionFor(message: string): AiTrainingDiagramV7State["qualification"]["previousSatisfaction"] {
  const text = normalized(message);
  if (/nao gostei|nao curti|ruim|insatisfeit|decepcion|nao ficou|durou pouco|artificial/.test(text)) return "negative";
  if (/gostei|adorei|otim|boa experiencia|satisfeit|ficou bom|sim gostei/.test(text) || /^(?:sim|gostei|foi boa)$/.test(text)) return "positive";
  return "unknown";
}

function negativeReasonFor(message: string): AiTrainingDiagramV7State["qualification"]["negativeExperienceReason"] {
  const text = normalized(message);
  if (/discret|fraco|pouco resultado/.test(text)) return "discreet";
  if (/artificial|exagerad/.test(text)) return "artificial";
  if (/durou|duracao|pouco tempo/.test(text)) return "short_duration";
  if (/nao resolveu|nao mudou|nao funcion/.test(text)) return "unresolved";
  return text.length >= 2 ? "other" : "unknown";
}

function affirmative(message: string) {
  return /^(?:sim|sou sim|s|pode|pode ser|confirmo|combinado|ok|claro|consigo|tenho|vou|vamos|bora|fechado)\b/i.test(normalized(message));
}

function negativeOrStop(message: string) {
  const text = normalized(message);
  return /^(?:desisti|quero parar|pode parar|pode encerrar|encerra|sem interesse|nao tenho interesse|nao quero mais|nao quero continuar)(?: por enquanto)?[.! ]*$/.test(text)
    || /\bnao tenho interesse (?:nisso|na campanha|no procedimento|em continuar)\b/.test(text);
}

function looksLikeQuestion(message: string) {
  const text = normalized(message);
  return message.includes("?") || /^(?:como|quanto|qual|quais|quando|onde|porque|por que|tem|voces|funciona|posso|pode|quero saber)/.test(text);
}

function priceQuestion(message: string) {
  return /\b(?:pre[cç]o|valor|quanto custa|quanto fica|investimento|parcel)\b/i.test(message);
}

function addressQuestion(message: string) {
  return /\b(?:endere[cç]o|onde fica|localiza[cç][aã]o|qual unidade)\b/i.test(message);
}

function sensitiveQuestion(message: string) {
  return /\b(?:dor forte|complica[cç][aã]o|gr[aá]vid|amament|medicamento|rem[eé]dio|contraindica|diagn[oó]stico|alergia|doen[cç]a)\b/i.test(message);
}

export function aiTrainingDiagramV7PendingPrompt(state: AiTrainingDiagramV7State) {
  switch (state.node) {
    case "collect_concern": return concernQuestion(state);
    case "qualify_experience": return experienceQuestion(state);
    case "qualify_experience_satisfaction": return "E como foi sua última experiência: você gostou do resultado?";
    case "understand_negative_experience": return "O que mais te incomodou no resultado?\n\n• ficou muito discreto\n• ficou artificial\n• durou menos do que você esperava\n• não resolveu o que você queria\n• outro motivo";
    case "confirm_unit": return `A unidade fica na ${state.unitAddress}. Você consegue comparecer lá?`;
    case "schedule_day_type": return "Para você fica melhor durante a semana ou no sábado?";
    case "schedule_period": return "E qual período fica melhor para você: manhã ou tarde?";
    case "confirm_simulated_slot": return buildAiPublicSchedulingMessages({ active: true, state: state.scheduling })?.[0] || "Qual horário fica melhor para você?";
    case "completed": return "";
  }
}

function faqTurn(state: AiTrainingDiagramV7State, message: string): AiTrainingDiagramV7Turn {
  const resumePrompt = aiTrainingDiagramV7PendingPrompt(state);
  if (sensitiveQuestion(message)) {
    return {
      kind: "scripted",
      state,
      messages: [
        { content: "Essa questão precisa de avaliação profissional. Como este ambiente é apenas uma simulação, nenhuma pessoa real será acionada por aqui." },
        ...(resumePrompt ? [{ content: resumePrompt }] : []),
      ],
      guardrailFlags: ["diagram_v7_sensitive_topic"],
    };
  }
  if (priceQuestion(message)) {
    const price = state.campaign.approvedPriceText;
    return {
      kind: "scripted",
      state,
      messages: [
        { content: price ? `O valor aprovado da campanha é a partir de ${price}. A condição final depende da avaliação e esta simulação não realiza cobrança.` : "Não há um valor aprovado disponível para esta campanha. A condição é definida após a avaliação e esta simulação não realiza cobrança." },
        ...(resumePrompt ? [{ content: resumePrompt }] : []),
      ],
      guardrailFlags: ["diagram_v7_price_policy"],
    };
  }
  if (addressQuestion(message)) {
    return {
      kind: "scripted",
      state,
      messages: [{ content: `A unidade desta simulação fica na ${state.unitAddress}.` }, ...(resumePrompt ? [{ content: resumePrompt }] : [])],
      guardrailFlags: ["diagram_v7_address_policy"],
    };
  }
  return { kind: "faq", state, messages: [], guardrailFlags: [], faqQuestion: message, resumePrompt };
}

function composeTurn(params: {
  state: AiTrainingDiagramV7State;
  objective: string;
  instructions: string;
  fallback: AiTrainingDiagramV7Message[];
  mediaKey?: AiTrainingDiagramV6MediaKey | null;
}): AiTrainingDiagramV7Turn {
  const fallback = params.fallback.map((message, index) => index === 0 && params.mediaKey ? { ...message, mediaKey: params.mediaKey } : message);
  return {
    kind: "compose",
    state: params.state,
    messages: [],
    guardrailFlags: ["diagram_v7_objective_director"],
    objective: params.objective,
    compositionInstructions: params.instructions,
    fallbackMessages: fallback,
  };
}

function dateAtNoonUtc(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

function todayInSaoPaulo(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function addDays(date: string, amount: number) {
  const next = dateAtNoonUtc(date);
  next.setUTCDate(next.getUTCDate() + amount);
  return next.toISOString().slice(0, 10);
}

function simulatedAvailability(params: {
  preference: AiPublicSchedulingState["preference"];
  period: AiPublicSchedulingPeriod;
  requestedWeekday: AiPublicSchedulingWeekday | null;
  requestedDate: string | null;
  requestedDateMode: AiPublicSchedulingState["requestedDateMode"];
  now: Date;
}): AiPublicSchedulingSlot[] {
  const times = params.period === "morning" ? ["10:00", "12:00"] : params.period === "afternoon" ? ["15:00", "17:00"] : ["17:00", "19:00"];
  const today = todayInSaoPaulo(params.now);
  const exactDate = params.requestedDateMode === "exact" ? params.requestedDate : null;
  const start = exactDate || params.requestedDate || addDays(today, 1);
  for (let offset = 0; offset <= 90; offset += 1) {
    const date = addDays(start, offset);
    const weekday = dateAtNoonUtc(date).getUTCDay();
    if (params.requestedWeekday != null && weekday !== params.requestedWeekday) continue;
    if (params.requestedWeekday == null && params.preference === "saturday" && weekday !== 6) continue;
    if (params.requestedWeekday == null && params.preference === "weekday" && (weekday < 1 || weekday > 5)) continue;
    return times.map((time) => ({ date, time }));
  }
  return [];
}

function schedulingMessageWithoutNegatedPreference(message: string) {
  const text = normalized(message);
  if (/nao (?:quero|posso|consigo)(?: ir)? (?:no )?sabado/.test(text) && /semana|segunda|terca|quarta|quinta|sexta/.test(text)) {
    return "durante a semana";
  }
  if (/nao (?:quero|posso|consigo)(?: ir)? durante a semana/.test(text) && /sabado/.test(text)) {
    return "sábado";
  }
  if (/fim do dia|final do dia|a noite|noite/.test(text)) {
    return "tarde";
  }
  return message;
}

function resolveScheduling(state: AiTrainingDiagramV7State, message: string, now: Date) {
  const effectiveMessage = schedulingMessageWithoutNegatedPreference(message);
  const previous = state.scheduling.period === "evening"
    ? { ...state.scheduling, period: "afternoon" as const }
    : state.scheduling;
  const preliminary = resolveAiPublicSchedulingTurn({ previous, latestClientMessage: effectiveMessage, forceScheduling: true, now });
  const scheduling = preliminary.state;
  const shouldOffer = scheduling.preference !== "unknown" && scheduling.period !== "unknown"
    && !["awaiting_confirmation", "confirmed", "clarifying_date"].includes(state.scheduling.status);
  const alternativeRequested = state.scheduling.status === "awaiting_confirmation"
    && (aiPublicSchedulingWeekdayFromMessage(effectiveMessage) != null || aiPublicSchedulingDateRequestFromMessage(effectiveMessage, now).kind === "resolved" || /outro|mais cedo|mais tarde|nao tem/i.test(normalized(effectiveMessage)));
  if (!shouldOffer && !alternativeRequested) return preliminary;
  const slots = simulatedAvailability({
    preference: scheduling.preference,
    period: scheduling.period,
    requestedWeekday: scheduling.requestedWeekday,
    requestedDate: scheduling.requestedDate,
    requestedDateMode: scheduling.requestedDateMode,
    now,
  });
  return resolveAiPublicSchedulingTurn({ previous: state.scheduling, latestClientMessage: effectiveMessage, availableSlots: slots, forceScheduling: true, now });
}

export function resolveAiTrainingDiagramV7Turn(params: {
  state: AiTrainingDiagramV7State;
  latestClientMessage: string;
  now?: Date;
}): AiTrainingDiagramV7Turn {
  const message = params.latestClientMessage.trim();
  const state: AiTrainingDiagramV7State = structuredClone(params.state);
  const now = params.now || new Date();
  if (!message) return { kind: "scripted", state, messages: [{ content: aiTrainingDiagramV7PendingPrompt(state) }], guardrailFlags: [] };
  if (state.outcome !== "active") return { kind: "scripted", state, messages: [{ content: "Esta simulação já foi encerrada. Inicie outra conversa para testar um novo atendimento." }], guardrailFlags: ["diagram_v7_already_completed"] };
  if (negativeOrStop(message)) {
    state.node = "completed";
    state.outcome = "finalized";
    state.crmStatus = "finalizado";
    state.finalReason = "declined";
    return { kind: "scripted", state, messages: [{ content: "Tudo bem. O atendimento foi encerrado somente nesta simulação, sem alterar nenhum cadastro real." }], guardrailFlags: ["diagram_v7_declined"] };
  }

  switch (state.node) {
    case "collect_concern": {
      if (looksLikeQuestion(message)) return faqTurn(state, message);
      const concernArea = concernAreaFor(state, message);
      if (concernArea === "unknown") return { kind: "scripted", state, messages: [{ content: concernQuestion(state) }], guardrailFlags: ["diagram_v7_concern_clarification"] };
      state.qualification.concernArea = concernArea;
      state.qualification.concernScope = concernScopeFor(message);
      state.node = "qualify_experience";
      return composeTurn({
        state,
        objective: "acolher_sem_repetir_e_qualificar_experiencia",
        instructions: `Use apenas duas frases curtas. Acolha sem repetir literalmente a região e diga de forma natural que ela é bastante procurada na clínica. Não explique avaliação, estratégia, profissional ou aspectos clínicos neste momento. Termine perguntando exatamente o sentido de: ${experienceQuestion(state)}`,
        fallback: [{ content: `Entendi. Essa é uma região bem procurada aqui na clínica. ${experienceQuestion(state)}` }],
      });
    }
    case "qualify_experience": {
      const experience = previousExperienceFor(message);
      if (experience === "unknown") return looksLikeQuestion(message) ? faqTurn(state, message) : { kind: "scripted", state, messages: [{ content: experienceQuestion(state) }], guardrailFlags: ["diagram_v7_experience_clarification"] };
      state.qualification.previousExperience = experience;
      if (experience === "previous") {
        state.node = "qualify_experience_satisfaction";
        return composeTurn({
          state,
          objective: "qualificar_satisfacao_anterior",
          instructions: "Reconheça brevemente a experiência anterior. Faça uma única pergunta para saber se a pessoa gostou da experiência e do resultado. Nunca pergunte em qual clínica foi.",
          fallback: [{ content: "Que legal, então você já conhece esse tipo de cuidado. E como foi sua última experiência: você gostou do resultado?" }],
        });
      }
      state.node = "confirm_unit";
      const proof = mediaForConcern(state);
      return composeTurn({
        state,
        objective: proof ? "acolher_primeira_experiencia_com_prova_e_confirmar_unidade" : "acolher_primeira_experiencia_e_confirmar_unidade",
        instructions: proof
          ? `Use exatamente duas bolhas. Na primeira, acolha de forma calorosa a primeira experiência e diga que será um prazer fazer parte dela. Avise que a imagem acima é um exemplo ilustrativo criado para esta simulação do tipo de resultado buscado nessa região. Não diga que é resultado real de uma cliente, pois a imagem é fictícia. Não explique avaliação nem estratégia ainda. Na segunda, informe o endereço ${state.unitAddress} e pergunte somente se vamos seguir para agendar a avaliação.`
          : `Use exatamente duas bolhas. Na primeira, acolha de forma calorosa a primeira experiência e diga que será um prazer fazer parte dela, sem mencionar imagem ou resultado. Não explique avaliação nem estratégia ainda. Na segunda, informe o endereço ${state.unitAddress} e pergunte somente se vamos seguir para agendar a avaliação.`,
        fallback: [
          { content: proof
            ? "Legal que é a sua primeira vez, e vai ser um prazer fazer parte dessa experiência. Acima estou enviando um exemplo ilustrativo, criado para esta simulação, do tipo de resultado buscado nessa região."
            : "Legal que é a sua primeira vez, e vai ser um prazer fazer parte dessa experiência." },
          { content: `A unidade fica na ${state.unitAddress}.\n\nVamos seguir para agendar sua avaliação?` },
        ],
        mediaKey: proof,
      });
    }
    case "qualify_experience_satisfaction": {
      const satisfaction = satisfactionFor(message);
      if (satisfaction === "unknown") return looksLikeQuestion(message) ? faqTurn(state, message) : { kind: "scripted", state, messages: [{ content: "E como foi sua última experiência: você gostou do resultado?" }], guardrailFlags: ["diagram_v7_satisfaction_clarification"] };
      state.qualification.previousSatisfaction = satisfaction;
      if (satisfaction === "negative") {
        state.node = "understand_negative_experience";
        return composeTurn({
          state,
          objective: "entender_insatisfacao_anterior",
          instructions: "Demonstre empatia e agradeça por compartilhar. Faça só uma pergunta sobre o que mais incomodou. Facilite a resposta com: resultado discreto, artificial, curta duração, não resolveu o objetivo ou outro motivo.",
          fallback: [{ content: "Entendo, obrigada por compartilhar isso comigo 😊\n\nO que mais te incomodou?\n\n• o resultado ficou muito discreto\n• ficou artificial\n• durou menos do que você esperava\n• não resolveu o que você queria\n• outro motivo" }],
        });
      }
      state.node = "confirm_unit";
      const positiveProof = mediaForConcern(state);
      return composeTurn({
        state,
        objective: positiveProof ? "reafirmar_experiencia_positiva_com_prova_e_confirmar_unidade" : "reafirmar_experiencia_positiva_e_confirmar_unidade",
        instructions: positiveProof
          ? `Use duas bolhas. Reconheça a experiência positiva sem garantir resultado e diga que a equipe cuidará para que a experiência na Virtuosa também seja positiva. Apresente a imagem apenas como exemplo ilustrativo criado para a simulação, nunca como resultado real de cliente. Na segunda, informe ${state.unitAddress} e pergunte somente se vamos seguir para agendar a reavaliação.`
          : `Use duas bolhas. Reconheça a experiência positiva sem garantir resultado e diga que a equipe cuidará para que a experiência na Virtuosa também seja positiva, sem mencionar imagem. Na segunda, informe ${state.unitAddress} e pergunte somente se vamos seguir para agendar a reavaliação.`,
        fallback: [{ content: positiveProof
          ? "Que bom que sua experiência foi positiva. Nossa equipe vai cuidar para que você também tenha uma ótima experiência com a Virtuosa. Acima está um exemplo ilustrativo criado para esta simulação."
          : "Que bom que sua experiência foi positiva. Nossa equipe vai cuidar para que você também tenha uma ótima experiência com a Virtuosa." }, { content: `A unidade fica na ${state.unitAddress}.\n\nVamos seguir para agendar sua reavaliação?` }],
        mediaKey: positiveProof,
      });
    }
    case "understand_negative_experience": {
      const reason = negativeReasonFor(message);
      if (reason === "unknown") return { kind: "scripted", state, messages: [{ content: aiTrainingDiagramV7PendingPrompt(state) }], guardrailFlags: ["diagram_v7_negative_reason_clarification"] };
      state.qualification.negativeExperienceReason = reason;
      state.node = "confirm_unit";
      return composeTurn({
        state,
        objective: "acolher_insatisfacao_e_conduzir_avaliacao",
        instructions: `Use duas bolhas. Acolha a resposta sem repetir as palavras do cliente. Explique em linguagem geral que diferentes fatores podem influenciar o resultado e que nossa especialista avalia o caso para definir a estratégia junto com a pessoa. Não ofereça handoff. Na segunda, informe ${state.unitAddress} e pergunte somente se vamos seguir para agendar a avaliação.`,
        fallback: [{ content: "Entendo. Alguns fatores podem influenciar o resultado, e a avaliação permite que nossa especialista analise seu caso e defina com você a melhor estratégia para o que procura." }, { content: `A unidade fica na ${state.unitAddress}.\n\nVamos seguir para agendar sua avaliação?` }],
      });
    }
    case "confirm_unit": {
      if (!affirmative(message)) return looksLikeQuestion(message) ? faqTurn(state, message) : { kind: "scripted", state, messages: [{ content: `Esta simulação representa a unidade de Osasco, na ${state.unitAddress}. Você conseguiria vir até esse endereço para uma avaliação?` }], guardrailFlags: ["diagram_v7_unit_clarification"] };
      state.node = "schedule_day_type";
      return {
        kind: "scripted",
        state,
        messages: [{ content: "Para você fica melhor durante a semana ou no sábado?" }],
        guardrailFlags: ["diagram_v7_direct_schedule_day_type"],
      };
    }
    case "schedule_day_type":
    case "schedule_period":
    case "confirm_simulated_slot": {
      const scheduling = resolveScheduling(state, message, now);
      state.scheduling = scheduling.state;
      if (scheduling.state.status === "collecting_day_type") state.node = "schedule_day_type";
      else if (scheduling.state.status === "collecting_period" || scheduling.state.status === "clarifying_date") state.node = "schedule_period";
      else if (scheduling.state.status === "awaiting_confirmation") state.node = "confirm_simulated_slot";
      else if (scheduling.state.status === "confirmed") {
        state.node = "completed";
        state.outcome = "scheduled";
        state.crmStatus = "agendado";
        state.finalReason = "scheduled";
      } else if (scheduling.state.status === "declined") {
        state.node = scheduling.state.reason === "reschedule_requested" ? "schedule_day_type" : "completed";
        if (scheduling.state.reason === "cancelled_by_client") {
          state.outcome = "finalized";
          state.crmStatus = "finalizado";
          state.finalReason = "declined";
        }
      }
      const schedulingMessages = scheduling.state.status === "collecting_period" && scheduling.state.reason !== "no_availability"
        ? ["E qual período fica melhor para você: manhã ou tarde?"]
        : buildAiPublicSchedulingMessages(scheduling);
      return {
        kind: "scripted",
        state,
        messages: schedulingMessages
          ? schedulingMessages.map((content) => ({ content }))
          : [{ content: aiTrainingDiagramV7PendingPrompt(state) }],
        guardrailFlags: ["diagram_v7_deterministic_scheduling", "public_test_isolated"],
      };
    }
    case "completed":
      return { kind: "scripted", state, messages: [{ content: "Esta simulação já foi encerrada." }], guardrailFlags: ["diagram_v7_already_completed"] };
  }
}

export function advanceAiTrainingDiagramV7FollowUp(stateValue: AiTrainingDiagramV7State) {
  const state: AiTrainingDiagramV7State = structuredClone(stateValue);
  if (state.outcome !== "active") return { state, messages: [{ content: "A simulação já foi encerrada." }], guardrailFlags: ["diagram_v7_follow_up_after_close"] };
  const nextDay = Math.min(7, state.followUpDay + 1);
  state.followUpDay = nextDay;
  if (nextDay === 7) {
    state.outcome = "finalized";
    state.crmStatus = "finalizado";
    state.finalReason = "no_response";
    state.node = "completed";
    return { state, messages: [{ content: "Simulação finalizada sem resposta após o sétimo contato. Nenhum CRM real foi alterado." }], guardrailFlags: ["diagram_v7_follow_up_closed"] };
  }
  const openings = [
    "Oi! Passando para saber se ficou alguma dúvida 😊",
    "Conseguiu pensar um pouco sobre a avaliação?",
    "Se ainda fizer sentido para você, posso continuar exatamente de onde paramos.",
    "Quero facilitar seu próximo passo sem te fazer repetir nada.",
    "Ainda posso te ajudar a encontrar uma opção que funcione para sua rotina.",
  ];
  return {
    state,
    messages: [{ content: openings[Math.max(0, nextDay - 2)] }, ...(aiTrainingDiagramV7PendingPrompt(state) ? [{ content: aiTrainingDiagramV7PendingPrompt(state) }] : [])],
    guardrailFlags: ["diagram_v7_manual_follow_up"],
  };
}

export function aiTrainingDiagramV7SchedulingHints(message: string) {
  return {
    preference: aiPublicSchedulingPreferenceFromMessage(message),
    period: aiPublicSchedulingPeriodFromMessage(message),
    weekday: aiPublicSchedulingWeekdayFromMessage(message),
  };
}
