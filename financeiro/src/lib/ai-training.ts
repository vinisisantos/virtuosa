import { createHash } from "node:crypto";
import { generateAiTrainingDraft, loadKnowledge } from "@/lib/ai-shadow";
import { prisma } from "@/lib/db";
import { ACTIVE_UNITS, permittedUnitsForAccess } from "@/lib/role-access";

export type AiTrainingUser = {
  userId: string;
  email: string;
  name: string;
  role: string;
  unit: string;
  permissions: Record<string, boolean> | null;
  isAdmin: boolean;
};

type TrainingHistoryMessage = {
  conversationId: string;
  body: string;
  fromMe: boolean;
  respondedByName: string | null;
  timestamp: Date;
  conversation: {
    contact: { name: string | null };
  };
};

type TrainingTurn = {
  conversationId: string;
  contactName: string | null;
  question: string;
  answer: string;
};

const TURN_GAP_MS = 30 * 60 * 1000;
const MAX_MEMORY_EXAMPLES = 8;
const TRAINING_UNITS = [...ACTIVE_UNITS];

const PROCEDURE_PATTERN = /botox|toxina|preenchimento|bioestimulador|harmoniza|skinbooster|microagulh|peeling|limpeza de pele|melasma|papada|criolip|gordura|barriga|abd[oô]men|flanco|celulite|estria|heccus|enzima|ultrassom|modeladora|drenagem|massagem|depila[cç][aã]o|laser|emagrec|bioimped[aâ]ncia|hyper slim/i;
const KNOWLEDGE_PATTERN = /como funciona|procedimento|tratamento|sess[aã]o|protocolo|aplica|realizad|resultado|indica[cç][aã]o/i;
const USEFUL_PATTERN = /como funciona|procedimento|tratamento|sess[aã]o|protocolo|valor|pre[cç]o|pagamento|agenda|hor[aá]rio|disponibilidade|endere[cç]o|unidade|primeira vez|objetivo|incomoda|d[uú]vida|posso ajudar|avalia[cç][aã]o/i;
const SAFE_CONVERSATION_PATTERN = /qual (?:[ée] )?(?:o )?seu (?:principal )?objetivo|ser[aá] a primeira vez|[ée] sua primeira vez|o que (?:mais )?te incomoda|como posso te ajudar|poderia me dizer seu nome|vou acompanhar voc[eê]|seja (?:muito )?bem-vind[ao]|semana ou s[aá]bado|qual per[ií]odo/i;
const FACTUAL_ANSWER_PATTERN = /(?:o protocolo|o tratamento|o procedimento).*(?:inclui|funciona|composto)|\b\d+\s*(?:sess[oõ]es|vezes|dias|semanas)|frequ[eê]ncia|aplica[cç][aã]o|resultado|bioimped[aâ]ncia (?:mede|mostra)/i;
const GENERIC_ONLY_PATTERN = /^(oi|ol[aá]|bom dia|boa tarde|boa noite|tudo bem|sim|n[aã]o|ok|certo|perfeito|obrigad[ao]|imagina|por nada|combinado|aguardo)[!?. ,]*$/i;

const RISK_PATTERNS: Array<[string, RegExp]> = [
  ["promise_or_guarantee", /garant|resultado garantido|com certeza (?:voc[eê] )?(?:vai|ter[aá])|vai amar os resultados|sentir bastante diferen[cç]a|assim ser[aá] o seu|ajudar[aá] bastante/i],
  ["medical_or_medication", /tirzepatida|semaglutida|ozempic|mounjaro|dosagem|medica[cç][aã]o|rem[eé]dio|contraindica|diagn[oó]stico/i],
  ["price_or_payment_data", /r\$|pix|cnpj|chave pix|cart[aã]o|parcel|\b\d{2,5}[,.]\d{2}\b/i],
  ["address_or_contact", /\b(?:rua|avenida|travessa|alameda)\b|\bcep\b|endere[cç]o|https?:\/\/|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?\d{4,5}[-.\s]?\d{4}/i],
];

export function canUseAiTraining(user: AiTrainingUser | null) {
  return !!user && (user.isAdmin || user.permissions?.crmSilentAnalysis === true);
}

export function visibleAiTrainingUnits(user: AiTrainingUser) {
  return permittedUnitsForAccess({
    role: user.role,
    userUnit: user.unit,
    permissions: user.permissions,
  });
}

export function canAccessAiTrainingUnit(user: AiTrainingUser, unit: string) {
  return visibleAiTrainingUnits(user).includes(unit);
}

function compact(value: string, max: number) {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function normalized(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "[link]")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function anonymize(value: string, contactName: string | null) {
  let text = value
    .replace(/https?:\/\/\S+/gi, "[link]")
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[email]")
    .replace(/(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?\d{4,5}[-.\s]?\d{4}/g, "[telefone]")
    .replace(/\b(?:cpf|cnpj)\s*:?\s*[\d./-]+/gi, "[documento]")
    .replace(/\bme chamo\s+\*?[\p{L}]+\*?[,! ]*/giu, "")
    .replace(/\b(ol[aá]|oi|oie|prazer|entendo)\s*,?\s+[A-ZÁ-Ú][\p{Ll}]{2,}\b/gu, "$1, [nome]");
  const safeName = contactName?.trim();
  if (safeName && safeName.length >= 3) {
    text = text.replace(new RegExp(`\\b${escapeRegExp(safeName)}\\b`, "gi"), "[nome]");
  }
  return text.replace(/\s+/g, " ").trim();
}

function riskFlagsFor(answer: string) {
  return RISK_PATTERNS.filter(([, pattern]) => pattern.test(answer)).map(([flag]) => flag);
}

function isHumanOutbound(message: TrainingHistoryMessage) {
  return message.fromMe && message.respondedByName !== "Automação" && message.body.trim().length > 0;
}

function buildTrainingTurns(messages: TrainingHistoryMessage[]) {
  const turns: TrainingTurn[] = [];
  let conversationId = "";
  let contactName: string | null = null;
  let previousTimestamp: Date | null = null;
  let inbound: string[] = [];
  let outbound: string[] = [];

  const flushOutbound = () => {
    if (outbound.length > 0 && inbound.length > 0) {
      turns.push({
        conversationId,
        contactName,
        question: inbound.join("\n"),
        answer: outbound.join("\n"),
      });
    }
    outbound = [];
    inbound = [];
  };

  for (const message of messages) {
    if (conversationId && message.conversationId !== conversationId) {
      flushOutbound();
      inbound = [];
      outbound = [];
      previousTimestamp = null;
    }
    conversationId = message.conversationId;
    contactName = message.conversation.contact.name;

    if (previousTimestamp && message.timestamp.getTime() - previousTimestamp.getTime() > TURN_GAP_MS) {
      flushOutbound();
      inbound = [];
    }
    previousTimestamp = message.timestamp;

    if (!message.fromMe) {
      flushOutbound();
      if (message.body.trim()) inbound.push(message.body);
      continue;
    }

    if (isHumanOutbound(message)) {
      outbound.push(message.body);
    } else {
      flushOutbound();
    }
  }
  flushOutbound();
  return turns;
}

function isUsefulTurn(turn: TrainingTurn) {
  if (turn.answer.trim().length < 45 || !turn.question.trim()) return false;
  if (GENERIC_ONLY_PATTERN.test(turn.answer.trim())) return false;
  const combined = `${turn.question}\n${turn.answer}`;
  return USEFUL_PATTERN.test(combined) || PROCEDURE_PATTERN.test(combined) || turn.answer.length >= 120;
}

function isSafeConversationPattern(answer: string) {
  return answer.length <= 700
    && SAFE_CONVERSATION_PATTERN.test(answer)
    && !FACTUAL_ANSWER_PATTERN.test(answer)
    && !/\b\d{2,}\b/.test(answer);
}

function sourceReferenceFor(unit: string, question: string, answer: string) {
  return `history:${createHash("sha256").update(`${unit}\n${normalized(question)}\n${normalized(answer)}`).digest("hex")}`;
}

function tokensFor(value: string) {
  return new Set(
    normalized(value)
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length >= 4),
  );
}

function memoryScore(queryTokens: Set<string>, memory: { triggerText: string; correctedAnswer: string; category: string; unit: string }, unit: string) {
  const memoryTokens = tokensFor(`${memory.triggerText} ${memory.correctedAnswer}`);
  let overlap = 0;
  for (const token of queryTokens) if (memoryTokens.has(token)) overlap += 1;
  const categoryBonus = memory.category === "conversation_pattern" ? 0.2 : 0;
  const unitBonus = memory.unit === unit ? 0.15 : 0;
  return overlap + categoryBonus + unitBonus;
}

async function loadRelevantMemories(unit: string, latestClientMessage: string) {
  const memories = await prisma.aiTrainingMemory.findMany({
    where: { status: "approved", unit: { in: [unit, "Todas"] } },
    select: {
      id: true,
      unit: true,
      triggerText: true,
      correctedAnswer: true,
      category: true,
    },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });
  const queryTokens = tokensFor(latestClientMessage);
  return memories
    .map((memory) => ({ ...memory, score: memoryScore(queryTokens, memory, unit) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_MEMORY_EXAMPLES)
    .map((memory) => ({
      id: memory.id,
      unit: memory.unit,
      category: memory.category,
      triggerText: compact(memory.triggerText, 700),
      correctedAnswer: compact(memory.correctedAnswer, 1000),
    }));
}

export async function generateAiTrainingReply(params: {
  unit: string;
  messages: Array<{ role: string; content: string }>;
}) {
  const latestClientMessage = [...params.messages].reverse().find((message) => message.role === "client")?.content || "";
  const [knowledge, memories] = await Promise.all([
    loadKnowledge(params.unit),
    loadRelevantMemories(params.unit, latestClientMessage),
  ]);
  const conversation = params.messages.slice(-16).map((message) => ({
    role: message.role === "assistant" ? "Clinica" : "Cliente",
    content: compact(message.content, 1200),
  }));
  const prompt = `Este é um CHAT INTERNO DE TREINAMENTO. A pessoa usuária está interpretando o cliente e você responde como atendente da Clínica Virtuosa.

Base factual aprovada da unidade:
${JSON.stringify(knowledge, null, 2)}

Exemplos de respostas humanas aprovadas. Use como referência de tom e condução; não copie dados pessoais e não trate exemplos como fatos atuais:
${JSON.stringify(memories, null, 2)}

Conversa simulada:
${JSON.stringify(conversation, null, 2)}

Responda à última mensagem do Cliente. Mesmo quando a decisão for handoff, inclua uma mensagem curta e acolhedora que poderia ser enviada ao cliente. Não se apresente com nome de atendente humano. Nunca invente preço, endereço, disponibilidade, contraindicação ou promessa de resultado. Retorne somente o JSON exigido.`;

  return generateAiTrainingDraft(prompt);
}

export async function importHistoricalTrainingMemory(params: {
  unit: string;
  user: AiTrainingUser;
}) {
  if (![...TRAINING_UNITS, "Todas"].includes(params.unit as (typeof TRAINING_UNITS)[number] | "Todas")) {
    throw new Error("Unidade inválida");
  }

  const messages = await prisma.whatsAppMessage.findMany({
    where: { conversation: { instance: { unit: params.unit } } },
    select: {
      conversationId: true,
      body: true,
      fromMe: true,
      respondedByName: true,
      timestamp: true,
      conversation: { select: { contact: { select: { name: true } } } },
    },
    orderBy: [{ conversationId: "asc" }, { timestamp: "asc" }],
  });

  const turns = buildTrainingTurns(messages);
  const uniqueCandidates = new Map<string, {
    unit: string;
    sourceType: string;
    sourceReference: string;
    sourceConversationId: string;
    triggerText: string;
    originalAnswer: string;
    correctedAnswer: string;
    category: string;
    status: string;
    riskFlags: string[];
    createdById: string;
    createdByName: string;
    reviewedById: string | null;
    reviewedByName: string | null;
    reviewedAt: Date | null;
  }>();
  let excludedByRisk = 0;

  for (const turn of turns) {
    if (!isUsefulTurn(turn)) continue;
    const risks = riskFlagsFor(turn.answer);
    if (risks.length > 0) {
      excludedByRisk += 1;
      continue;
    }
    const question = compact(anonymize(turn.question, turn.contactName), 2000);
    const answer = compact(anonymize(turn.answer, turn.contactName), 4000);
    const sourceReference = sourceReferenceFor(params.unit, question, answer);
    if (uniqueCandidates.has(sourceReference)) continue;
    const autoApproved = isSafeConversationPattern(answer);
    const isKnowledge = PROCEDURE_PATTERN.test(`${question}\n${answer}`) || KNOWLEDGE_PATTERN.test(answer);
    uniqueCandidates.set(sourceReference, {
      unit: params.unit,
      sourceType: "historical_conversation",
      sourceReference,
      sourceConversationId: turn.conversationId,
      triggerText: question,
      originalAnswer: answer,
      correctedAnswer: answer,
      category: autoApproved ? "conversation_pattern" : isKnowledge ? "procedure_knowledge" : "response_example",
      status: autoApproved ? "approved" : "pending",
      riskFlags: [],
      createdById: params.user.userId,
      createdByName: params.user.name || params.user.email,
      reviewedById: autoApproved ? params.user.userId : null,
      reviewedByName: autoApproved ? params.user.name || params.user.email : null,
      reviewedAt: autoApproved ? new Date() : null,
    });
  }

  const candidates = [...uniqueCandidates.values()];
  const existing = candidates.length > 0
    ? await prisma.aiTrainingMemory.findMany({
        where: { sourceReference: { in: candidates.map((candidate) => candidate.sourceReference) } },
        select: { sourceReference: true },
      })
    : [];
  const existingReferences = new Set(existing.map((item) => item.sourceReference));
  const newCandidates = candidates.filter((candidate) => !existingReferences.has(candidate.sourceReference));
  if (newCandidates.length > 0) {
    await prisma.aiTrainingMemory.createMany({ data: newCandidates, skipDuplicates: true });
  }

  return {
    unit: params.unit,
    scannedMessages: messages.length,
    pairedTurns: turns.length,
    candidates: candidates.length,
    imported: newCandidates.length,
    alreadyImported: candidates.length - newCandidates.length,
    approvedPatterns: newCandidates.filter((candidate) => candidate.status === "approved").length,
    pendingReview: newCandidates.filter((candidate) => candidate.status === "pending").length,
    excludedByRisk,
  };
}
