export type AiPublicResponseCampaignItem = {
  name: string;
  quantity: number | null;
  quantityText: string | null;
};

export type AiPublicResponseTechnicalItem = {
  name: string;
  technicalName: string;
};

export type AiPublicResponsePolicy = {
  styleVersion: "campaign-conversation-v3";
  technicalNamesAllowed: boolean;
  detailedBreakdownRequested: boolean;
  mentionOutcomeCaveat: boolean;
  priceDiscussionAllowed: boolean;
  preferredMessageCount: number;
  maximumMessageCount: number;
  targetWordRange: string;
  maximumCharactersPerMessage: number;
  maximumWordsTotal: number;
  questionsAllowed: number;
  requireQuestionAtEnd: boolean;
  simulatedSchedulingAllowed: boolean;
  simulatedSchedulingStatus: string;
  simulatedSchedulingDate: string | null;
  simulatedSchedulingTime: string | null;
  requiredCampaignItems: AiPublicResponseCampaignItem[];
  forbiddenTechnicalTerms: string[];
};

const PRICE_TOPIC = /\b(?:pre[cç]os?|valores?|custos?|quanto\s+(?:custa|fica|sai)|or[cç]amento|investimento)\b/i;

export type AiPublicResponseDraft = {
  decision: string;
  messages: string[];
};

export type AiPublicResponseValidation = {
  hardErrors: string[];
  styleFindings: string[];
};

function questionAtEnd(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return text;

  const lastQuestionMark = trimmed.lastIndexOf("?");
  if (lastQuestionMark < 0) {
    return `${trimmed}\n\nVocê prefere continuar tirando dúvidas ou falar com a especialista?`;
  }

  const beforeQuestionMark = trimmed.slice(0, lastQuestionMark).replace(/\?/g, ".");
  const afterQuestionMark = trimmed.slice(lastQuestionMark + 1).replace(/\?/g, ".").trim();
  if (!afterQuestionMark) return `${beforeQuestionMark}?`;

  const sentenceBoundaries = [...beforeQuestionMark.matchAll(/[.!]\s+|\n+/g)];
  const lastBoundary = sentenceBoundaries.at(-1);
  const questionStart = lastBoundary
    ? (lastBoundary.index || 0) + lastBoundary[0].length
    : 0;
  const introduction = beforeQuestionMark.slice(0, questionStart).trim();
  const question = beforeQuestionMark.slice(questionStart).trim();
  const precedingText = [introduction, afterQuestionMark].filter(Boolean).join("\n\n");

  return [precedingText, question ? `${question}?` : null].filter(Boolean).join("\n\n");
}

function removeUnconfirmedPriceDiscussion(text: string) {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => (paragraph.match(/[^.!?]+[.!?]?/g) || [])
      .map((sentence) => sentence.trim())
      .filter((sentence) => sentence && !PRICE_TOPIC.test(sentence))
      .join(" "))
    .filter(Boolean);

  return paragraphs.join("\n\n");
}

export function normalizeAiPublicResponseDraftForDelivery<T extends AiPublicResponseDraft>(
  draft: T,
  policy: AiPublicResponsePolicy,
): T {
  const messages = draft.messages
    .map((message) => policy.priceDiscussionAllowed
      ? message.trim()
      : removeUnconfirmedPriceDiscussion(message))
    .filter(Boolean);
  const mergedMessages = messages.length > policy.maximumMessageCount
    ? [messages.join("\n\n")]
    : messages;
  const normalizedMessages = policy.requireQuestionAtEnd && mergedMessages.length > 0
    ? [questionAtEnd(mergedMessages.join("\n\n"))]
    : mergedMessages;

  return {
    ...draft,
    messages: normalizedMessages,
  };
}

const TECHNICAL_DETAIL_INTENT = /\b(?:aparelho|equipamento|m[aá]quina|tecnologia|nome\s+t[eé]cnico|qual\s+(?:voc[eê]s\s+)?(?:usam|utilizam))\b/i;
const DETAILED_BREAKDOWN_INTENT = /\b(?:item\s+por\s+item|cada\s+(?:item|procedimento)|explique\s+(?:os\s+)?(?:tr[eê]s|3)|detalh(?:e|ar|es))\b/i;
const OUTCOME_CAVEAT_INTENT = /\b(?:emagrec(?:e|er|imento)|resultado|resolve|perd(?:er|e).{0,24}(?:peso|quilo|kg|cent[ií]metro|cm|medida)|quant(?:o|os|a|as).{0,18}(?:quilo|kg|cent[ií]metro|cm|medida)|substitu(?:i|ir).{0,24}(?:dieta|alimenta[cç][aã]o|exerc[ií]cio)|sem\s+(?:dieta|alimenta[cç][aã]o|exerc[ií]cio))\b/i;
const CAMPAIGN_OVERVIEW_INTENT = /\b(?:saber|entender|conhecer|explica|explicar|explique|explica[cç][aã]o|como\s+funciona|o\s+que\s+[eé]|mais\s+informa[cç][oõ]es)\b/i;
const GREETING_ONLY = /^(?:oi|ol[aá]|bom\s+dia|boa\s+tarde|boa\s+noite|opa|oie)[!,.\s]*$/i;
const FORBIDDEN_PHRASES = [
  "de forma geral",
  "basicamente",
  "é importante ressaltar",
  "e importante ressaltar",
  "vale lembrar",
  "divulgado como",
  "varia conforme o aparelho",
  "depende de diversos fatores",
  "cada caso é um caso",
  "cada caso e um caso",
  "estou à disposição",
  "estou a disposição",
  "fico no aguardo",
  "espero ter ajudado",
];

function normalizeForMatch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function technicalTermVariants(value: string) {
  const normalized = normalizeForMatch(value);
  const variants = [normalized];
  if (normalized.includes("criolipolise")) variants.push("criolipolise");
  if (normalized.includes("ultrassom focado")) variants.push("ultrassom focado", "ultrassom corporal");
  if (normalized.includes("lipocavitacao")) variants.push("lipocavitacao");
  if (normalized.includes("eletroestimulacao")) variants.push("eletroestimulacao muscular", "eletroestimulacao");
  if (normalized.includes("estimulacao eletromagnetica")) variants.push("estimulacao eletromagnetica muscular", "estimulacao eletromagnetica");
  if (normalized.includes("toxina botulinica")) variants.push("toxina botulinica");
  if (normalized.includes("acido hialuronico")) variants.push("acido hialuronico");
  return variants;
}

function usesMappedTechnicalName(latestClientMessage: string, technicalItems: AiPublicResponseTechnicalItem[]) {
  const normalizedMessage = normalizeForMatch(latestClientMessage);
  return technicalItems.some((item) => technicalTermVariants(item.technicalName)
    .some((term) => term.length >= 5 && normalizedMessage.includes(term)));
}

function requestsCampaignOverview(latestClientMessage: string, campaignNames: string[]) {
  if (GREETING_ONLY.test(latestClientMessage.trim())) return true;
  const normalizedMessage = normalizeForMatch(latestClientMessage);
  const mentionsCampaign = campaignNames.some((name) => normalizedMessage.includes(normalizeForMatch(name)));
  const shortMessage = normalizedMessage.split(" ").filter(Boolean).length <= 6;
  return mentionsCampaign && (CAMPAIGN_OVERVIEW_INTENT.test(latestClientMessage) || shortMessage);
}

function campaignItemsReferencedByClient(
  latestClientMessage: string,
  campaignItems: AiPublicResponseCampaignItem[],
) {
  const normalizedMessage = normalizeForMatch(latestClientMessage);
  return campaignItems.filter((item) => normalizedMessage.includes(normalizeForMatch(item.name)));
}

export function buildAiPublicResponsePolicy(params: {
  latestClientMessage: string;
  campaignNames: string[];
  campaignItems: AiPublicResponseCampaignItem[];
  technicalItems: AiPublicResponseTechnicalItem[];
  priceDiscussionAllowed: boolean;
  requireQuestionAtEnd?: boolean;
  simulatedSchedulingAllowed?: boolean;
  simulatedSchedulingStatus?: string;
  simulatedSchedulingDate?: string | null;
  simulatedSchedulingTime?: string | null;
}): AiPublicResponsePolicy {
  const technicalNamesAllowed = TECHNICAL_DETAIL_INTENT.test(params.latestClientMessage)
    || usesMappedTechnicalName(params.latestClientMessage, params.technicalItems);
  const detailedBreakdownRequested = DETAILED_BREAKDOWN_INTENT.test(params.latestClientMessage);
  const mentionOutcomeCaveat = OUTCOME_CAVEAT_INTENT.test(params.latestClientMessage);
  const requiredCampaignItems = requestsCampaignOverview(params.latestClientMessage, params.campaignNames)
    ? params.campaignItems
    : technicalNamesAllowed
      ? campaignItemsReferencedByClient(params.latestClientMessage, params.campaignItems)
        .map((item) => ({ ...item, quantity: null, quantityText: null }))
      : [];

  return {
    styleVersion: "campaign-conversation-v3",
    technicalNamesAllowed,
    detailedBreakdownRequested,
    mentionOutcomeCaveat,
    priceDiscussionAllowed: params.priceDiscussionAllowed,
    preferredMessageCount: detailedBreakdownRequested ? 2 : 1,
    maximumMessageCount: detailedBreakdownRequested ? 2 : 1,
    targetWordRange: detailedBreakdownRequested ? "40-90" : "40-70",
    maximumCharactersPerMessage: 520,
    maximumWordsTotal: 90,
    questionsAllowed: 1,
    requireQuestionAtEnd: params.requireQuestionAtEnd !== false,
    simulatedSchedulingAllowed: params.simulatedSchedulingAllowed === true,
    simulatedSchedulingStatus: params.simulatedSchedulingStatus || "idle",
    simulatedSchedulingDate: params.simulatedSchedulingDate || null,
    simulatedSchedulingTime: params.simulatedSchedulingTime || null,
    requiredCampaignItems,
    forbiddenTechnicalTerms: technicalNamesAllowed
      ? []
      : uniqueStrings(params.technicalItems.flatMap((item) => technicalTermVariants(item.technicalName))),
  };
}

function wordCount(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function containsRequiredCampaignItem(text: string, item: AiPublicResponseCampaignItem) {
  const normalizedText = normalizeForMatch(text);
  const normalizedName = normalizeForMatch(item.name);
  if (!normalizedName || !normalizedText.includes(normalizedName)) return false;
  return item.quantity == null || new RegExp(`(?:^|\\s)${item.quantity}(?:\\s|$)`).test(normalizedText);
}

export function validateAiPublicResponseDraft(
  draft: AiPublicResponseDraft,
  policy: AiPublicResponsePolicy,
) {
  return inspectAiPublicResponseDraft(draft, policy).hardErrors;
}

export function inspectAiPublicResponseDraft(
  draft: AiPublicResponseDraft,
  policy: AiPublicResponsePolicy,
): AiPublicResponseValidation {
  const hardErrors: string[] = [];
  const styleFindings: string[] = [];
  const messages = draft.messages.filter((message) => message.trim());
  const fullText = messages.join("\n");
  const normalizedText = normalizeForMatch(fullText);

  if (messages.length === 0) {
    hardErrors.push("resposta pública sem mensagem");
  }
  if (messages.length > policy.maximumMessageCount) {
    hardErrors.push(`resposta pública com mais de ${policy.maximumMessageCount} mensagens`);
  }
  if (messages.some((message) => message.length > policy.maximumCharactersPerMessage)) {
    hardErrors.push(`mensagem pública com mais de ${policy.maximumCharactersPerMessage} caracteres`);
  }
  if (wordCount(fullText) > policy.maximumWordsTotal) {
    hardErrors.push(`resposta pública com mais de ${policy.maximumWordsTotal} palavras`);
  }

  const questionCount = (fullText.match(/\?/g) || []).length;
  if (questionCount > policy.questionsAllowed) {
    hardErrors.push(`resposta pública com mais de ${policy.questionsAllowed} pergunta`);
  }
  if (policy.requireQuestionAtEnd && messages.length > 0 && questionCount === 0) {
    hardErrors.push("resposta pública sem pergunta ao final");
  } else if (policy.requireQuestionAtEnd && messages.length > 0 && !/\?\s*$/.test(fullText)) {
    hardErrors.push("resposta pública com pergunta fora do final");
  }
  const scheduleConfirmation = /\b(?:agendad[ao]|confirmad[ao]|marcad[ao]\s+para|hor[aá]rio\s+confirmado|reservad[ao]|reserva\s+confirmada)\b/i.test(fullText);
  const simulationDisclosure = /\b(?:nesta|nessa|na)\s+simula[cç][aã]o\b|\bagenda\s+simulada\b/i.test(fullText);
  if (scheduleConfirmation && !policy.simulatedSchedulingAllowed) {
    hardErrors.push("resposta pública confirmou agendamento fora do cenário simulado autorizado");
  }
  if (policy.simulatedSchedulingStatus === "confirmed" && !simulationDisclosure) {
    hardErrors.push("confirmação simulada sem informar que a reserva existe apenas na simulação");
  }
  if (policy.simulatedSchedulingStatus === "confirmed" && questionCount > 0) {
    hardErrors.push("confirmação simulada não deve reabrir a conversa com outra pergunta");
  }
  if (["awaiting_confirmation", "alternative_offered", "confirmed"].includes(policy.simulatedSchedulingStatus)) {
    if (policy.simulatedSchedulingTime && !fullText.includes(policy.simulatedSchedulingTime)) {
      hardErrors.push("resposta pública não usou o horário resolvido pela agenda simulada");
    }
    if (policy.simulatedSchedulingDate && !fullText.includes(policy.simulatedSchedulingDate)) {
      hardErrors.push("resposta pública não usou a data resolvida pela agenda simulada");
    }
  }
  if (policy.detailedBreakdownRequested && /^\s*[-*•]\s+/m.test(fullText)) {
    hardErrors.push("detalhamento público com marcadores");
  }

  for (const phrase of FORBIDDEN_PHRASES) {
    if (normalizedText.includes(normalizeForMatch(phrase))) {
      hardErrors.push(`resposta pública contém frase proibida: ${phrase}`);
    }
  }
  if (/^claro(?:\s|[!.])/i.test(fullText.trim())) {
    styleFindings.push("resposta pública começa com abertura robótica: Claro");
  }
  const hasOutcomeCaveatLanguage = /\b(?:nao\s+(?:e\s+)?emagrecimento|nao\s+emagrece|nao\s+substitui|avaliacao|nao\s+(?:da|e\s+possivel)\s+garantir)\b/.test(normalizedText);
  const hasUnrequestedOutcomeCaveat = /\b(?:nao\s+(?:e\s+)?emagrecimento|nao\s+emagrece|nao\s+substitui|(?:funciona\s+melhor|junto)\s+(?:com\s+)?(?:dieta|alimentacao|exercicio))\b/.test(normalizedText);
  if (policy.mentionOutcomeCaveat && !hasOutcomeCaveatLanguage) {
    hardErrors.push("resposta pública omitiu a ressalva solicitada sobre resultado ou emagrecimento");
  }
  if (!policy.mentionOutcomeCaveat && hasUnrequestedOutcomeCaveat) {
    hardErrors.push("resposta pública antecipou ressalva de emagrecimento, dieta ou exercício");
  }
  if (!policy.priceDiscussionAllowed && PRICE_TOPIC.test(fullText)) {
    hardErrors.push("resposta pública sugeriu preço sem valor confirmado na campanha da unidade");
  }
  for (const technicalTerm of policy.forbiddenTechnicalTerms) {
    if (normalizedText.includes(normalizeForMatch(technicalTerm))) {
      hardErrors.push(`resposta pública trocou nome comercial por termo técnico: ${technicalTerm}`);
    }
  }
  for (const item of policy.requiredCampaignItems) {
    if (!containsRequiredCampaignItem(fullText, item)) {
      hardErrors.push(`resposta pública omitiu item comercial da campanha: ${item.quantityText || item.name}`);
    }
  }

  return {
    hardErrors: uniqueStrings(hardErrors),
    styleFindings: uniqueStrings(styleFindings),
  };
}

export function publicResponsePolicyForPrompt(policy: AiPublicResponsePolicy) {
  return {
    styleVersion: policy.styleVersion,
    technicalNamesAllowed: policy.technicalNamesAllowed,
    detailedBreakdownRequested: policy.detailedBreakdownRequested,
    mentionOutcomeCaveat: policy.mentionOutcomeCaveat,
    priceDiscussionAllowed: policy.priceDiscussionAllowed,
    preferredMessageCount: policy.preferredMessageCount,
    maximumMessageCount: policy.maximumMessageCount,
    targetWordRange: policy.targetWordRange,
    maximumCharactersPerMessage: policy.maximumCharactersPerMessage,
    maximumWordsTotal: policy.maximumWordsTotal,
    questionsAllowed: policy.questionsAllowed,
    requireQuestionAtEnd: policy.requireQuestionAtEnd,
    simulatedSchedulingAllowed: policy.simulatedSchedulingAllowed,
    simulatedSchedulingStatus: policy.simulatedSchedulingStatus,
    simulatedSchedulingDate: policy.simulatedSchedulingDate,
    simulatedSchedulingTime: policy.simulatedSchedulingTime,
    requiredCampaignItems: policy.requiredCampaignItems,
  };
}
