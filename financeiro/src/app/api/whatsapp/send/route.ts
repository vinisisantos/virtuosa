import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { getInstanceForRequest } from "@/lib/whatsapp/instance-resolver";

const prisma = new PrismaClient();

const getEvolutionConfig = () => ({
  url: process.env.EVOLUTION_API_URL || "http://localhost:8080",
  apiKey: process.env.EVOLUTION_API_KEY || "",
});

export async function POST(req: Request) {
  const { url, apiKey } = getEvolutionConfig();
  try {
    const body = await req.json();

    const { contactId, body: messageBody, type, replyid, viewOnce } = body;

    if (!contactId || (!messageBody && !body.file)) {
      return NextResponse.json({ error: "Faltam parâmetros obrigatórios" }, { status: 400 });
    }

    // Resolver instância do usuário autenticado (ou targetUserId para admin)
    const { instance: dbInstance, isProxy } = await getInstanceForRequest(req);
    const userId = req.headers.get('x-user-id') || '';
    const userName = req.headers.get('x-user-name') || '';

    if (!dbInstance) {
      return NextResponse.json({ error: "Instância não encontrada" }, { status: 404 });
    }

    const instanceName = dbInstance.name;
    const number = contactId.replace(/\D/g, "");
    const isMedia = ["image", "video", "audio", "document", "ptt", "sticker"].includes(type);
    const isAudio = ["audio", "ptt"].includes(type);

    // Limpar prefixo data: do base64 se presente
    let mediaBase64 = body.file || "";
    if (mediaBase64.includes(",")) {
      mediaBase64 = mediaBase64.split(",")[1];
    }

    let sendData: any;

    if (isAudio && mediaBase64) {
      // Evolution API v2: POST /message/sendWhatsAppAudio/{instanceName}
      const audioPayload = {
        number,
        audio: mediaBase64,
        encoding: true, // permite enviar base64
      };

      const sendRes = await fetch(`${url}/message/sendWhatsAppAudio/${instanceName}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": apiKey,
        },
        body: JSON.stringify(audioPayload),
      });

      sendData = await sendRes.json();
      if (!sendRes.ok) {
        return NextResponse.json({ error: "Erro ao enviar áudio", details: sendData }, { status: sendRes.status });
      }
    } else if (isMedia) {
      // Evolution API v2: POST /message/sendMedia/{instanceName}
      // Assinatura do operador na legenda da mídia
      const captionWithName = messageBody && userName ? `*${userName}:* ${messageBody}` : messageBody || '';

      const mediaPayload: any = {
        number,
        mediatype: type,
        media: mediaBase64 || body.file,
        caption: captionWithName,
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
      // Assinatura do operador na mensagem WhatsApp
      let finalTextBody = messageBody;
      if (userName && messageBody) {
        finalTextBody = `*${userName}:*\n${messageBody}`;
      }

      const textPayload: any = {
        number,
        text: finalTextBody,
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
    
    // Salvar a mídia original (base64 com prefixo data:) para exibição no CRM
    let mediaUrl: string | null = null;
    if (isMedia && body.file) {
      mediaUrl = body.file; // já vem como data:mime;base64,... do frontend
    }

    // Texto de fallback para mensagens de mídia sem legenda
    const displayBody = messageBody || (
      isAudio ? "🎤 Áudio" :
      type === "image" ? "📷 Imagem" :
      type === "video" ? "🎬 Vídeo" :
      type === "document" ? "📄 Documento" :
      type === "sticker" ? "🏷️ Sticker" : ""
    );

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

    // Quando admin envia de outra instância (proxy), registra quem respondeu
    const messageData: any = {
      conversationId: conversation.id,
      messageId,
      body: displayBody,
      type: type || "text",
      mediaUrl,
      fromMe: true,
      status: "sent",
      timestamp: new Date(),
    };

    // Sempre registrar quem enviou a mensagem
    messageData.respondedBy = userId || dbInstance.userId || null;
    messageData.respondedByName = userName || 'Operador';

    const message = await prisma.whatsAppMessage.create({
      data: messageData,
    });

    const convUpdateData: any = { 
      lastMessage: displayBody, 
      lastMessageAt: new Date() 
    };
    
    // Atribuir operador à conversa se ainda não estiver atribuída
    if (userId) {
      convUpdateData.assignedTo = userId;
      convUpdateData.assignedToName = userName || 'Operador';
    }

    await prisma.whatsAppConversation.update({
      where: { id: conversation.id },
      data: convUpdateData,
    });

    return NextResponse.json({ success: true, message });

  } catch (error: any) {
    console.error("[WhatsApp Send API Error]:", error);
    return NextResponse.json({ error: "Erro interno", details: error.message }, { status: 500 });
  }
}
