import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const getEvolutionConfig = () => ({
  url: process.env.EVOLUTION_API_URL || "http://localhost:8080",
  apiKey: process.env.EVOLUTION_API_KEY || "",
});

export async function POST(req: Request) {
  const { url, apiKey } = getEvolutionConfig();
  try {
    const body = await req.json();

    const { instance, contactId, body: messageBody, type, replyid, viewOnce } = body;

    if (!contactId || (!messageBody && !body.file)) {
      return NextResponse.json({ error: "Faltam parâmetros obrigatórios" }, { status: 400 });
    }

    const dbInstance = instance
      ? await prisma.whatsAppInstance.findFirst({ where: { name: instance } })
      : await prisma.whatsAppInstance.findFirst();

    if (!dbInstance) {
      return NextResponse.json({ error: "Instância não encontrada" }, { status: 404 });
    }

    const instanceName = dbInstance.name;
    const number = contactId.replace(/\D/g, "");
    const isMedia = ["image", "video", "audio", "document", "ptt", "sticker"].includes(type);

    let sendData: any;

    if (isMedia) {
      // Evolution API v2: POST /message/sendMedia/{instanceName}
      const mediaPayload: any = {
        number,
        mediatype: type === "ptt" ? "audio" : type,
        media: body.file, // base64 ou URL
        caption: messageBody || "",
        fileName: body.docName || undefined,
      };

      const sendRes = await fetch(`${url}/message/sendMedia/${instanceName}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": apiKey,
        },
        body: JSON.stringify(mediaPayload),
      });

      sendData = await sendRes.json();
      if (!sendRes.ok) {
        return NextResponse.json({ error: "Erro ao enviar mídia", details: sendData }, { status: sendRes.status });
      }
    } else {
      // Evolution API v2: POST /message/sendText/{instanceName}
      const textPayload: any = {
        number,
        text: messageBody,
      };

      // Se tiver replyId, usar quoted message
      if (replyid) {
        textPayload.quoted = { key: { id: replyid } };
      }

      const sendRes = await fetch(`${url}/message/sendText/${instanceName}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": apiKey,
        },
        body: JSON.stringify(textPayload),
      });

      sendData = await sendRes.json();
      if (!sendRes.ok) {
        return NextResponse.json({ error: "Erro ao enviar mensagem", details: sendData }, { status: sendRes.status });
      }
    }

    // Evolution retorna { key: { remoteJid, fromMe, id }, message, messageTimestamp, status }
    const messageId = sendData.key?.id || sendData.id || `temp_${Date.now()}`;
    const mediaUrl = isMedia ? (body.file?.startsWith("http") ? body.file : null) : null;

    // Achar/Criar conversa no banco
    let contact = await prisma.whatsAppContact.findUnique({ where: { phone: number } });
    if (!contact) {
      contact = await prisma.whatsAppContact.create({
        data: { phone: number, name: number },
      });
    }

    let conversation = await prisma.whatsAppConversation.findFirst({
      where: { contactId: contact.id, instanceId: dbInstance.id },
    });

    if (!conversation) {
      conversation = await prisma.whatsAppConversation.create({
        data: {
          instanceId: dbInstance.id,
          contactId: contact.id,
          status: "open",
        },
      });
    }

    const message = await prisma.whatsAppMessage.create({
      data: {
        conversationId: conversation.id,
        messageId,
        body: messageBody,
        type: type || "text",
        mediaUrl,
        fromMe: true,
        status: "sent",
        timestamp: new Date(),
      },
    });

    await prisma.whatsAppConversation.update({
      where: { id: conversation.id },
      data: { lastMessage: messageBody, lastMessageAt: new Date() },
    });

    return NextResponse.json({ success: true, message });

  } catch (error: any) {
    console.error("[WhatsApp Send API Error]:", error);
    return NextResponse.json({ error: "Erro interno", details: error.message }, { status: 500 });
  }
}
