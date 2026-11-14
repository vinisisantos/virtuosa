import { prisma } from "@/lib/db";
import { isManualOnlyPhone } from "@/lib/manual-only-contact";
import { ALICE_AUTONOMY_INSTANCE_ID, ALICE_AUTONOMY_UNIT } from "@/lib/ai-assistant/autonomy/policy";
import { ALICE_ATTENDANT_NAME } from "@/lib/whatsapp/inbox-attendant";
import {
  extractWahaMessageId,
  getInstanceProvider,
  sendWahaText,
  toWahaChatId,
} from "@/lib/whatsapp/provider";

export async function sendAutomationText(params: {
  dbInstance: { name: string; provider?: string | null; id?: string; unit?: string | null };
  conversationId: string;
  contactPhone: string;
  lastKnownJid?: string | null;
  message: string;
  respondedByName?: string;
  beforeSend?: () => Promise<void>;
  providerTimeoutMs?: number;
  requireProviderMessageId?: boolean;
  aliceAutonomous?: boolean;
}) {
  if (params.aliceAutonomous && (params.dbInstance.id !== ALICE_AUTONOMY_INSTANCE_ID || params.dbInstance.unit !== ALICE_AUTONOMY_UNIT)) {
    throw new Error("Instância fora do piloto de envio autônomo.");
  }
  const conversation = await prisma.whatsAppConversation.findUnique({
    where: { id: params.conversationId, ...(params.aliceAutonomous ? { instanceId: ALICE_AUTONOMY_INSTANCE_ID } : {}) },
    select: { blockedAt: true },
  });
  if (params.aliceAutonomous && !conversation) throw new Error("Conversa fora da instância do piloto.");
  if (conversation?.blockedAt) {
    throw new Error("Contato bloqueado no WhatsApp. A automação não foi enviada.");
  }
  if (await isManualOnlyPhone(params.contactPhone)) {
    throw new Error("Contato configurado para atendimento manual. A automação não foi enviada.");
  }

  await params.beforeSend?.();

  const provider = getInstanceProvider(params.dbInstance);
  let sendData: any = {};

  if (provider === "waha") {
    const send = await sendWahaText({
      sessionName: params.dbInstance.name,
      chatId: toWahaChatId(params.contactPhone),
      text: params.message,
      signal: params.providerTimeoutMs ? AbortSignal.timeout(params.providerTimeoutMs) : undefined,
    });
    sendData = send.data;
    if (!send.res.ok) {
      throw new Error(`Erro ao enviar automação pela WAHA: ${JSON.stringify(sendData).slice(0, 300)}`);
    }
  } else {
    const lastKnownJid = (params.lastKnownJid || "").trim();
    const sendTarget = /@(hosted\.)?lid$/i.test(lastKnownJid)
      ? lastKnownJid
      : params.contactPhone;
    const url = (process.env.EVOLUTION_API_URL || "http://localhost:8080").replace(/\/+$/, "");
    const apiKey = process.env.EVOLUTION_API_KEY || "";
    const sendRes = await fetch(`${url}/message/sendText/${params.dbInstance.name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: JSON.stringify({ number: sendTarget, text: params.message }),
      signal: AbortSignal.timeout(15000),
    });
    sendData = await sendRes.json().catch(() => ({}));
    if (!sendRes.ok) {
      throw new Error(`Erro ao enviar automação: ${JSON.stringify(sendData).slice(0, 300)}`);
    }
  }

  const providerMessageId = provider === "waha" ? extractWahaMessageId(sendData) : sendData?.key?.id || sendData?.id;
  if ((params.requireProviderMessageId || params.aliceAutonomous) && (typeof providerMessageId !== "string" || !providerMessageId.trim())) {
    throw new Error("Provedor não confirmou o identificador da mensagem. Não repetir automaticamente.");
  }
  const messageId = providerMessageId || (provider === "waha"
    ? `auto_waha_${params.conversationId}_${Date.now()}` : `auto_${params.conversationId}_${Date.now()}`);
  const sentAt = new Date();

  const savedMessage = await prisma.whatsAppMessage.create({
    data: {
      conversationId: params.conversationId,
      messageId,
      body: params.message,
      type: "text",
      fromMe: true,
      status: "sent",
      timestamp: sentAt,
      respondedByName: params.aliceAutonomous ? ALICE_ATTENDANT_NAME : params.respondedByName || "Automação",
    },
    select: { id: true, status: true },
  }).catch((error: unknown) => {
    if (!params.aliceAutonomous || !error || typeof error !== "object" || !("code" in error) || error.code !== "P2002") throw error;
    // O provedor confirmou exatamente esta saída. Se o webhook chegou antes,
    // anexe somente a autoria ao eco, preservando seu ACK e seu ID interno.
    return prisma.whatsAppMessage.update({
      where: {
        conversationId_messageId: { conversationId: params.conversationId, messageId },
        fromMe: true, respondedBy: null, OR: [{ respondedByName: null }, { respondedByName: ALICE_ATTENDANT_NAME }],
      },
      data: { respondedByName: ALICE_ATTENDANT_NAME },
      select: { id: true, status: true },
    });
  });
  if (params.aliceAutonomous && ["error", "deleted"].includes(savedMessage.status)) {
    throw new Error("O eco da mensagem confirmou falha ou exclusão; não repetir automaticamente.");
  }

  await prisma.whatsAppConversation.update({
    where: { id: params.conversationId },
    data: { lastMessage: params.message, lastMessageAt: sentAt },
  });

  return { messageId, messageRowId: savedMessage.id, sentAt };
}
