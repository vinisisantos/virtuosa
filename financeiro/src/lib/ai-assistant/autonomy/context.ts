import { Prisma, type AliceAutonomousTurn } from "@prisma/client";
import { prisma } from "@/lib/db";
import { phoneLookupKey } from "@/lib/phone";
import { buildAliceKnowledgeContext } from "@/lib/ai-assistant/alice-knowledge";
import { sanitizeAiAssistantText, resolveAiAssistantContactName } from "@/lib/ai-assistant/privacy";
import { classifyAliceHandoff } from "@/lib/ai-assistant/safety";
import { buildSbcEvaluationOptions } from "@/lib/ai-assistant/sbc-scheduling-policy";
import { aliceAutonomyConversationEligible } from "@/lib/ai-assistant/autonomy/policy";

export async function loadAliceAutonomousContext(turn: AliceAutonomousTurn, database = prisma, now = new Date()) {
  const conversation = await database.whatsAppConversation.findFirst({
    where: { id: turn.conversationId, instanceId: turn.instanceId },
    select: {
      id: true, instanceId: true, status: true, blockedAt: true, archivedAt: true, commercialPaused: true, aiMode: true,
      lastKnownJid: true, contact: { select: { name: true, phone: true, unit: true } },
      instance: { select: { id: true, name: true, unit: true, status: true, provider: true } },
      commercialHolds: { select: { dealId: true }, take: 1 },
    },
  });
  if (!conversation || !aliceAutonomyConversationEligible(conversation) || conversation.instance.unit !== "SBC"
    || conversation.instance.status !== "connected" || conversation.commercialHolds.length) return null;
  const messages = (await database.whatsAppMessage.findMany({
    where: { conversationId: turn.conversationId, status: { not: "deleted" } },
    select: { id: true, messageId: true, body: true, type: true, fromMe: true, timestamp: true, createdAt: true, status: true, respondedByName: true },
    orderBy: [{ timestamp: "desc" }, { id: "desc" }], take: 30,
  })).reverse();
  const source = messages.findLast((message) => !message.fromMe);
  if (!source || source.id !== turn.sourceMessageId) return null;
  const ownMessages = Array.isArray(turn.providerMessageIds) ? turn.providerMessageIds.filter((id): id is string => typeof id === "string") : [];
  const sourceIndex = messages.findIndex((message) => message.id === source.id);
  const intervention = messages.slice(sourceIndex + 1).some((message) => message.fromMe
    && !ownMessages.includes(message.messageId) && message.respondedByName !== "Automação de recepção");
  if (intervention) return null;
  const continuation = turn.nextMessageIndex > 0 && Array.isArray(turn.messagesJson);
  const phoneKey = phoneLookupKey(conversation.contact.phone);
  const clients = phoneKey && !continuation ? await database.client.findMany({
    where: { unit: "SBC", isActive: true, phone: { contains: phoneKey.slice(-8) } },
    select: { phone: true, campaignName: true }, take: 12,
  }) : [];
  const matches = clients.filter((client) => phoneLookupKey(client.phone) === phoneKey);
  const campaignName = matches.length === 1 ? matches[0].campaignName || "Não identificada" : "Não identificada";
  const names = [conversation.contact.name || "", ...messages.map((message) => message.respondedByName || "")];
  const textMessages = messages.filter((message) => message.type === "text" && message.body.trim()).slice(-12);
  const lastTeam = textMessages.findLastIndex((message) => message.fromMe);
  const pending = textMessages.slice(lastTeam + 1).filter((message) => !message.fromMe);
  const safeIncoming = messages.filter((message) => !message.fromMe).map((message) => message.body);
  const handoffReason = continuation ? null : source.type !== "text" ? "model_requested" as const
    : classifyAliceHandoff({ unit: "SBC", campaignName, incomingMessages: safeIncoming });
  const knowledge = handoffReason || continuation ? null : buildAliceKnowledgeContext({
    unit: "SBC", campaignName, messageText: (pending.length ? pending : [source]).map((message) => message.body).join(" "),
  });
  return {
    conversation, messages: textMessages, source, contactName: resolveAiAssistantContactName(conversation.contact.name),
    handoffReason: handoffReason || (!knowledge && !continuation ? "model_requested" as const : null),
    prompt: {
      BASE_ALICE: knowledge, UNIDADE: "SBC", CAMPANHA: sanitizeAiAssistantText(campaignName, names),
      HORARIOS_SBC: buildSbcEvaluationOptions(now), CONTATO: { nomeSalvoDisponivel: Boolean(resolveAiAssistantContactName(conversation.contact.name)) },
      MENSAGEM_ALVO: null, ULTIMA_MENSAGEM_CLIENTE: { id: source.id, text: sanitizeAiAssistantText(source.body, names) },
      MENSAGENS_RECENTES_SEM_RESPOSTA: pending.map((message) => ({ id: message.id, text: sanitizeAiAssistantText(message.body, names) })),
      CONVERSA: textMessages.map((message) => ({ role: message.fromMe ? "atendente" : "cliente", text: sanitizeAiAssistantText(message.body, names) })),
      ATENDIMENTO_AUTONOMO: true,
    } as Prisma.InputJsonObject,
  };
}

export type AliceAutonomousContext = NonNullable<Awaited<ReturnType<typeof loadAliceAutonomousContext>>>;
