import { prisma } from "@/lib/db";
import {
  extractWahaMessageId,
  getInstanceProvider,
  sendWahaText,
  toWahaChatId,
} from "@/lib/whatsapp/provider";

export async function sendAutomationText(params: {
  dbInstance: { name: string; provider?: string | null };
  conversationId: string;
  contactPhone: string;
  lastKnownJid?: string | null;
  message: string;
  respondedByName?: string;
}) {
  const provider = getInstanceProvider(params.dbInstance);
  let sendData: any = {};

  if (provider === "waha") {
    const send = await sendWahaText({
      sessionName: params.dbInstance.name,
      chatId: toWahaChatId(params.contactPhone),
      text: params.message,
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

  const messageId = provider === "waha"
    ? extractWahaMessageId(sendData) || `auto_waha_${params.conversationId}_${Date.now()}`
    : sendData?.key?.id || sendData?.id || `auto_${params.conversationId}_${Date.now()}`;
  const sentAt = new Date();

  await prisma.whatsAppMessage.create({
    data: {
      conversationId: params.conversationId,
      messageId,
      body: params.message,
      type: "text",
      fromMe: true,
      status: "sent",
      timestamp: sentAt,
      respondedByName: params.respondedByName || "Automação",
    },
  });

  await prisma.whatsAppConversation.update({
    where: { id: params.conversationId },
    data: { lastMessage: params.message, lastMessageAt: sentAt },
  });

  return { messageId };
}
