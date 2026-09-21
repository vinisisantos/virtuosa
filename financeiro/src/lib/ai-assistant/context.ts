import { prisma } from "@/lib/db";
import { getInstancesForRequest } from "@/lib/whatsapp/instance-resolver";
import { resolveInboxConversationUnit } from "@/lib/whatsapp/conversation-unit";
import { loadAiAssistantConfig } from "@/lib/ai-assistant/config";
import {
  AI_ASSISTANT_UNIT,
  AiAssistantError,
  aiAssistantDigest,
  aiAssistantPublicConfig,
} from "@/lib/ai-assistant/policy";
import { resolveAiAssistantContactName, sanitizeAiAssistantText } from "@/lib/ai-assistant/privacy";

type ContextMessage = {
  id: string;
  body: string;
  fromMe: boolean;
  timestamp: Date;
  respondedByName: string | null;
};

function normalizedWords(value: string) {
  return new Set(value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 4));
}
function relevanceScore(text: string, contextWords: Set<string>) {
  let score = 0;
  for (const word of normalizedWords(text)) {
    if (contextWords.has(word)) score += 1;
  }
  return score;
}

export async function loadAccessibleSbcConversation(req: Request, conversationId: string, requireReply = true) {
  const { instances } = await getInstancesForRequest(req);
  const accessible = new Map(instances.map((instance) => [instance.id, instance]));
  const conversation = await prisma.whatsAppConversation.findFirst({
    where: { id: conversationId, instanceId: { in: [...accessible.keys()] } },
    select: {
      id: true,
      instanceId: true,
      aiMode: true,
      blockedAt: true,
      archivedAt: true,
      status: true,
      contact: { select: { name: true, unit: true } },
      instance: { select: { unit: true } },
    },
  });
  if (!conversation) throw new AiAssistantError("Conversa não encontrada", 404);
  const instance = accessible.get(conversation.instanceId);
  if (requireReply && instance?.canReply === false) {
    throw new AiAssistantError("Esta caixa está disponível somente para consulta", 403);
  }
  const requestUnit = new URL(req.url).searchParams.get("unit");
  const unit = resolveInboxConversationUnit(conversation.instance.unit, requestUnit, conversation.contact.unit);
  if (unit !== AI_ASSISTANT_UNIT) {
    throw new AiAssistantError("As sugestões estão em piloto somente em SBC", 403);
  }
  if (conversation.blockedAt || conversation.archivedAt || ["closed", "resolved", "lost"].includes(conversation.status)) {
    throw new AiAssistantError("Esta conversa não está elegível para sugestões", 409);
  }
  return { conversation, unit };
}

export async function loadAiAssistantSuggestionContext(params: {
  req: Request;
  conversationId: string;
  userId: string;
  campaignName?: string | null;
  targetMessageId?: string | null;
}) {
  const { conversation } = await loadAccessibleSbcConversation(params.req, params.conversationId);
  const messages = (await prisma.whatsAppMessage.findMany({
    where: {
      conversationId: conversation.id,
      type: "text",
      status: { not: "deleted" },
      body: { not: "" },
    },
    select: { id: true, body: true, fromMe: true, timestamp: true, respondedByName: true },
    orderBy: [{ timestamp: "desc" }, { id: "desc" }],
    take: 18,
  })).reverse() as ContextMessage[];
  const latest = messages.at(-1);
  if (!latest) {
    throw new AiAssistantError("A conversa ainda não possui mensagens de texto.", 409);
  }
  if (!params.targetMessageId && latest.fromMe) {
    throw new AiAssistantError("A última mensagem já é da equipe. Aguarde uma nova resposta do cliente.", 409);
  }

  const targetMessage = params.targetMessageId
    ? await prisma.whatsAppMessage.findFirst({
      where: {
        id: params.targetMessageId,
        conversationId: conversation.id,
        fromMe: false,
        type: "text",
        status: { not: "deleted" },
        body: { not: "" },
      },
      select: { id: true, body: true, fromMe: true, timestamp: true, respondedByName: true },
    }) as ContextMessage | null
    : null;
  if (params.targetMessageId && !targetMessage) {
    throw new AiAssistantError("A mensagem selecionada não está mais disponível para resposta.", 409);
  }

  const names = [
    conversation.contact.name || "",
    ...messages.map((message) => message.respondedByName || ""),
    targetMessage?.respondedByName || "",
  ];
  const dialogue = messages.map((message) => ({
    role: message.fromMe ? "atendente" : "cliente",
    text: sanitizeAiAssistantText(message.body, names),
  }));
  let lastTeamMessageIndex = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].fromMe) {
      lastTeamMessageIndex = index;
      break;
    }
  }
  const pendingMessages = messages
    .slice(lastTeamMessageIndex + 1)
    .filter((message) => !message.fromMe)
    .map((message) => ({
      id: message.id,
      text: sanitizeAiAssistantText(message.body, names),
    }));
  const sanitizedTargetMessage = targetMessage ? {
    id: targetMessage.id,
    text: sanitizeAiAssistantText(targetMessage.body, names),
  } : null;
  const conversationText = [
    ...dialogue.map((message) => message.text),
    ...(sanitizedTargetMessage ? [sanitizedTargetMessage.text] : []),
  ].join(" ");
  const contextWords = normalizedWords(conversationText);
  const config = await loadAiAssistantConfig();
  if (!config.enabled) throw new AiAssistantError("As sugestões estão pausadas", 503);

  const [approvedCandidates, catalogItems, savedReplies] = await Promise.all([
    prisma.aiLearningCandidate.findMany({
      where: { unit: AI_ASSISTANT_UNIT, status: "approved" },
      select: { id: true, content: true },
      orderBy: { updatedAt: "desc" },
      take: 60,
    }),
    prisma.serviceCatalog.findMany({
      where: { active: true, unit: { in: [AI_ASSISTANT_UNIT, "Todas"] } },
      select: { id: true, name: true, description: true, price: true, unit: true },
      orderBy: { updatedAt: "desc" },
      take: 200,
    }),
    prisma.whatsAppSavedReply.findMany({
      where: {
        userId: params.userId,
        OR: [
          { categoryId: null },
          ...(params.campaignName ? [{ category: { campaignName: params.campaignName } }] : []),
        ],
      },
      select: { id: true, title: true, content: true },
      orderBy: [{ position: "asc" }, { updatedAt: "desc" }],
      take: 40,
    }),
  ]);

  const knowledge = approvedCandidates
    .map((item) => {
      const content = item.content as Record<string, unknown>;
      return {
        id: `aprendizado:${item.id}`,
        topic: String(content.topic || ""),
        questions: Array.isArray(content.questions) ? content.questions : [],
        answer: String(content.answer || ""),
        conditions: String(content.conditions || ""),
      };
    })
    .map((item) => ({ item, score: relevanceScore(JSON.stringify(item), contextWords) }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 10)
    .map(({ item }) => item);
  const catalog = catalogItems
    .map((item) => ({ item, score: relevanceScore(`${item.name} ${item.description || ""}`, contextWords) }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 12)
    .map(({ item }) => ({
      id: `catalogo:${item.id}`,
      name: item.name,
      description: item.description,
      ...(config.sharePrices ? { price: item.price } : {}),
    }));
  const examples = savedReplies
    .map((item) => ({ item, score: relevanceScore(`${item.title} ${item.content}`, contextWords) }))
    .sort((left, right) => right.score - left.score)
    .slice(0, 8)
    .map(({ item }) => ({ id: `resposta:${item.id}`, title: item.title, content: item.content }));
  const publicConfig = aiAssistantPublicConfig(config);
  const personalizationName = resolveAiAssistantContactName(conversation.contact.name);
  const sourceFingerprint = aiAssistantDigest({
    messages: messages.map((message) => [
      message.id,
      message.body,
      message.fromMe,
      message.timestamp.toISOString(),
    ]),
    targetMessage: targetMessage ? [
      targetMessage.id,
      targetMessage.body,
      targetMessage.timestamp.toISOString(),
    ] : null,
  });

  return {
    conversation,
    latestMessageId: latest.id,
    targetMessageId: targetMessage?.id || null,
    sourceFingerprint,
    personalizationName,
    config,
    prompt: {
      DADOS_DA_EMPRESA: {
        description: publicConfig.businessDescription,
        hours: publicConfig.businessHours || "Não informado",
        address: publicConfig.address,
        locationUrl: publicConfig.locationUrl,
        email: publicConfig.email || "Não informado",
        website: publicConfig.website || "Não informado",
        purchasePolicy: publicConfig.purchasePolicy,
        paymentPolicy: publicConfig.paymentPolicy || "Não informado",
        discountPolicy: publicConfig.discountPolicy || "Não informado",
      },
      REGRAS: {
        allowEmojis: config.allowEmojis,
        sharePrices: config.sharePrices,
        askClientInfoAt: config.askClientInfoAt,
        customInstructions: config.customInstructions,
      },
      CAMPANHA: params.campaignName || "Não identificada",
      CONTATO: {
        nomeSalvoDisponivel: Boolean(personalizationName),
      },
      CATALOGO_APROVADO: catalog,
      CONHECIMENTO_APROVADO: knowledge,
      RESPOSTAS_DE_EXEMPLO: examples,
      MENSAGEM_ALVO: sanitizedTargetMessage,
      MENSAGENS_RECENTES_SEM_RESPOSTA: pendingMessages,
      CONVERSA: dialogue,
    },
  };
}
