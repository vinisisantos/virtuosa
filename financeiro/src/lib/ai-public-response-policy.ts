export type AiPublicResponseCampaignItem = {
  name: string;
  quantity: number | null;
  quantityText: string | null;
};

export type AiPublicResponseTechnicalItem = {
  name: string;
  technicalName: string;
};

export type AiPublicCampaignItemExplanation = {
  name: string;
  status: "approved" | "restricted" | "missing";
};

export type AiPublicResponsePolicy = {
  styleVersion: "campaign-conversation-v8";
  technicalNamesAllowed: boolean;
  detailedBreakdownRequested: boolean;
  fulfillExplanationCommitment: boolean;
  forbidExplanationPermission: boolean;
  mentionOutcomeCaveat: boolean;
  priceDiscussionAllowed: boolean;
  preferredMessageCount: number;
  maximumMessageCount: number;
  targetWordRange: string;
  maximumCharactersPerMessage: number;
  maximumWordsTotal: number;
  questionsAllowed: number;
  requireQuestionAtEnd: boolean;
  forbidQualificationRecap: boolean;
  requireSchedulingDayChoice: boolean;
  requireUnitConfirmation: boolean;
  requireFacialUnitSequence: boolean;
  requireFacialVisualProof: boolean;
  requireConciseFacialSchedulingOffer: boolean;
  requiredUnitName: string | null;
  requiredUnitAddress: string | null;
  requireTestHandoffDisclosure: boolean;
  simulatedSchedulingAllowed: boolean;
  simulatedSchedulingStatus: string;
  simulatedSchedulingDate: string | null;
  simulatedSchedulingTime: string | null;
  blockedOpeningWords: string[];
  recentAssistantMessages: string[];
  forbiddenCampaignConcernTerms: string[];
  requiredCampaignItems: AiPublicResponseCampaignItem[];
  campaignItemExplanations: AiPublicCampaignItemExplanation[];
  forbiddenTechnicalTerms: string[];
};

const PRICE_TOPIC = /\b(?:pre[cç]os?|valores?|custos?|quanto\s+(?:custa|fica|sai)|or[cç]amento|investimento)\b/i;
const CLINICAL_FIRST_PERSON = /\b(?:na|nessa|durante\s+a)\s+avalia[cç][aã]o\b[^.!?\n]{0,80}\b(?:eu|n[oó]s)\s+(?:avalio|avaliamos|observo|observamos|analiso|analisamos|defino|definimos|indico|indicamos|aplico|aplicamos|realizo|realizamos|examino|examinamos|alinho|alinhamos)\b|\b(?:eu|n[oó]s)\s+(?:avalio|avaliamos|observo|observamos|analiso|analisamos|defino|definimos|indico|indicamos|aplico|aplicamos|realizo|realizamos|examino|examinamos)\b[^.!?\n]{0,80}\b(?:regi[aã]o|protocolo|tratamento|estrat[eé]gia|aplica[cç][aã]o)\b/i;
const REDUNDANT_QUALIFICATION_RECAP = /\b(?:sendo|por\s+ser|j[aá]\s+que\s+[eé])\s+(?:a\s+)?sua\s+primeira\s+vez\b|\bcomo\s+(?:te|isso)\s+incomoda\s+de\s+forma\s+(?:mais\s+)?(?:ampla|completa)\b|\bcomo\s+tudo\s+(?:te\s+)?incomoda\b/i;
const SCHEDULING_PERMISSION_GATE = /\b(?:posso|podemos|quer\s+que\s+eu)\b[^?.!\n]{0,80}\b(?:consultar|verificar|ver)\b[^?.!\n]{0,60}\b(?:hor[aá]rios?|disponibilidade|agenda)\b/i;
const EXPLANATION_PERMISSION_GATE = /\b(?:(?:(?:voc[eê]\s+)?quer(?:\s+que\s+eu)?|gostaria\s+que\s+eu|deseja\s+que\s+eu|posso|podemos)\b[^.!?\n]{0,100}\b(?:explic(?:ar|o|a|amos)|explique|detalh(?:ar|o|a|e|amos)|mostrar)|quer\s+saber\b|(?:se|caso)\s+(?:voc[eê]\s+)?(?:quiser|queira|desejar)\b[^.!?\n]{0,100}\b(?:explic(?:o|amos)|detalh(?:o|amos)|mostr(?:o|amos)))\b/i;
const WEEKDAY_CHOICE = /\b(?:durante\s+a\s+semana|na\s+semana|semana)\b/i;
const SATURDAY_CHOICE = /\bs[aá]bado\b/i;
const FACIAL_VISUAL_PROOF = /\b(?:exemplo|foto|antes\s+e\s+depois|resultado)\b/i;
const FACIAL_EVALUATION_OFFER = /\bvamos\s+seguir\s+para\s+uma\s+(?:re)?avalia[cç][aã]o\b/i;
const FACIAL_OFFER_EXTRA_DETAIL = /\b(?:especialista|regi[aã]o|estrat[eé]gia|procedimento|primeira\s+vez)\b/i;
const TEST_HANDOFF_DISCLOSURE = /\b(?:simula[cç][aã]o|ambiente\s+(?:interno\s+)?de\s+teste)\b/i;
const NO_REAL_HUMAN_HANDOFF = /\b(?:nenhum[ao]?|n[aã]o\s+(?:h[aá]|existe))\b[^.!?\n]{0,100}\b(?:pessoa|atendente|consultora|especialista|equipe|humano)\b[^.!?\n]{0,60}\b(?:acionad[ao]|chamad[ao]|encaminhad[ao]|dispon[ií]vel)\b/i;
const TEST_HANDOFF_MESSAGE = "Como este é um ambiente de simulação, nenhuma pessoa da equipe será acionada por aqui.";

export type AiPublicResponseDraft = {
  decision: string;
  messages: string[];
};

export type AiPublicResponseValidation = {
  hardErrors: string[];
  styleFindings: string[];
};

const OPTION_LINE = /^\s*(?:[-*•]|\d+[.)])\s+\S+/;

function questionEndsInteraction(text: string) {
  const trimmed = text.trim();
  const lastQuestionMark = trimmed.lastIndexOf("?");
  if (lastQuestionMark < 0) return false;

  const contentAfterQuestion = trimmed.slice(lastQuestionMark + 1).trim();
  if (!contentAfterQuestion) return true;

  const optionLines = contentAfterQuestion
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  return optionLines.length >= 2 && optionLines.every((line) => OPTION_LINE.test(line));
}

function questionAtEnd(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return text;

  const lastQuestionMark = trimmed.lastIndexOf("?");
  if (lastQuestionMark < 0) {
    return `${trimmed}\n\nPosso continuar te orientando por aqui?`;
  }
  if (questionEndsInteraction(trimmed)) return trimmed;

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
  const handoffMessages = draft.decision === "handoff"
    && policy.requireTestHandoffDisclosure
    && (!TEST_HANDOFF_DISCLOSURE.test(mergedMessages.join("\n")) || !NO_REAL_HUMAN_HANDOFF.test(mergedMessages.join("\n")))
    ? mergedMessages.length < policy.maximumMessageCount
      ? [...mergedMessages, TEST_HANDOFF_MESSAGE]
      : [`${mergedMessages.join("\n\n")}\n\n${TEST_HANDOFF_MESSAGE}`]
    : mergedMessages;
  const normalizedMessages = policy.requireQuestionAtEnd && handoffMessages.length > 0
    ? [questionAtEnd(handoffMessages.join("\n\n"))]
    : handoffMessages;

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

const REPETITION_STOP_WORDS = new Set([
  "ainda", "algo", "antes", "aquela", "aquele", "como", "com", "dentro", "depois", "essa", "esse", "esta", "este",
  "fazer", "mais", "mesma", "mesmo", "muito", "nessa", "nesta", "nosso", "nossa", "onde", "para", "pela", "pelo",
  "porque", "quando", "qual", "que", "tambem", "uma", "voce", "avaliacao",
]);

function normalizeForMatch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const HUMAN_HANDOFF_NOUN = "(?:alguem|pessoa|equipe|time|especialista|profissional|atendente|consultora|consultor|humano|atendimento)";
const HUMAN_HANDOFF_ACTION = "(?:pass(?:ar|e|a|o)|encaminh(?:ar|e|a|o)|cham(?:ar|e|a|o)|acion(?:ar|e|a|o)|transfer(?:ir|e|a|o)|conect(?:ar|e|a|o)|coloc(?:ar|a|o|amos)|pedir|pec(?:a|o)|solicit(?:ar|e|a|o))";
const HUMAN_HANDOFF_PROXIMITY = new RegExp(
  `\\b${HUMAN_HANDOFF_ACTION}\\b.{0,80}\\b${HUMAN_HANDOFF_NOUN}\\b|\\b${HUMAN_HANDOFF_NOUN}\\b.{0,80}\\b${HUMAN_HANDOFF_ACTION}\\b`,
);
const HUMAN_CONVERSATION_OFFER = new RegExp(`\\b(?:fal(?:ar|e|a|o)|convers(?:ar|e|a|o))\\b.{0,20}\\bcom\\b.{0,40}\\b${HUMAN_HANDOFF_NOUN}\\b`);
const HUMAN_HANDOFF_PRONOUN = /\b(?:pass(?:ar|e|a|o)|encaminh(?:ar|e|a|o)|transfer(?:ir|e|a|o)|conect(?:ar|e|a|o))\b.{0,35}\b(?:para|com)\s+(?:ela|ele)\b/;

export function detectAiPublicHumanHandoffOffer(value: string) {
  const normalized = normalizeForMatch(value);
  if (!HUMAN_HANDOFF_PROXIMITY.test(normalized)
    && !HUMAN_CONVERSATION_OFFER.test(normalized)
    && !HUMAN_HANDOFF_PRONOUN.test(normalized)) return false;
  return /\b(?:quer|gostaria|posso|podemos|prefere|deseja|vou|vamos|te|lhe)\b/.test(normalized)
    || new RegExp(`\\b${HUMAN_HANDOFF_ACTION}\\b`).test(normalized);
}

export function detectAiPublicExplanationPermission(value: string) {
  return EXPLANATION_PERMISSION_GATE.test(value);
}

function openingWord(value: string) {
  return normalizeForMatch(value).split(" ").find(Boolean) || "";
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function meaningfulTokens(value: string) {
  return new Set(normalizeForMatch(value)
    .split(" ")
    .filter((word) => word.length >= 4 && !REPETITION_STOP_WORDS.has(word)));
}

function substantiallyRepeats(current: string, previous: string) {
  const currentTokens = meaningfulTokens(current);
  const previousTokens = meaningfulTokens(previous);
  const smallerSize = Math.min(currentTokens.size, previousTokens.size);
  if (smallerSize < 7) return false;
  let shared = 0;
  for (const token of currentTokens) {
    if (previousTokens.has(token)) shared += 1;
  }
  return shared >= 7 && shared / smallerSize >= 0.58;
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
  forbidQualificationRecap?: boolean;
  requireSchedulingDayChoice?: boolean;
  requireUnitConfirmation?: boolean;
  requireFacialUnitSequence?: boolean;
  requireFacialVisualProof?: boolean;
  requireConciseFacialSchedulingOffer?: boolean;
  requiredUnitName?: string | null;
  requiredUnitAddress?: string | null;
  requireTestHandoffDisclosure?: boolean;
  simulatedSchedulingAllowed?: boolean;
  simulatedSchedulingStatus?: string;
  simulatedSchedulingDate?: string | null;
  simulatedSchedulingTime?: string | null;
  recentAssistantMessages?: string[];
  forbiddenCampaignConcernTerms?: string[];
  fulfillExplanationCommitment?: boolean;
  campaignItemExplanations?: AiPublicCampaignItemExplanation[];
}): AiPublicResponsePolicy {
  const technicalNamesAllowed = TECHNICAL_DETAIL_INTENT.test(params.latestClientMessage)
    || usesMappedTechnicalName(params.latestClientMessage, params.technicalItems);
  const fulfillExplanationCommitment = params.fulfillExplanationCommitment === true;
  const detailedBreakdownRequested = fulfillExplanationCommitment
    || DETAILED_BREAKDOWN_INTENT.test(params.latestClientMessage);
  const mentionOutcomeCaveat = OUTCOME_CAVEAT_INTENT.test(params.latestClientMessage);
  const requireFacialUnitSequence = params.requireFacialUnitSequence === true;
  const requireConciseFacialSchedulingOffer = params.requireConciseFacialSchedulingOffer === true;
  const requiredCampaignItems = fulfillExplanationCommitment
    ? params.campaignItems.map((item) => ({ ...item, quantity: null, quantityText: null }))
    : requestsCampaignOverview(params.latestClientMessage, params.campaignNames)
    ? params.campaignItems
    : technicalNamesAllowed
      ? campaignItemsReferencedByClient(params.latestClientMessage, params.campaignItems)
        .map((item) => ({ ...item, quantity: null, quantityText: null }))
      : [];

  return {
    styleVersion: "campaign-conversation-v8",
    technicalNamesAllowed,
    detailedBreakdownRequested,
    fulfillExplanationCommitment,
    forbidExplanationPermission: true,
    mentionOutcomeCaveat,
    priceDiscussionAllowed: params.priceDiscussionAllowed,
    preferredMessageCount: requireFacialUnitSequence || detailedBreakdownRequested ? 2 : 1,
    maximumMessageCount: requireFacialUnitSequence || detailedBreakdownRequested ? 2 : 1,
    targetWordRange: detailedBreakdownRequested ? "40-90" : "40-70",
    maximumCharactersPerMessage: 520,
    maximumWordsTotal: requireConciseFacialSchedulingOffer ? 30 : 90,
    questionsAllowed: 1,
    requireQuestionAtEnd: params.requireQuestionAtEnd !== false,
    forbidQualificationRecap: params.forbidQualificationRecap === true,
    requireSchedulingDayChoice: params.requireSchedulingDayChoice === true,
    requireUnitConfirmation: params.requireUnitConfirmation === true,
    requireFacialUnitSequence,
    requireFacialVisualProof: params.requireFacialVisualProof === true,
    requireConciseFacialSchedulingOffer,
    requiredUnitName: params.requiredUnitName?.trim() || null,
    requiredUnitAddress: params.requiredUnitAddress?.trim() || null,
    requireTestHandoffDisclosure: params.requireTestHandoffDisclosure === true,
    simulatedSchedulingAllowed: params.simulatedSchedulingAllowed === true,
    simulatedSchedulingStatus: params.simulatedSchedulingStatus || "idle",
    simulatedSchedulingDate: params.simulatedSchedulingDate || null,
    simulatedSchedulingTime: params.simulatedSchedulingTime || null,
    blockedOpeningWords: uniqueStrings((params.recentAssistantMessages || [])
      .slice(-3)
      .map(openingWord)
      .filter((word) => word.length >= 3)),
    recentAssistantMessages: (params.recentAssistantMessages || []).slice(-3),
    forbiddenCampaignConcernTerms: uniqueStrings(params.forbiddenCampaignConcernTerms || [])
      .filter((term) => !normalizeForMatch(params.latestClientMessage).includes(normalizeForMatch(term))),
    requiredCampaignItems,
    campaignItemExplanations: params.campaignItemExplanations || [],
    forbiddenTechnicalTerms: technicalNamesAllowed
      ? []
      : uniqueStrings(params.technicalItems.flatMap((item) => technicalTermVariants(item.technicalName))),
  };
}

export function buildAiTrainingResponsePolicy(latestClientMessage: string): AiPublicResponsePolicy {
  return {
    ...buildAiPublicResponsePolicy({
      latestClientMessage,
      campaignNames: [],
      campaignItems: [],
      technicalItems: [],
      priceDiscussionAllowed: true,
      requireQuestionAtEnd: false,
      simulatedSchedulingAllowed: false,
      requireTestHandoffDisclosure: true,
    }),
    preferredMessageCount: 1,
    maximumMessageCount: 3,
    targetWordRange: "livre dentro dos limites do treinamento",
    maximumCharactersPerMessage: 320,
    maximumWordsTotal: 240,
    questionsAllowed: 3,
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
  const responseOpening = openingWord(fullText);

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
  if (responseOpening && policy.blockedOpeningWords.includes(responseOpening)) {
    hardErrors.push(`resposta pública repetiu a abertura recente: ${responseOpening}`);
  }
  if (policy.recentAssistantMessages.some((message) => substantiallyRepeats(fullText, message))) {
    hardErrors.push("resposta pública repetiu semanticamente uma explicação recente");
  }
  if (CLINICAL_FIRST_PERSON.test(fullText)) {
    hardErrors.push("resposta pública falou em primeira pessoa como se a IA realizasse a avaliação");
  }
  if (policy.forbidQualificationRecap && REDUNDANT_QUALIFICATION_RECAP.test(fullText)) {
    hardErrors.push("resposta pública repetiu informações de qualificação já conhecidas");
  }
  if (policy.requireSchedulingDayChoice && SCHEDULING_PERMISSION_GATE.test(fullText)) {
    hardErrors.push("resposta pública pediu permissão para consultar a agenda em vez de avançar");
  }
  if (policy.forbidExplanationPermission && detectAiPublicExplanationPermission(fullText)) {
    hardErrors.push("resposta pública pediu permissão para explicar em vez de entregar a explicação");
  }
  if (policy.requireSchedulingDayChoice && (!WEEKDAY_CHOICE.test(fullText) || !SATURDAY_CHOICE.test(fullText))) {
    hardErrors.push("resposta pública não pediu a escolha direta entre semana e sábado");
  }
  if (policy.requireUnitConfirmation) {
    if (policy.requiredUnitName && !normalizedText.includes(normalizeForMatch(policy.requiredUnitName))) {
      hardErrors.push(`resposta pública não confirmou a unidade solicitada: ${policy.requiredUnitName}`);
    }
    if (policy.requiredUnitAddress && !normalizedText.includes(normalizeForMatch(policy.requiredUnitAddress))) {
      hardErrors.push("resposta pública não informou o endereço aprovado ao confirmar a unidade");
    }
  }
  if (policy.requireFacialUnitSequence) {
    if (messages.length !== 2) {
      hardErrors.push("sequência facial não foi separada em dois balões");
    } else {
      const firstMessage = messages[0];
      const secondMessage = messages[1];
      const normalizedFirstMessage = normalizeForMatch(firstMessage);
      const normalizedSecondMessage = normalizeForMatch(secondMessage);
      if (firstMessage.includes("?")) {
        hardErrors.push("acolhimento facial trouxe pergunta antes da confirmação da unidade");
      }
      if (policy.requiredUnitAddress
        && normalizedFirstMessage.includes(normalizeForMatch(policy.requiredUnitAddress))) {
        hardErrors.push("acolhimento facial antecipou o endereço da unidade");
      }
      if (policy.requiredUnitName
        && !normalizedSecondMessage.includes(normalizeForMatch(policy.requiredUnitName))) {
        hardErrors.push("segundo balão facial não informou a unidade aprovada");
      }
      if (policy.requiredUnitAddress
        && !normalizedSecondMessage.includes(normalizeForMatch(policy.requiredUnitAddress))) {
        hardErrors.push("segundo balão facial não informou o endereço aprovado");
      }
      if (!questionEndsInteraction(secondMessage)) {
        hardErrors.push("segundo balão facial não terminou confirmando a unidade");
      }
      if (policy.requireFacialVisualProof && !FACIAL_VISUAL_PROOF.test(firstMessage)) {
        hardErrors.push("acolhimento facial não apresentou o exemplo visual autorizado");
      }
    }
  }
  if (policy.requireConciseFacialSchedulingOffer) {
    if (messages.length !== 1) {
      hardErrors.push("convite facial para avaliação deve usar um único balão");
    }
    if (!FACIAL_EVALUATION_OFFER.test(fullText)) {
      hardErrors.push("convite facial não avançou diretamente para avaliação ou reavaliação");
    }
    if (FACIAL_OFFER_EXTRA_DETAIL.test(fullText)) {
      hardErrors.push("convite facial acrescentou explicação já concluída antes da agenda");
    }
  }
  for (const term of policy.forbiddenCampaignConcernTerms) {
    if (normalizedText.includes(normalizeForMatch(term))) {
      hardErrors.push(`resposta pública citou opção fora do escopo da campanha: ${term}`);
    }
  }

  const questionCount = (fullText.match(/\?/g) || []).length;
  if (questionCount > policy.questionsAllowed) {
    hardErrors.push(`resposta pública com mais de ${policy.questionsAllowed} pergunta`);
  }
  if (policy.requireQuestionAtEnd && messages.length > 0 && questionCount === 0) {
    hardErrors.push("resposta pública sem pergunta ao final");
  } else if (policy.requireQuestionAtEnd && messages.length > 0 && !questionEndsInteraction(fullText)) {
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
  if (draft.decision !== "handoff" && detectAiPublicHumanHandoffOffer(fullText)) {
    hardErrors.push("resposta pública ofereceu encaminhamento humano fora de um handoff necessário");
  }
  if (draft.decision === "handoff" && policy.requireTestHandoffDisclosure
    && (!TEST_HANDOFF_DISCLOSURE.test(fullText) || !NO_REAL_HUMAN_HANDOFF.test(fullText))) {
    hardErrors.push("handoff de teste não informou que a simulação não aciona atendimento humano real");
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
    fulfillExplanationCommitment: policy.fulfillExplanationCommitment,
    forbidExplanationPermission: policy.forbidExplanationPermission,
    mentionOutcomeCaveat: policy.mentionOutcomeCaveat,
    priceDiscussionAllowed: policy.priceDiscussionAllowed,
    preferredMessageCount: policy.preferredMessageCount,
    maximumMessageCount: policy.maximumMessageCount,
    targetWordRange: policy.targetWordRange,
    maximumCharactersPerMessage: policy.maximumCharactersPerMessage,
    maximumWordsTotal: policy.maximumWordsTotal,
    questionsAllowed: policy.questionsAllowed,
    requireQuestionAtEnd: policy.requireQuestionAtEnd,
    forbidQualificationRecap: policy.forbidQualificationRecap,
    requireSchedulingDayChoice: policy.requireSchedulingDayChoice,
    requireUnitConfirmation: policy.requireUnitConfirmation,
    requireFacialUnitSequence: policy.requireFacialUnitSequence,
    requireFacialVisualProof: policy.requireFacialVisualProof,
    requireConciseFacialSchedulingOffer: policy.requireConciseFacialSchedulingOffer,
    requiredUnitName: policy.requiredUnitName,
    requiredUnitAddress: policy.requiredUnitAddress,
    requireTestHandoffDisclosure: policy.requireTestHandoffDisclosure,
    simulatedSchedulingAllowed: policy.simulatedSchedulingAllowed,
    simulatedSchedulingStatus: policy.simulatedSchedulingStatus,
    simulatedSchedulingDate: policy.simulatedSchedulingDate,
    simulatedSchedulingTime: policy.simulatedSchedulingTime,
    blockedOpeningWords: policy.blockedOpeningWords,
    avoidRepeatingRecentAnswers: true,
    forbiddenCampaignConcernTerms: policy.forbiddenCampaignConcernTerms,
    requiredCampaignItems: policy.requiredCampaignItems,
    campaignItemExplanations: policy.campaignItemExplanations,
  };
}
