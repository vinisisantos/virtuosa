import { NextResponse } from "next/server";
import { getInstancesForRequest } from "@/lib/whatsapp/instance-resolver";

import { prisma } from "@/lib/db";

const getEvolutionConfig = () => ({
  url: process.env.EVOLUTION_API_URL || "http://localhost:8080",
  apiKey: process.env.EVOLUTION_API_KEY || "",
});

function resolveSendTarget(lastKnownJid: string | null | undefined, phoneDigits: string) {
  const jid = (lastKnownJid || "").trim();
  const lowerJid = jid.toLowerCase();

  // A Evolution espera telefone puro para JIDs normais (@s.whatsapp.net).
  // O JID exato só é necessário para contatos LID, onde enviar pelo telefone
  // pode ser aceito pela API mas não sair de fato.
  if (jid && (lowerJid.includes("@lid") || lowerJid.includes("@hosted.lid"))) {
    return jid;
  }

  return phoneDigits;
}

export async function POST(req: Request) {
  const { url, apiKey } = getEvolutionConfig();
  try {
    const body = await req.json();

    const { contactId, conversationId, body: messageBody, type, replyid, viewOnce } = body;

    if (!contactId || (!messageBody && !body.file)) {
      return NextResponse.json({ error: "Faltam parâmetros obrigatórios" }, { status: 400 });
    }

    // Resolver instâncias do usuário autenticado (ou targetUserId para admin)
    const { instances: dbInstances, isProxy } = await getInstancesForRequest(req);
    const userId = req.headers.get('x-user-id') || '';
    const userName = req.headers.get('x-user-name') || '';
    const operationalInstances = dbInstances.filter((instance: any) => instance.status !== "archived");

    if (!operationalInstances || operationalInstances.length === 0) {
      return NextResponse.json({ error: "Nenhuma instância encontrada" }, { status: 404 });
    }

    let number = contactId.replace(/\D/g, "");

    // Achar/Criar contato
    let contact = await prisma.whatsAppContact.findUnique({ where: { phone: number } });
    if (!contact) {
      contact = await prisma.whatsAppContact.create({
        data: { phone: number, name: number },
      });
    }
    if (!contact) {
      return NextResponse.json({ error: "Contato não encontrado" }, { status: 404 });
    }

    // Determinar qual instância usar
    let dbInstance = null;
    const instanceIds = operationalInstances.map((i: any) => i.id);
    let conversationFromPayload: any = null;

    // 1. Se o frontend enviou a conversa, ela é a fonte mais confiável da instância.
    if (conversationId) {
      conversationFromPayload = await prisma.whatsAppConversation.findFirst({
        where: { id: conversationId, instanceId: { in: instanceIds } },
        include: { contact: true },
      });

      if (!conversationFromPayload) {
        return NextResponse.json({ error: "Conversa não encontrada para este WhatsApp" }, { status: 404 });
      }

      if (conversationFromPayload.contact) {
        contact = conversationFromPayload.contact;
        number = conversationFromPayload.contact.phone.replace(/\D/g, "");
      }

      dbInstance = operationalInstances.find((i: any) => i.id === conversationFromPayload.instanceId);
    }

    // 2. Se o frontend enviou uma instância específica
    if (!dbInstance && body.instanceId) {
      dbInstance = operationalInstances.find((i: any) => i.id === body.instanceId);
    }

    // 3. Tentar achar a última conversa deste contato com alguma das instâncias do usuário
    if (!dbInstance) {
      let existingConv = await prisma.whatsAppConversation.findFirst({
        where: { contactId: contact!.id, instanceId: { in: instanceIds } },
        orderBy: { lastMessageAt: "desc" }
      });
      if (existingConv) {
        dbInstance = operationalInstances.find((i: any) => i.id === existingConv.instanceId);
      }
    }

    // 4. Fallback: primeira instância conectada ou a primeira da lista
    if (!dbInstance) {
      dbInstance = operationalInstances.find((i: any) => i.status === "connected") || operationalInstances[0];
    }

    if (!dbInstance) {
      return NextResponse.json({ error: "Instância válida não encontrada" }, { status: 404 });
    }

    if (dbInstance.status !== "connected") {
      return NextResponse.json({
        error: "Este WhatsApp está desconectado. Reconecte a instância antes de enviar mensagens.",
        instanceId: dbInstance.id,
        status: dbInstance.status,
      }, { status: 409 });
    }

    const instanceName = dbInstance.name;
    const isMedia = ["image", "video", "audio", "document", "ptt", "sticker"].includes(type);
    const isAudio = ["audio", "ptt"].includes(type);

    // Limpar prefixo data: do base64 se presente
    let mediaBase64 = body.file || "";
    if (mediaBase64.includes(",")) {
      mediaBase64 = mediaBase64.split(",")[1];
    }

    let conversation = conversationFromPayload || await prisma.whatsAppConversation.findFirst({
      where: { contactId: contact!.id, instanceId: dbInstance.id },
    });

    if (!conversation) {
      conversation = await prisma.whatsAppConversation.create({
        data: {
          instanceId: dbInstance.id,
          contactId: contact!.id,
          status: "open",
        },
      });
    }

    // Contatos que a sessão só reconhece pelo LID (@lid) não recebem quando o
    // envio é endereçado pelo telefone — a Evolution aceita e nunca entrega
    // (fica preso em "sent"). Usa o JID exato observado na última mensagem
    // recebida desse contato nesta instância, quando disponível.
    const sendTarget = resolveSendTarget(conversation.lastKnownJid, number);

    let sendData: any;

    if (isAudio && mediaBase64) {
      // Evolution API v2: POST /message/sendWhatsAppAudio/{instanceName}
      const audioPayload = {
        number: sendTarget,
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
        number: sendTarget,
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
        number: sendTarget,
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
