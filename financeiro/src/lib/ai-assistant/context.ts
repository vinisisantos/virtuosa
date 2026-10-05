import { prisma } from "@/lib/db";
import { getInstancesForRequest } from "@/lib/whatsapp/instance-resolver";
import { resolveInboxConversationUnit } from "@/lib/whatsapp/conversation-unit";
import { loadAiAssistantConfig } from "@/lib/ai-assistant/config";
import { buildAliceKnowledgeContext } from "@/lib/ai-assistant/alice-knowledge";
import { isAliceUnit } from "@/lib/ai-assistant/scope";
import { requireAliceLiveRuntime } from "@/lib/ai-assistant/runtime";
import { classifyAliceHandoff } from "@/lib/ai-assistant/safety";
import { AiAssistantError, aiAssistantDigest } from "@/lib/ai-assistant/policy";
import { resolveAiAssistantContactName, sanitizeAiAssistantText } from "@/lib/ai-assistant/privacy";

type ContextMessage = {
  id: string;
  body: string;
  fromMe: boolean;
  timestamp: Date;
  respondedByName: string | null;
};

export async function loadAccessibleAliceConversation(req: Request, conversationId: string, requireReply = true) {
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
      assignedTo: true,
      assignedToName: true,
      contact: { select: { name: true, unit: true } },
      instance: { select: { id: true, unit: true, userId: true } },
    },
  });
  if (!conversation) throw new AiAssistantError("Conversa não encontrada", 404);
  const instance = accessible.get(conversation.instanceId);
  if (requireReply && instance?.canReply === false) {
    throw new AiAssistantError("Esta caixa está disponível somente para consulta", 403);
  }
  const requestUnit = new URL(req.url).searchParams.get("unit");
  const unit = resolveInboxConversationUnit(conversation.instance.unit, requestUnit, conversation.contact.unit);
  if (!isAliceUnit(unit)) {
    throw new AiAssistantError("Alice está disponível somente para conversas de SBC e Osasco", 403);
  }
  if (conversation.blockedAt || conversation.archivedAt || ["closed", "resolved", "lost"].includes(conversation.status)) {
    throw new AiAssistantError("Esta conversa não está elegível para sugestões", 409);
  }
  return { conversation, unit };
}

export async function loadAliceSuggestionContext(params: {
  req: Request;
  conversationId: string;
  userId: string;
  campaignName?: string | null;
  targetMessageId?: string | null;
}) {
  const { conversation, unit } = await loadAccessibleAliceConversation(params.req, params.conversationId);
  const messages = (await prisma.whatsAppMessage.findMany({
    where: {
      conversationId: conversation.id,
      type: "text",
      status: { not: "deleted" },
      body: { not: "" },
    },
    select: { id: true, body: true, fromMe: true, timestamp: true, respondedByName: true },
    orderBy: [{ timestamp: "desc" }, { id: "desc" }],
    take: 12,
  })).reverse() as ContextMessage[];
  const latest = messages.at(-1);
  if (!latest) throw new AiAssistantError("A conversa ainda não possui mensagens de texto.", 409);
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
  const pendingRawMessages = messages.slice(lastTeamMessageIndex + 1).filter((message) => !message.fromMe);
  const pendingMessages = pendingRawMessages.map((message) => ({
    id: message.id,
    text: sanitizeAiAssistantText(message.body, names),
  }));
  const sanitizedTargetMessage = targetMessage ? {
    id: targetMessage.id,
    text: sanitizeAiAssistantText(targetMessage.body, names),
  } : null;
  const campaignName = sanitizeAiAssistantText(params.campaignName || "", names).slice(0, 160);
  const safetyMessages = [
    ...pendingRawMessages.map((message) => message.body),
    ...(targetMessage ? [targetMessage.body] : []),
  ];
  const handoffReason = classifyAliceHandoff({ unit, campaignName, incomingMessages: safetyMessages });
  const config = await loadAiAssistantConfig();
  if (!config.enabled) throw new AiAssistantError("Alice está pausada nas configurações", 503);

  const contactName = resolveAiAssistantContactName(conversation.contact.name);
  const sourceFingerprint = aiAssistantDigest({
    messages: messages.map((message) => [message.id, message.body, message.fromMe, message.timestamp.toISOString()]),
    targetMessage: targetMessage ? [targetMessage.id, targetMessage.body, targetMessage.timestamp.toISOString()] : null,
  });

  let aliceKnowledge = null;
  if (!handoffReason) {
    requireAliceLiveRuntime();
    aliceKnowledge = buildAliceKnowledgeContext({
      unit,
      campaignName,
      messageText: [...pendingMessages, ...(sanitizedTargetMessage ? [sanitizedTargetMessage] : [])].map((message) => message.text).join(" "),
    });
    if (!aliceKnowledge) throw new AiAssistantError("A base privada da Alice não está disponível neste momento", 503);
  }

  return {
    conversation,
    unit,
    latestMessageId: latest.id,
    targetMessageId: targetMessage?.id || null,
    sourceFingerprint,
    contactName,
    handoffReason,
    config,
    prompt: handoffReason ? null : {
      BASE_ALICE: aliceKnowledge,
      UNIDADE: unit,
      CAMPANHA: campaignName || "Não identificada",
      CONTATO: { nomeSalvoDisponivel: Boolean(contactName) },
      MENSAGEM_ALVO: sanitizedTargetMessage,
      MENSAGENS_RECENTES_SEM_RESPOSTA: pendingMessages,
      CONVERSA: dialogue,
    },
  };
}
