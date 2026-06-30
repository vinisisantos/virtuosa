import { prisma } from "@/lib/db";

const DEFAULT_UNITS = ["SCS", "SBC", "Osasco"];

const TOPIC_RULES: Array<{ key: string; label: string; pattern: RegExp }> = [
  { key: "preco", label: "Preço/valor", pattern: /\b(pre[cç]o|valor|quanto|custa|pagamento|parcel)/i },
  { key: "agenda", label: "Agendamento", pattern: /\b(agenda|marcar|hor[aá]rio|disponibilidade|avalia[cç][aã]o)/i },
  { key: "localizacao", label: "Localização", pattern: /\b(endere[cç]o|local|onde|unidade|osasco|sbc|s[aã]o caetano|scs)/i },
  { key: "procedimento", label: "Procedimento", pattern: /\b(procedimento|tratamento|sess[aã]o|protocolo|endolaser|crio|lipo|botox|hyper|monji|barriga)/i },
  { key: "resultado", label: "Resultado esperado", pattern: /\b(resultado|emagrecer|definir|gordura|flacidez|barriga|cintura|abd[oô]men|medida)/i },
  { key: "dor", label: "Dor/recuperação", pattern: /\b(d[oó]i|dor|recupera[cç][aã]o|cirurgia|invasivo|sem corte)/i },
];

const OBJECTION_RULES: Array<{ key: string; label: string; pattern: RegExp }> = [
  { key: "caro", label: "Sensibilidade a preço", pattern: /\b(caro|barato|desconto|promo[cç][aã]o|condi[cç][aã]o|parcel)/i },
  { key: "tempo", label: "Falta de tempo/agenda", pattern: /\b(sem tempo|corrid[ao]|depois|mais tarde|outro dia|agenda cheia)/i },
  { key: "duvida", label: "Dúvida sobre eficácia", pattern: /\b(funciona|garante|resultado|quantas sess[oõ]es|vale a pena)/i },
  { key: "medo", label: "Medo/insegurança", pattern: /\b(medo|receio|risco|seguro|d[oó]i|dor|cirurgia)/i },
];

function normalizePhone(value?: string | null) {
  return (value || "").replace(/\D/g, "");
}

function clampPreview(value: string, max = 180) {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function collectMatches(text: string, rules: typeof TOPIC_RULES) {
  return rules
    .filter((rule) => rule.pattern.test(text))
    .map((rule) => ({ key: rule.key, label: rule.label }));
}

function collectQuestions(messages: Array<{ body: string; fromMe: boolean }>) {
  return messages
    .filter((message) => !message.fromMe && message.body.includes("?"))
    .slice(-8)
    .map((message) => clampPreview(message.body, 140));
}

export async function ensureSilentAnalysisSettings() {
  await Promise.all(
    DEFAULT_UNITS.map((unit) =>
      prisma.crmSilentAnalysisSetting.upsert({
        where: { unit },
        update: {},
        create: { unit },
      })
    )
  );
}

export async function getSilentAnalysisSettings() {
  await ensureSilentAnalysisSettings();
  return prisma.crmSilentAnalysisSetting.findMany({
    orderBy: { unit: "asc" },
  });
}

export async function analyzeConversationSilently(conversationId: string) {
  const conversation = await prisma.whatsAppConversation.findUnique({
    where: { id: conversationId },
    include: {
      contact: true,
      instance: true,
      messages: {
        orderBy: { timestamp: "asc" },
        select: {
          body: true,
          fromMe: true,
          timestamp: true,
          type: true,
        },
      },
    },
  });

  if (!conversation) return null;

  const unit = conversation.instance.unit || conversation.contact.unit || "Osasco";
  const setting = await prisma.crmSilentAnalysisSetting.findUnique({ where: { unit } });
  if (!setting?.isEnabled) return null;

  const messages = setting.includeOutbound
    ? conversation.messages
    : conversation.messages.filter((message) => !message.fromMe);
  const inboundMessages = conversation.messages.filter((message) => !message.fromMe);
  const outboundMessages = conversation.messages.filter((message) => message.fromMe);
  const messageBodies = messages
    .filter((message) => message.body?.trim())
    .map((message) => `${message.fromMe ? "Atendente" : "Lead"}: ${message.body.trim()}`);
  const combinedText = messageBodies.join("\n").slice(-12000);

  const phone = normalizePhone(conversation.contact.phone);
  const client = phone
    ? await prisma.client.findFirst({
        where: { phone: { contains: phone.slice(-8) } },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          source: true,
          campaignName: true,
          stage: true,
          unit: true,
        },
      })
    : null;

  const lastMessage = conversation.messages[conversation.messages.length - 1];
  const firstMessage = conversation.messages[0];
  const topics = collectMatches(combinedText, TOPIC_RULES);
  const objections = collectMatches(combinedText, OBJECTION_RULES);
  const questions = collectQuestions(inboundMessages);
  const lastInbound = inboundMessages[inboundMessages.length - 1];

  const summary = setting.collectMessageBodies
    ? clampPreview(
        [
          client?.campaignName ? `Campanha: ${client.campaignName}.` : null,
          topics.length ? `Temas: ${topics.map((topic) => topic.label).join(", ")}.` : null,
          objections.length ? `Objeções: ${objections.map((item) => item.label).join(", ")}.` : null,
          lastInbound?.body ? `Última fala do lead: ${clampPreview(lastInbound.body, 120)}` : null,
        ]
          .filter(Boolean)
          .join(" "),
        700
      )
    : null;

  return prisma.crmConversationInsight.upsert({
    where: { conversationId },
    update: {
      unit,
      contactPhone: conversation.contact.phone,
      contactName: conversation.contact.name,
      instanceName: conversation.instance.name,
      campaignName: client?.campaignName || null,
      source: client?.source || null,
      status: "collected",
      messageCount: conversation.messages.length,
      inboundCount: inboundMessages.length,
      outboundCount: outboundMessages.length,
      firstMessageAt: firstMessage?.timestamp || null,
      lastMessageAt: lastMessage?.timestamp || conversation.lastMessageAt,
      lastAnalyzedAt: new Date(),
      lastMessagePreview: lastMessage?.body ? clampPreview(lastMessage.body) : null,
      summary,
      topics,
      objections,
      questions,
      rawSignals: {
        clientId: client?.id || null,
        clientStage: client?.stage || null,
        conversationStatus: conversation.status,
        unreadCount: conversation.unreadCount,
        hasCampaign: !!client?.campaignName,
        collectedBodies: setting.collectMessageBodies,
      },
    },
    create: {
      conversationId,
      unit,
      contactPhone: conversation.contact.phone,
      contactName: conversation.contact.name,
      instanceName: conversation.instance.name,
      campaignName: client?.campaignName || null,
      source: client?.source || null,
      status: "collected",
      messageCount: conversation.messages.length,
      inboundCount: inboundMessages.length,
      outboundCount: outboundMessages.length,
      firstMessageAt: firstMessage?.timestamp || null,
      lastMessageAt: lastMessage?.timestamp || conversation.lastMessageAt,
      lastAnalyzedAt: new Date(),
      lastMessagePreview: lastMessage?.body ? clampPreview(lastMessage.body) : null,
      summary,
      topics,
      objections,
      questions,
      rawSignals: {
        clientId: client?.id || null,
        clientStage: client?.stage || null,
        conversationStatus: conversation.status,
        unreadCount: conversation.unreadCount,
        hasCampaign: !!client?.campaignName,
        collectedBodies: setting.collectMessageBodies,
      },
    },
  });
}
