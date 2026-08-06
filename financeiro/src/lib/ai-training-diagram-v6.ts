export const AI_TRAINING_DIAGRAM_V6_RUNTIME = "diagram-v6";
export const AI_TRAINING_DIAGRAM_V6_STATE_VERSION = "diagram-v6-state-v1";

export type AiTrainingDiagramV6Family = "body" | "facial" | "general";
export type AiTrainingDiagramV6Node =
  | "collect_concern"
  | "qualify_experience"
  | "qualify_experience_origin"
  | "confirm_unit"
  | "schedule_day_type"
  | "schedule_period"
  | "confirm_simulated_slot"
  | "completed";

export type AiTrainingDiagramV6MediaKey =
  | "campaign"
  | "body-proof"
  | "facial-proof"
  | "facial-lips"
  | "facial-under-eyes"
  | "facial-nasolabial"
  | "body-abdomen-before-after"
  | "body-flanks-before-after"
  | "body-back-before-after"
  | "body-arms-before-after"
  | "body-outer-thighs-before-after"
  | "body-glutes-before-after"
  | "facial-lips-before-after"
  | "facial-under-eyes-before-after"
  | "facial-nasolabial-before-after"
  | "facial-forehead-before-after"
  | "facial-glabella-before-after"
  | "facial-crow-feet-before-after";

export type AiTrainingDiagramV6Campaign = {
  id: string;
  name: string;
  unit: string;
  status: string;
  objective: string | null;
  offerItems: Array<{ procedureName: string; includedSessions: number }>;
  creativeId: string | null;
  approvedPriceText: string | null;
};

export type AiTrainingDiagramV6State = {
  version: typeof AI_TRAINING_DIAGRAM_V6_STATE_VERSION;
  runtimeVersion: typeof AI_TRAINING_DIAGRAM_V6_RUNTIME;
  family: AiTrainingDiagramV6Family;
  node: AiTrainingDiagramV6Node;
  crmStatus: "em_atendimento" | "agendado" | "finalizado";
  outcome: "active" | "scheduled" | "finalized";
  finalReason: "scheduled" | "declined" | "no_response" | null;
  campaign: AiTrainingDiagramV6Campaign;
  unitAddress: string;
  qualification: {
    concernArea: "abdomen" | "flanks" | "back" | "arms" | "outer_thighs" | "glutes" | "lips" | "under_eyes" | "nasolabial" | "forehead" | "glabella" | "crow_feet" | "face" | "other" | "unknown";
    concernScope: "single" | "multiple" | "unknown";
    previousExperience: "first_time" | "previous" | "unknown";
    experienceOrigin: "virtuosa" | "other_clinic" | "unknown";
  };
  scheduling: {
    dayType: "weekday" | "saturday" | null;
    period: "morning" | "afternoon" | "evening" | null;
    offeredDate: string | null;
    offeredTime: string | null;
  };
  followUpDay: number;
  lastObjection: "time" | "investment" | "thinking" | "wrong_campaign" | "distance" | "other" | null;
};

export type AiTrainingDiagramV6Message = {
  content: string;
  mediaKey?: AiTrainingDiagramV6MediaKey;
};

export type AiTrainingDiagramV6Turn = {
  kind: "scripted" | "faq";
  messages: AiTrainingDiagramV6Message[];
  state: AiTrainingDiagramV6State;
  guardrailFlags: string[];
  faqQuestion?: string;
  resumePrompt?: string;
};

export function aiTrainingDiagramV6MessageAudit(params: {
  state: AiTrainingDiagramV6State;
  mediaKey?: AiTrainingDiagramV6MediaKey;
  source?: "scripted" | "model";
}) {
  return {
    version: AI_TRAINING_DIAGRAM_V6_STATE_VERSION,
    source: params.source || "scripted",
    diagramV6: {
      node: params.state.node,
      family: params.state.family,
      crmStatus: params.state.crmStatus,
      followUpDay: params.state.followUpDay,
      campaignId: params.state.campaign.id,
      campaignName: params.state.campaign.name,
      mediaKey: params.mediaKey || null,
    },
  };
}

const DEFAULT_OSASCO_ADDRESS = "Rua Eloy Cândido Lopes, 61 - Centro, Osasco";

function normalized(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function campaignText(campaign: AiTrainingDiagramV6Campaign) {
  return normalized([
    campaign.name,
    campaign.objective || "",
    ...campaign.offerItems.map((item) => item.procedureName),
  ].join(" "));
}

export function classifyAiTrainingDiagramV6Campaign(campaign: AiTrainingDiagramV6Campaign): AiTrainingDiagramV6Family {
  const text = campaignText(campaign);
  if (/preench|botox|toxina|olheira|bigode chines|labial|facial|rosto|papada|pele|melasma|skinbooster|bioestimulador/.test(text)) {
    return "facial";
  }
  if (/gordura|barriga|abdomen|flanco|culote|braco|glute|celulite|corporal|crio|drenagem|modeladora|hyper slim|emagrec/.test(text)) {
    return "body";
  }
  return "general";
}

function emptyQualification(): AiTrainingDiagramV6State["qualification"] {
  return {
    concernArea: "unknown",
    concernScope: "unknown",
    previousExperience: "unknown",
    experienceOrigin: "unknown",
  };
}

export function createAiTrainingDiagramV6Simulation(params: {
  campaign: AiTrainingDiagramV6Campaign;
  unitAddress?: string | null;
}) {
  const family = classifyAiTrainingDiagramV6Campaign(params.campaign);
  const state: AiTrainingDiagramV6State = {
    version: AI_TRAINING_DIAGRAM_V6_STATE_VERSION,
    runtimeVersion: AI_TRAINING_DIAGRAM_V6_RUNTIME,
    family,
    node: "collect_concern",
    crmStatus: "em_atendimento",
    outcome: "active",
    finalReason: null,
    campaign: params.campaign,
    unitAddress: params.unitAddress?.trim() || DEFAULT_OSASCO_ADDRESS,
    qualification: emptyQualification(),
    scheduling: {
      dayType: null,
      period: null,
      offeredDate: null,
      offeredTime: null,
    },
    followUpDay: 1,
    lastObjection: null,
  };

  return {
    state,
    messages: [
      { content: "Olá, tudo bem? Sou a assistente virtual da Clínica Virtuosa. Seja bem-vinda 🌷" },
      { content: "Vou dar continuidade ao seu atendimento.", mediaKey: "campaign" as const },
      { content: campaignOpeningQuestion(state) },
    ] satisfies AiTrainingDiagramV6Message[],
  };
}

export function isAiTrainingDiagramV6State(value: unknown): value is AiTrainingDiagramV6State {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<AiTrainingDiagramV6State>;
  return state.version === AI_TRAINING_DIAGRAM_V6_STATE_VERSION
    && state.runtimeVersion === AI_TRAINING_DIAGRAM_V6_RUNTIME
    && !!state.campaign?.id;
}

function facialConcernQuestion(campaign: AiTrainingDiagramV6Campaign) {
  const text = campaignText(campaign);
  if (/preench|labial|olheira|bigode chines/.test(text)) {
    return "Vi seu interesse em preenchimento facial. Qual região mais te incomoda hoje?\n\n1. Lábios\n2. Olheiras\n3. Bigode chinês\n4. Outra região";
  }
  if (/botox|toxina/.test(text)) {
    return "Vi seu interesse em Botox. Qual região mais te incomoda hoje?\n\n1. Testa\n2. Entre as sobrancelhas\n3. Pés de galinha\n4. Outra região";
  }
  return "Vi seu interesse nessa campanha facial. O que mais te incomoda hoje no rosto?";
}

function campaignOpeningQuestion(state: AiTrainingDiagramV6State) {
  if (state.family === "facial") return facialConcernQuestion(state.campaign);
  if (state.family === "body") {
    return `Vi seu interesse na campanha ${state.campaign.name}. O que mais te incomoda hoje?\n\n1. Abdômen\n2. Flancos\n3. Costas\n4. Braços\n5. Culote\n6. Glúteos\n7. Outra região`;
  }
  return `Vi seu interesse na campanha ${state.campaign.name}. Qual é o seu principal objetivo com esse tratamento?`;
}

function experienceQuestion(state: AiTrainingDiagramV6State) {
  return state.family === "general"
    ? "Será a primeira vez realizando esse tipo de tratamento ou você já fez antes?"
    : "Será a primeira vez realizando esse procedimento ou você já fez antes?";
}

function unitQuestion(state: AiTrainingDiagramV6State) {
  return `Nossa unidade fica na ${state.unitAddress}. Você consegue vir até a clínica com facilidade?`;
}

export function aiTrainingDiagramV6PendingPrompt(state: AiTrainingDiagramV6State) {
  switch (state.node) {
    case "collect_concern":
      return campaignOpeningQuestion(state);
    case "qualify_experience":
      return experienceQuestion(state);
    case "qualify_experience_origin":
      return "Você realizou aqui na Virtuosa ou em outra clínica?";
    case "confirm_unit":
      return unitQuestion(state);
    case "schedule_day_type":
      return "Para a simulação, fica melhor durante a semana ou no sábado?";
    case "schedule_period":
      return "Qual período fica melhor: manhã, tarde ou fim do dia?";
    case "confirm_simulated_slot":
      return state.scheduling.offeredDate && state.scheduling.offeredTime
        ? `Posso confirmar apenas na simulação o dia ${formatDate(state.scheduling.offeredDate)} às ${state.scheduling.offeredTime}?`
        : "Posso confirmar esse horário apenas na simulação?";
    case "completed":
      return "";
  }
}

function concernAreaFor(state: AiTrainingDiagramV6State, message: string): AiTrainingDiagramV6State["qualification"]["concernArea"] {
  const text = normalized(message);
  const facialText = campaignText(state.campaign);
  const numberedChoices = state.family === "facial" && /botox|toxina/.test(facialText)
    ? { "1": "forehead", "2": "glabella", "3": "crow_feet", "4": "other" } as const
    : state.family === "facial"
      ? { "1": "lips", "2": "under_eyes", "3": "nasolabial", "4": "other" } as const
      : state.family === "body"
        ? { "1": "abdomen", "2": "flanks", "3": "back", "4": "arms", "5": "outer_thighs", "6": "glutes", "7": "other" } as const
        : null;
  if (numberedChoices) {
    const numberedChoice = (numberedChoices as Partial<Record<string, AiTrainingDiagramV6State["qualification"]["concernArea"]>>)[text];
    if (numberedChoice) return numberedChoice;
  }
  if (/abdomen|barriga/.test(text)) return "abdomen";
  if (/flanco/.test(text)) return "flanks";
  if (/costa/.test(text)) return "back";
  if (/braco/.test(text)) return "arms";
  if (/culote|coxa externa|lateral da coxa/.test(text)) return "outer_thighs";
  if (/glute|bumbum/.test(text)) return "glutes";
  if (/labio|boca/.test(text)) return "lips";
  if (/olheira/.test(text)) return "under_eyes";
  if (/bigode|nasolabial/.test(text)) return "nasolabial";
  if (/testa/.test(text)) return "forehead";
  if (/entre as sobrancelhas|glabela/.test(text)) return "glabella";
  if (/pes? de galinha|canto dos olhos/.test(text)) return "crow_feet";
  if (/rosto|face/.test(text)) return "face";
  return text.length >= 2 ? "other" : "unknown";
}

function concernScopeFor(state: AiTrainingDiagramV6State, message: string): AiTrainingDiagramV6State["qualification"]["concernScope"] {
  const text = normalized(message);
  if (/tud[oa]s?|mais de uma|varias|varios|as duas|os dois|abdomen.*flanco|flanco.*abdomen/.test(text)) return "multiple";
  return concernAreaFor(state, message) === "unknown" ? "unknown" : "single";
}

function previousExperienceFor(message: string): AiTrainingDiagramV6State["qualification"]["previousExperience"] {
  const text = normalized(message);
  if (/primeira|nunca|nao fiz|nao realizei|seria a primeira/.test(text) || /^(?:sim|isso)$/.test(text)) return "first_time";
  if (/ja fiz|ja realizei|fiz antes|outra clinica|na virtuosa|aqui/.test(text) || /^(?:nao|não)$/.test(message.trim().toLowerCase())) return "previous";
  return "unknown";
}

function experienceOriginFor(message: string): AiTrainingDiagramV6State["qualification"]["experienceOrigin"] {
  const text = normalized(message);
  if (/virtuosa|aqui|com voces/.test(text)) return "virtuosa";
  if (/outra|outro lugar|outra clinica|fora/.test(text)) return "other_clinic";
  return "unknown";
}

function dayTypeFor(message: string): AiTrainingDiagramV6State["scheduling"]["dayType"] {
  const text = normalized(message);
  if (/sabado/.test(text)) return "saturday";
  if (/semana|segunda|terca|quarta|quinta|sexta/.test(text)) return "weekday";
  return null;
}

function periodFor(message: string): AiTrainingDiagramV6State["scheduling"]["period"] {
  const text = normalized(message);
  if (/manha/.test(text)) return "morning";
  if (/tarde/.test(text)) return "afternoon";
  if (/noite|fim do dia|final do dia/.test(text)) return "evening";
  return null;
}

function affirmative(message: string) {
  return /^(?:sim|s|pode|pode ser|confirmo|combinado|ok|claro|consigo|tenho|vou|fechado)\b/i.test(normalized(message));
}

function negativeOrStop(message: string) {
  return /\b(?:nao quero|desisti|parar|encerrar|sem interesse|nao tenho interesse)\b/i.test(normalized(message));
}

function looksLikeQuestion(message: string) {
  const text = normalized(message);
  return message.includes("?") || /^(?:como|quanto|qual|quais|quando|onde|porque|por que|tem|voc[eê]s|funciona|posso|pode)/.test(text);
}

function objectionFor(message: string): AiTrainingDiagramV6State["lastObjection"] {
  const text = normalized(message);
  const numberedChoices = {
    "1": "time",
    "2": "investment",
    "3": "thinking",
    "4": "wrong_campaign",
    "5": "distance",
    "6": "other",
  } as const;
  if (text in numberedChoices) return numberedChoices[text as keyof typeof numberedChoices];
  if (/tempo|horario|correria/.test(text)) return "time";
  if (/investimento|dinheiro|cartao|caro|valor/.test(text)) return "investment";
  if (/pensando|vou pensar|nao decidi/.test(text)) return "thinking";
  if (/engano|campanha errada|cliquei sem querer/.test(text)) return "wrong_campaign";
  if (/distancia|longe|moro longe/.test(text)) return "distance";
  return null;
}

function sensitiveQuestion(message: string) {
  return /\b(?:dor forte|complica[cç][aã]o|gr[aá]vid|amament|medicamento|rem[eé]dio|contraindica|diagn[oó]stico|alergia|doen[cç]a)\b/i.test(message);
}

function priceQuestion(message: string) {
  return /\b(?:pre[cç]o|valor|quanto custa|quanto fica|investimento|parcel)\b/i.test(message);
}

function addressQuestion(message: string) {
  return /\b(?:endere[cç]o|onde fica|localiza[cç][aã]o|qual unidade)\b/i.test(message);
}

function mediaForConcern(state: AiTrainingDiagramV6State): AiTrainingDiagramV6MediaKey | null {
  const mediaByConcern: Partial<Record<AiTrainingDiagramV6State["qualification"]["concernArea"], AiTrainingDiagramV6MediaKey>> = {
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
  return mediaByConcern[state.qualification.concernArea] || null;
}

function proofMessage(state: AiTrainingDiagramV6State): AiTrainingDiagramV6Message[] {
  const mediaKey = mediaForConcern(state);
  if (!mediaKey) return [];
  return [{
    content: "Separei um antes e depois fictício, criado por IA exclusivamente para esta simulação. Ele ilustra a região escolhida, mas não representa promessa nem expectativa individual de resultado.",
    mediaKey,
  }];
}

function evaluationSequence(state: AiTrainingDiagramV6State): AiTrainingDiagramV6Message[] {
  return [
    {
      content: "A frequência e a quantidade de sessões dependem da avaliação. A especialista define a estratégia adequada junto com você, sem prometer um resultado antes de conhecer o seu caso.",
    },
    {
      content: "A avaliação presencial ajuda a entender seu objetivo e verificar quais possibilidades são seguras para você.",
    },
    { content: unitQuestion(state) },
  ];
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" })
    .format(new Date(Date.UTC(year, month - 1, day, 15, 0, 0)));
}

function saoPauloDate(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return new Date(`${values.year}-${values.month}-${values.day}T12:00:00-03:00`);
}

function simulatedSlot(dayType: NonNullable<AiTrainingDiagramV6State["scheduling"]["dayType"]>, period: NonNullable<AiTrainingDiagramV6State["scheduling"]["period"]>, now: Date) {
  const date = saoPauloDate(now);
  for (let offset = 1; offset <= 14; offset += 1) {
    const candidate = new Date(date);
    candidate.setDate(candidate.getDate() + offset);
    const weekday = candidate.getDay();
    if ((dayType === "saturday" && weekday === 6) || (dayType === "weekday" && weekday >= 1 && weekday <= 5)) {
      const iso = `${candidate.getFullYear()}-${String(candidate.getMonth() + 1).padStart(2, "0")}-${String(candidate.getDate()).padStart(2, "0")}`;
      const time = period === "morning" ? "10:00" : period === "afternoon" ? "15:00" : "18:00";
      return { date: iso, time };
    }
  }
  throw new Error("Não foi possível criar horário simulado");
}

function faqTurn(state: AiTrainingDiagramV6State, message: string, guardrailFlags: string[] = []): AiTrainingDiagramV6Turn {
  const resumePrompt = aiTrainingDiagramV6PendingPrompt(state);
  if (sensitiveQuestion(message)) {
    return {
      kind: "scripted",
      state,
      guardrailFlags: [...guardrailFlags, "diagram_v6_sensitive_topic"],
      messages: [
        { content: "Esse assunto exige avaliação de uma profissional. Como este é um ambiente de teste, nenhuma pessoa real será acionada por aqui." },
        ...(resumePrompt ? [{ content: resumePrompt }] : []),
      ],
    };
  }
  if (priceQuestion(message)) {
    const price = state.campaign.approvedPriceText;
    return {
      kind: "scripted",
      state,
      guardrailFlags: [...guardrailFlags, "diagram_v6_price_policy"],
      messages: [
        {
          content: price
            ? `O valor aprovado dessa campanha é a partir de ${price}. A condição final depende da avaliação e esta simulação não realiza cobrança.`
            : "Essa campanha não possui um valor aprovado disponível para a IA. A condição precisa ser confirmada após a avaliação e esta simulação não realiza cobrança.",
        },
        ...(resumePrompt ? [{ content: resumePrompt }] : []),
      ],
    };
  }
  if (addressQuestion(message)) {
    return {
      kind: "scripted",
      state,
      guardrailFlags: [...guardrailFlags, "diagram_v6_address_policy"],
      messages: [
        { content: `A unidade desta simulação fica na ${state.unitAddress}.` },
        ...(resumePrompt ? [{ content: resumePrompt }] : []),
      ],
    };
  }
  return {
    kind: "faq",
    state,
    guardrailFlags,
    messages: [],
    faqQuestion: message,
    resumePrompt,
  };
}

export function resolveAiTrainingDiagramV6Turn(params: {
  state: AiTrainingDiagramV6State;
  latestClientMessage: string;
  now?: Date;
}): AiTrainingDiagramV6Turn {
  const message = params.latestClientMessage.trim();
  const state: AiTrainingDiagramV6State = structuredClone(params.state);
  const now = params.now || new Date();

  if (!message) {
    return { kind: "scripted", state, guardrailFlags: [], messages: [{ content: aiTrainingDiagramV6PendingPrompt(state) }] };
  }
  if (state.outcome !== "active") {
    return {
      kind: "scripted",
      state,
      guardrailFlags: ["diagram_v6_already_completed"],
      messages: [{ content: "Esta simulação já foi encerrada. Inicie uma nova conversa para testar outro atendimento." }],
    };
  }
  if (negativeOrStop(message)) {
    state.outcome = "finalized";
    state.crmStatus = "finalizado";
    state.finalReason = "declined";
    state.node = "completed";
    return {
      kind: "scripted",
      state,
      guardrailFlags: ["diagram_v6_declined"],
      messages: [{ content: "Tudo bem. Nesta simulação, o atendimento foi finalizado sem alterar nenhum cadastro real." }],
    };
  }

  const objection = state.followUpDay >= 7 ? objectionFor(message) : null;
  if (objection) {
    state.lastObjection = objection;
    state.followUpDay = 1;
    const labels = {
      time: "Entendo que conciliar o tempo pode ser difícil.",
      investment: "Entendo sua preocupação com o investimento.",
      thinking: "Tudo bem querer pensar com calma.",
      wrong_campaign: "Sem problema. Podemos considerar somente a campanha correta nesta simulação.",
      distance: "Entendo que a distância pode pesar na decisão.",
      other: "Entendo seu ponto.",
    } as const;
    return {
      kind: "scripted",
      state,
      guardrailFlags: ["diagram_v6_objection_resumed"],
      messages: [{ content: labels[objection] }, { content: aiTrainingDiagramV6PendingPrompt(state) }],
    };
  }

  switch (state.node) {
    case "collect_concern": {
      if (looksLikeQuestion(message)) return faqTurn(state, message);
      const concernArea = concernAreaFor(state, message);
      if (concernArea === "unknown") {
        return { kind: "scripted", state, guardrailFlags: ["diagram_v6_concern_clarification"], messages: [{ content: campaignOpeningQuestion(state) }] };
      }
      state.qualification.concernArea = concernArea;
      state.qualification.concernScope = concernScopeFor(state, message);
      state.node = "qualify_experience";
      const acknowledgement = state.qualification.concernScope === "multiple"
        ? "Entendi. Como você citou mais de uma região, a avaliação é importante para organizar as prioridades com segurança."
        : "Entendi. Esse atendimento pode ser direcionado para a região que mais te incomoda, sempre após a avaliação.";
      return {
        kind: "scripted",
        state,
        guardrailFlags: [],
        messages: [{ content: acknowledgement }, { content: experienceQuestion(state) }],
      };
    }
    case "qualify_experience": {
      const previousExperience = previousExperienceFor(message);
      if (previousExperience === "unknown") {
        return looksLikeQuestion(message)
          ? faqTurn(state, message)
          : { kind: "scripted", state, guardrailFlags: ["diagram_v6_experience_clarification"], messages: [{ content: experienceQuestion(state) }] };
      }
      state.qualification.previousExperience = previousExperience;
      if (previousExperience === "previous" && state.family === "body") {
        state.node = "qualify_experience_origin";
        return {
          kind: "scripted",
          state,
          guardrailFlags: [],
          messages: [{ content: "Que bom que você já conhece esse tipo de cuidado. Você realizou aqui na Virtuosa ou em outra clínica?" }],
        };
      }
      state.node = "confirm_unit";
      return {
        kind: "scripted",
        state,
        guardrailFlags: [],
        messages: [
          { content: previousExperience === "first_time" ? "Ótimo. Vamos conduzir essa primeira experiência com informação clara e sem antecipar indicação." : "Que bom que você já conhece esse tipo de cuidado. A reavaliação continua importante antes de qualquer nova indicação." },
          ...proofMessage(state),
          ...evaluationSequence(state),
        ],
      };
    }
    case "qualify_experience_origin": {
      const origin = experienceOriginFor(message);
      if (origin === "unknown") {
        return looksLikeQuestion(message)
          ? faqTurn(state, message)
          : { kind: "scripted", state, guardrailFlags: ["diagram_v6_origin_clarification"], messages: [{ content: "Você realizou aqui na Virtuosa ou em outra clínica?" }] };
      }
      state.qualification.experienceOrigin = origin;
      state.node = "confirm_unit";
      return {
        kind: "scripted",
        state,
        guardrailFlags: [],
        messages: [
          { content: origin === "other_clinic" ? "Entendi. Aqui faremos uma nova avaliação, sem presumir que o protocolo anterior deve ser repetido." : "Que bom ter você de volta. Mesmo assim, faremos uma nova avaliação antes de definir qualquer continuidade." },
          ...proofMessage(state),
          ...evaluationSequence(state),
        ],
      };
    }
    case "confirm_unit": {
      if (!affirmative(message)) {
        return looksLikeQuestion(message)
          ? faqTurn(state, message)
          : { kind: "scripted", state, guardrailFlags: ["diagram_v6_unit_clarification"], messages: [{ content: "Entendi. Como esta simulação representa a unidade de Osasco, você conseguiria vir até esse endereço para uma avaliação?" }] };
      }
      state.node = "schedule_day_type";
      state.followUpDay = 1;
      return {
        kind: "scripted",
        state,
        guardrailFlags: [],
        messages: [
          { content: "Ótimo. Vamos simular o agendamento da sua avaliação? Nenhum horário real será criado." },
          { content: "Para você fica melhor durante a semana ou no sábado?" },
        ],
      };
    }
    case "schedule_day_type": {
      const dayType = dayTypeFor(message);
      if (!dayType) {
        return looksLikeQuestion(message)
          ? faqTurn(state, message)
          : { kind: "scripted", state, guardrailFlags: ["diagram_v6_day_type_clarification"], messages: [{ content: "Para a simulação, fica melhor durante a semana ou no sábado?" }] };
      }
      state.scheduling.dayType = dayType;
      state.node = "schedule_period";
      return { kind: "scripted", state, guardrailFlags: [], messages: [{ content: "Qual período fica melhor: manhã, tarde ou fim do dia?" }] };
    }
    case "schedule_period": {
      const period = periodFor(message);
      if (!period) {
        return looksLikeQuestion(message)
          ? faqTurn(state, message)
          : { kind: "scripted", state, guardrailFlags: ["diagram_v6_period_clarification"], messages: [{ content: "Qual período fica melhor: manhã, tarde ou fim do dia?" }] };
      }
      state.scheduling.period = period;
      const slot = simulatedSlot(state.scheduling.dayType || "weekday", period, now);
      state.scheduling.offeredDate = slot.date;
      state.scheduling.offeredTime = slot.time;
      state.node = "confirm_simulated_slot";
      return {
        kind: "scripted",
        state,
        guardrailFlags: ["diagram_v6_simulated_slot"],
        messages: [{ content: `Posso simular o agendamento para ${formatDate(slot.date)} às ${slot.time}? Esse horário é fictício e não bloqueia a agenda real.` }],
      };
    }
    case "confirm_simulated_slot": {
      if (!state.scheduling.offeredDate || !state.scheduling.offeredTime) {
        state.node = "schedule_period";
        state.scheduling.offeredDate = null;
        state.scheduling.offeredTime = null;
        return {
          kind: "scripted",
          state,
          guardrailFlags: ["diagram_v6_invalid_slot_reset"],
          messages: [{ content: "O horário simulado anterior ficou incompleto. Qual período fica melhor: manhã, tarde ou fim do dia?" }],
        };
      }
      if (!affirmative(message)) {
        const nextDayType = dayTypeFor(message);
        const nextPeriod = periodFor(message);
        if (nextDayType) {
          state.scheduling.dayType = nextDayType;
          state.scheduling.period = null;
          state.scheduling.offeredDate = null;
          state.scheduling.offeredTime = null;
          state.node = "schedule_period";
          return { kind: "scripted", state, guardrailFlags: ["diagram_v6_slot_changed"], messages: [{ content: "Tudo bem. Qual período fica melhor: manhã, tarde ou fim do dia?" }] };
        }
        if (nextPeriod) {
          state.scheduling.period = nextPeriod;
          const slot = simulatedSlot(state.scheduling.dayType || "weekday", nextPeriod, now);
          state.scheduling.offeredDate = slot.date;
          state.scheduling.offeredTime = slot.time;
          return { kind: "scripted", state, guardrailFlags: ["diagram_v6_slot_changed"], messages: [{ content: `Posso simular ${formatDate(slot.date)} às ${slot.time}? Esse horário continua fictício.` }] };
        }
        return looksLikeQuestion(message)
          ? faqTurn(state, message)
          : { kind: "scripted", state, guardrailFlags: ["diagram_v6_slot_clarification"], messages: [{ content: aiTrainingDiagramV6PendingPrompt(state) }] };
      }
      state.outcome = "scheduled";
      state.crmStatus = "agendado";
      state.finalReason = "scheduled";
      state.node = "completed";
      return {
        kind: "scripted",
        state,
        guardrailFlags: ["diagram_v6_simulated_confirmation"],
        messages: [
          { content: `Na simulação, a preferência ficou registrada para ${formatDate(state.scheduling.offeredDate)} às ${state.scheduling.offeredTime}. A agenda real não foi alterada.` },
          { content: "Será um prazer recebê-la. Obrigada e tenha uma excelente semana 🌷" },
        ],
      };
    }
    case "completed":
      return {
        kind: "scripted",
        state,
        guardrailFlags: ["diagram_v6_already_completed"],
        messages: [{ content: "Esta simulação já foi encerrada. Inicie uma nova conversa para testar outro atendimento." }],
      };
  }
}

function followUpMessages(state: AiTrainingDiagramV6State, day: number): AiTrainingDiagramV6Message[] {
  const campaignName = state.campaign.name;
  const pendingPrompt = aiTrainingDiagramV6PendingPrompt(state);
  const resume = (messages: AiTrainingDiagramV6Message[]) => pendingPrompt
    ? [...messages, { content: pendingPrompt }]
    : messages;
  if (day === 2) {
    const mediaKey = mediaForConcern(state);
    return resume([{
      content: `Olá, tudo bem? Você entrou em contato pela campanha ${campaignName}. Esta imagem é apenas ilustrativa para o teste e serve para retomar a conversa de onde ela parou.`,
      ...(mediaKey ? { mediaKey } : {}),
    }]);
  }
  if (day === 3) {
    if (state.node === "collect_concern") {
      return [{ content: campaignOpeningQuestion(state) }];
    }
    return resume([{ content: `Bom dia! Estou retomando sua simulação sobre ${campaignName} exatamente do ponto em que ela parou.` }]);
  }
  if (day === 4) {
    return resume([{ content: `Olá! Ainda não conseguimos continuar sua simulação sobre ${campaignName}. Se fizer sentido, posso retomar o atendimento do ponto pendente.` }]);
  }
  if (day === 5) {
    return resume([{ content: "Olá! A avaliação é o passo seguro para entender seu objetivo antes de qualquer indicação. Vamos retomar a simulação?" }]);
  }
  if (day === 6) {
    return resume([{ content: "Olá! Dar o primeiro passo pode ajudar a transformar uma dúvida em um plano claro, sem promessas. A simulação continua do ponto pendente abaixo." }]);
  }
  return [{ content: "Antes de encerrar esta simulação, o que está impedindo você de continuar hoje?\n\n1. Tempo\n2. Investimento\n3. Ainda estou pensando\n4. Cliquei na campanha por engano\n5. Distância\n6. Outro motivo" }];
}

export function advanceAiTrainingDiagramV6FollowUp(stateValue: AiTrainingDiagramV6State) {
  const state = structuredClone(stateValue);
  if (state.outcome !== "active") throw new Error("A simulação já foi encerrada");
  if (state.followUpDay >= 7) {
    state.outcome = "finalized";
    state.crmStatus = "finalizado";
    state.finalReason = "no_response";
    state.node = "completed";
    return {
      state,
      messages: [{ content: "Simulação finalizada sem resposta após o sétimo contato. Nenhum CRM real foi alterado." }] satisfies AiTrainingDiagramV6Message[],
      guardrailFlags: ["diagram_v6_no_response_finalized"],
    };
  }
  state.followUpDay += 1;
  return {
    state,
    messages: followUpMessages(state, state.followUpDay),
    guardrailFlags: [`diagram_v6_follow_up_day_${state.followUpDay}`],
  };
}
