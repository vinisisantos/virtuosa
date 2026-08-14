import { NextResponse } from "next/server";
import { getInstancesForRequest } from "@/lib/whatsapp/instance-resolver";
import {
  extractWahaMessageId,
  getInstanceProvider,
  getWahaConfig,
  sendWahaMedia,
  sendWahaText,
  toWahaChatId,
  type WhatsAppProvider,
} from "@/lib/whatsapp/provider";

import { prisma } from "@/lib/db";
import {
  createPrivateBlobReadUrl,
  inspectPrivateBlob,
  isPrivateBlobUrl,
  signPrivateMediaUrls,
} from "@/lib/whatsapp/media-storage";
import { WHATSAPP_MEDIA_MAX_FILE_BYTES } from "@/lib/whatsapp/media-constraints";
import { recordOutboundForCallbackTracking } from "@/lib/whatsapp/callbacks";
import { renderWhatsAppMessageTemplate } from "@/lib/whatsapp/message-template";
import { validateWhatsAppSendPayload } from "@/lib/whatsapp/send-payload";

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

function maskSecret(value?: string | null) {
  const clean = (value || "").trim();
  if (!clean) return "";
  if (clean.length <= 8) return `${clean.slice(0, 2)}...len${clean.length}`;
  return `${clean.slice(0, 4)}...${clean.slice(-4)} len${clean.length}`;
}

async function readEvolutionPayload(res: Response) {
  const text = await res.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function redactSendPayload(payload: Record<string, any>) {
  const redacted = { ...payload };
  if (typeof redacted.media === "string") {
    redacted.media = `[media base64 len ${redacted.media.length}]`;
  }
  if (typeof redacted.audio === "string") {
    redacted.audio = `[audio base64 len ${redacted.audio.length}]`;
  }
  if (redacted.file && typeof redacted.file === "object" && typeof redacted.file.data === "string") {
    redacted.file = {
      ...redacted.file,
      data: `[file base64 len ${redacted.file.data.length}]`,
    };
  }
  if (redacted.file && typeof redacted.file === "object" && typeof redacted.file.url === "string") {
    redacted.file = {
      ...redacted.file,
      url: "[temporary signed media url]",
    };
  }
  return redacted;
}

function parseDataUrlMetadata(value?: string | null) {
  const clean = (value || "").trim();
  const match = clean.match(/^data:([^;,]+)(?:;[^,]*)?,(.*)$/);
  if (!match) return { mimeType: null as string | null, sizeBytes: null as number | null };

  const base64 = match[2] || "";
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  const sizeBytes = Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
  return {
    mimeType: match[1] || null,
    sizeBytes: Number.isFinite(sizeBytes) ? sizeBytes : null,
  };
}

function cleanFileName(value?: unknown) {
  const clean = typeof value === "string" ? value.trim() : "";
  return clean ? clean.slice(0, 255) : null;
}

function cleanMimeType(value?: unknown) {
  const clean = typeof value === "string" ? value.trim() : "";
  return clean ? clean.slice(0, 120) : null;
}

function cleanSizeBytes(value?: unknown) {
  const size = Number(value);
  return Number.isFinite(size) && size >= 0 ? Math.round(size) : null;
}

function quotedMessagePreview(message?: {
  body?: string | null;
  type?: string | null;
  mediaFileName?: string | null;
}) {
  const body = (message?.body || "").trim();
  if (body) return body.slice(0, 500);
  if (message?.type === "image") return "Imagem";
  if (message?.type === "audio" || message?.type === "ptt") return "Áudio";
  if (message?.type === "video") return "Vídeo";
  if (message?.type === "document") return message.mediaFileName || "Documento";
  return "Mensagem";
}

async function logSendDiagnostic(params: {
  instanceId: string;
  instanceName: string;
  userId: string;
  userName: string;
  conversationId: string;
  contactPhone: string;
  lastKnownJid: string | null;
  sendTarget: string;
  type: string;
  path: string;
  apiKey: string;
  requestBody: Record<string, any>;
  responseStatus: number;
  responseOk: boolean;
  responseBody: unknown;
  messageId?: string | null;
  provider?: WhatsAppProvider;
}) {
  const provider = params.provider || "evolution";
  const diagnostic = {
    provider,
    instanceId: params.instanceId,
    instanceName: params.instanceName,
    userId: params.userId || null,
    userName: params.userName || null,
    conversationId: params.conversationId,
    contactPhone: params.contactPhone,
    lastKnownJid: params.lastKnownJid,
    sendTarget: params.sendTarget,
    type: params.type,
    method: "POST",
    path: params.path,
    requestHeaders: {
      "Content-Type": "application/json",
      ...(provider === "waha"
        ? { "X-Api-Key": maskSecret(params.apiKey) }
        : { apikey: maskSecret(params.apiKey) }),
    },
    requestBody: redactSendPayload(params.requestBody),
    responseStatus: params.responseStatus,
    responseOk: params.responseOk,
    responseBody: params.responseBody,
    messageId: params.messageId || null,
  };

  await prisma.webhookLog.create({
    data: {
      source: provider === "waha" ? "whatsapp_waha" : "whatsapp_evolution",
      eventType: "message_send_attempt",
      status: params.responseOk ? "sent" : "error",
      payload: JSON.stringify(diagnostic).slice(0, 6000),
      errorMessage: params.responseOk ? null : JSON.stringify(params.responseBody).slice(0, 800),
    },
  }).catch(() => {});
}

export async function POST(req: Request) {
  const { url, apiKey } = getEvolutionConfig();
  try {
    const body = await req.json();

    const contactId = typeof body.contactId === "string" ? body.contactId.trim() : "";
    const conversationId = typeof body.conversationId === "string" ? body.conversationId.trim() : "";
    const { type, viewOnce } = body;
    const rawMessageBody = typeof body.body === "string" ? body.body : "";
    const claimConversation = body.claimConversation === true;
    const replyid = typeof body.replyid === "string"
      ? body.replyid
      : typeof body.replyId === "string"
        ? body.replyId
        : "";

    const validationError = validateWhatsAppSendPayload(body);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    // Resolver instâncias do usuário autenticado (ou targetUserId para admin)
    const { instances: dbInstances, isProxy } = await getInstancesForRequest(req);
    const userId = req.headers.get('x-user-id') || '';
    const userName = req.headers.get('x-user-name') || '';
    const operationalInstances = dbInstances.filter((instance: any) => instance.status !== "archived");

    if (!operationalInstances || operationalInstances.length === 0) {
      return NextResponse.json({ error: "Nenhuma instância encontrada" }, { status: 404 });
    }

    // Determinar qual instância usar
    let dbInstance = null;
    const instanceIds = operationalInstances.map((i: any) => i.id);
    let conversationFromPayload: any = null;
    let contact: any = null;
    let number = "";

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

    // Fluxos antigos ainda podem enviar somente o telefone. Quando há
    // conversationId, não dependemos do contato parcial mantido no navegador.
    if (!contact) {
      number = contactId.replace(/\D/g, "");
      if (!number) {
        return NextResponse.json({ error: "Contato sem telefone válido" }, { status: 400 });
      }

      contact = await prisma.whatsAppContact.findUnique({ where: { phone: number } });
      if (!contact) {
        contact = await prisma.whatsAppContact.create({
          data: { phone: number, name: number },
        });
      }
    }

    if (!contact) {
      return NextResponse.json({ error: "Contato não encontrado" }, { status: 404 });
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

    if (dbInstance.canReply !== true) {
      return NextResponse.json({
        error: "Seu acesso a este WhatsApp é somente para visualização.",
      }, { status: 403 });
    }

    if (dbInstance.status !== "connected") {
      return NextResponse.json({
        error: "Este WhatsApp está desconectado. Reconecte a instância antes de enviar mensagens.",
        instanceId: dbInstance.id,
        status: dbInstance.status,
      }, { status: 409 });
    }

    const instanceName = dbInstance.name;
    const provider = getInstanceProvider(dbInstance);
    const isMedia = ["image", "video", "audio", "document", "ptt", "sticker"].includes(type);
    const isAudio = ["audio", "ptt"].includes(type);

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

    if (conversation.blockedAt) {
      return NextResponse.json({
        error: "Este contato está bloqueado no WhatsApp. Desbloqueie-o antes de enviar mensagens.",
      }, { status: 409 });
    }

    if (userId) {
      const previousAssignee = conversation.assignedTo;
      const mayTakeOver = dbInstance.canManage === true;
      if (previousAssignee && previousAssignee !== userId && !mayTakeOver) {
        return NextResponse.json({
          error: `Esta conversa está em atendimento por ${conversation.assignedToName || "outro operador"}.`,
        }, { status: 409 });
      }

      const claimed = await prisma.whatsAppConversation.updateMany({
        where: {
          id: conversation.id,
          assignedTo: previousAssignee,
        },
        data: {
          assignedTo: userId,
          assignedToName: userName || "Operador",
          ...(claimConversation ? { status: "open", unreadCount: 0 } : {}),
        },
      });
      if (claimed.count !== 1) {
        return NextResponse.json({
          error: "A conversa foi assumida por outra pessoa. Atualize a tela antes de responder.",
        }, { status: 409 });
      }

      if (previousAssignee !== userId) {
        await prisma.activityLog.create({
          data: {
            userId,
            userName: userName || "Operador",
            action: previousAssignee ? "whatsapp_conversation_transferred" : "whatsapp_conversation_claimed",
            entityType: "WhatsAppConversation",
            entityId: conversation.id,
            description: previousAssignee
              ? `Atendimento transferido de ${conversation.assignedToName || "outro operador"} para ${userName || "Operador"}`
              : `Atendimento assumido por ${userName || "Operador"}`,
            metadata: JSON.stringify({
              instanceId: dbInstance.id,
              previousAssignee: previousAssignee || null,
              nextAssignee: userId,
            }),
            unit: dbInstance.unit || null,
          },
        }).catch(() => {});
      }

      conversation = {
        ...conversation,
        assignedTo: userId,
        assignedToName: userName || "Operador",
        ...(claimConversation ? { status: "open", unreadCount: 0 } : {}),
      };
    }

    const resolvedContact = contact!;
    const messageBody = renderWhatsAppMessageTemplate(rawMessageBody, {
      contactName: resolvedContact.name,
      contactPhone: resolvedContact.phone,
      unit: dbInstance.unit || resolvedContact.unit,
      attendantName: userName || conversation.assignedToName,
    });

    const originalMediaReference = isMedia && typeof body.file === "string" ? body.file.trim() : "";
    const usesPrivateBlob = isPrivateBlobUrl(originalMediaReference);
    let providerMediaReference = originalMediaReference;
    let verifiedMediaMimeType = cleanMimeType(body.mimeType || body.fileMimeType);
    let verifiedMediaSizeBytes = cleanSizeBytes(body.fileSize || body.fileSizeBytes || body.mediaSizeBytes);

    if (usesPrivateBlob) {
      const metadata = await inspectPrivateBlob(originalMediaReference);
      const expectedPrefix = `whatsapp/${conversation.id}/`;
      if (!metadata || !metadata.pathname.startsWith(expectedPrefix)) {
        return NextResponse.json({ error: "Arquivo não pertence a esta conversa" }, { status: 400 });
      }
      if (metadata.size > WHATSAPP_MEDIA_MAX_FILE_BYTES) {
        return NextResponse.json({ error: "O arquivo ultrapassa o limite de 100 MB" }, { status: 413 });
      }

      verifiedMediaMimeType = cleanMimeType(metadata.contentType) || verifiedMediaMimeType;
      verifiedMediaSizeBytes = metadata.size;
      providerMediaReference = await createPrivateBlobReadUrl(originalMediaReference, 10 * 60 * 1000);
    } else if (originalMediaReference.includes(",")) {
      providerMediaReference = originalMediaReference.split(",")[1];
    }

    // Contatos que a sessão só reconhece pelo LID (@lid) não recebem quando o
    // envio é endereçado pelo telefone — a Evolution aceita e nunca entrega
    // (fica preso em "sent"). Usa o JID exato observado na última mensagem
    // recebida desse contato nesta instância, quando disponível.
    const sendTarget = resolveSendTarget(conversation.lastKnownJid, number);
    const providerSendTarget = provider === "waha" ? toWahaChatId(conversation.lastKnownJid || sendTarget) : sendTarget;
    const quotedMessage = replyid
      ? await prisma.whatsAppMessage.findFirst({
          where: {
            conversationId: conversation.id,
            messageId: replyid,
          },
          select: {
            messageId: true,
            body: true,
            type: true,
            mediaFileName: true,
            fromMe: true,
          },
        })
      : null;

    let sendData: any;
    let sendDiagnostic: {
      path: string;
      requestBody: Record<string, any>;
      responseStatus: number;
      responseOk: boolean;
      responseBody: unknown;
    } | null = null;

    if (provider === "waha") {
      const { url: wahaUrl, apiKey } = getWahaConfig();
      if (!wahaUrl || !apiKey) {
        return NextResponse.json({ error: "WAHA_API_URL/WAHA_API_KEY não configuradas" }, { status: 500 });
      }

      if (isMedia) {
        const captionWithName = messageBody && userName ? `*${userName}:* ${messageBody}` : messageBody || "";
        const result = await sendWahaMedia({
          sessionName: instanceName,
          chatId: providerSendTarget,
          type: type || "document",
          file: providerMediaReference,
          caption: captionWithName,
          fileName: body.docName || undefined,
          mimeType: verifiedMediaMimeType,
          replyTo: replyid || null,
        });
        sendData = result.data;
        sendDiagnostic = {
          path: result.path,
          requestBody: result.body,
          responseStatus: result.res.status,
          responseOk: result.res.ok,
          responseBody: sendData,
        };
        if (!result.res.ok) {
          await logSendDiagnostic({
            instanceId: dbInstance.id,
            instanceName,
            userId,
            userName,
            conversationId: conversation.id,
            contactPhone: number,
            lastKnownJid: conversation.lastKnownJid,
            sendTarget: providerSendTarget,
            type: type || "media",
            apiKey,
            provider,
            ...sendDiagnostic,
          });
          return NextResponse.json({ error: "Erro ao enviar mídia pela WAHA", details: sendData }, { status: result.res.status });
        }
      } else {
        let finalTextBody = messageBody;
        if (userName && messageBody) {
          finalTextBody = `*${userName}:*\n${messageBody}`;
        }
        const result = await sendWahaText({
          sessionName: instanceName,
          chatId: providerSendTarget,
          text: finalTextBody,
          replyTo: replyid || null,
        });
        sendData = result.data;
        sendDiagnostic = {
          path: "/api/sendText",
          requestBody: result.body,
          responseStatus: result.res.status,
          responseOk: result.res.ok,
          responseBody: sendData,
        };
        if (!result.res.ok) {
          await logSendDiagnostic({
            instanceId: dbInstance.id,
            instanceName,
            userId,
            userName,
            conversationId: conversation.id,
            contactPhone: number,
            lastKnownJid: conversation.lastKnownJid,
            sendTarget: providerSendTarget,
            type: type || "text",
            apiKey,
            provider,
            ...sendDiagnostic,
          });
          return NextResponse.json({ error: "Erro ao enviar mensagem pela WAHA", details: sendData }, { status: result.res.status });
        }
      }
    } else if (isAudio && providerMediaReference) {
      // Evolution API v2: POST /message/sendWhatsAppAudio/{instanceName}
      const audioPayload = {
        number: sendTarget,
        audio: providerMediaReference,
        encoding: !usesPrivateBlob,
        ...(replyid ? { quoted: { key: { id: replyid } } } : {}),
      };

      const sendRes = await fetch(`${url}/message/sendWhatsAppAudio/${instanceName}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": apiKey,
        },
        body: JSON.stringify(audioPayload),
      });

      sendData = await readEvolutionPayload(sendRes);
      sendDiagnostic = {
        path: `/message/sendWhatsAppAudio/${instanceName}`,
        requestBody: audioPayload,
        responseStatus: sendRes.status,
        responseOk: sendRes.ok,
        responseBody: sendData,
      };
      if (!sendRes.ok) {
        await logSendDiagnostic({
          instanceId: dbInstance.id,
          instanceName,
          userId,
          userName,
          conversationId: conversation.id,
          contactPhone: number,
          lastKnownJid: conversation.lastKnownJid,
          sendTarget,
          type: type || "audio",
          apiKey,
          provider,
          ...sendDiagnostic,
        });
        return NextResponse.json({ error: "Erro ao enviar áudio", details: sendData }, { status: sendRes.status });
      }
    } else if (isMedia) {
      // Evolution API v2: POST /message/sendMedia/{instanceName}
      // Assinatura do operador na legenda da mídia
      const captionWithName = messageBody && userName ? `*${userName}:* ${messageBody}` : messageBody || '';

      const mediaPayload: any = {
        number: sendTarget,
        mediatype: type,
        media: providerMediaReference,
        caption: captionWithName,
        fileName: body.docName || undefined,
        ...(verifiedMediaMimeType ? { mimetype: verifiedMediaMimeType } : {}),
      };
      if (replyid) {
        mediaPayload.quoted = { key: { id: replyid } };
      }

      const sendRes = await fetch(`${url}/message/sendMedia/${instanceName}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": apiKey,
        },
        body: JSON.stringify(mediaPayload),
      });

      sendData = await readEvolutionPayload(sendRes);
      sendDiagnostic = {
        path: `/message/sendMedia/${instanceName}`,
        requestBody: mediaPayload,
        responseStatus: sendRes.status,
        responseOk: sendRes.ok,
        responseBody: sendData,
      };
      if (!sendRes.ok) {
        await logSendDiagnostic({
          instanceId: dbInstance.id,
          instanceName,
          userId,
          userName,
          conversationId: conversation.id,
          contactPhone: number,
          lastKnownJid: conversation.lastKnownJid,
          sendTarget,
          type: type || "media",
          apiKey,
          provider,
          ...sendDiagnostic,
        });
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

      sendData = await readEvolutionPayload(sendRes);
      sendDiagnostic = {
        path: `/message/sendText/${instanceName}`,
        requestBody: textPayload,
        responseStatus: sendRes.status,
        responseOk: sendRes.ok,
        responseBody: sendData,
      };
      if (!sendRes.ok) {
        await logSendDiagnostic({
          instanceId: dbInstance.id,
          instanceName,
          userId,
          userName,
          conversationId: conversation.id,
          contactPhone: number,
          lastKnownJid: conversation.lastKnownJid,
          sendTarget,
          type: type || "text",
          apiKey,
          provider,
          ...sendDiagnostic,
        });
        return NextResponse.json({ error: "Erro ao enviar mensagem", details: sendData }, { status: sendRes.status });
      }
    }

    // Evolution retorna { key: { remoteJid, fromMe, id }, message, messageTimestamp, status }
    const sendDataObject = sendData && typeof sendData === "object" ? sendData : {};
    const messageId = provider === "waha"
      ? (extractWahaMessageId(sendData) || `waha_${Date.now()}`)
      : (sendDataObject.key?.id || sendDataObject.id || `temp_${Date.now()}`);
    if (sendDiagnostic) {
      await logSendDiagnostic({
        instanceId: dbInstance.id,
        instanceName,
        userId,
        userName,
        conversationId: conversation.id,
        contactPhone: number,
        lastKnownJid: conversation.lastKnownJid,
        sendTarget: providerSendTarget,
        type: type || "text",
        apiKey,
        provider,
        ...sendDiagnostic,
        messageId,
      });
    }
    
    // Mantém a referência privada permanente; somente URLs assinadas e temporárias
    // são entregues ao navegador e aos provedores.
    let mediaUrl: string | null = null;
    if (isMedia && originalMediaReference) {
      mediaUrl = originalMediaReference;
    }
    const parsedMedia = parseDataUrlMetadata(mediaUrl);
    const mediaFileName = cleanFileName(body.docName || body.fileName);
    const mediaMimeType = verifiedMediaMimeType || parsedMedia.mimeType;
    const mediaSizeBytes = verifiedMediaSizeBytes ?? parsedMedia.sizeBytes;

    // Texto de fallback para mensagens de mídia sem legenda
    const displayBody = messageBody || (
      isAudio ? "🎤 Áudio" :
      type === "image" ? "📷 Imagem" :
      type === "video" ? "🎬 Vídeo" :
      type === "document" ? "📄 Documento" :
      type === "sticker" ? "🏷️ Sticker" : ""
    );

    // Quando admin envia de outra instância (proxy), registra quem respondeu
    const sentAt = new Date();
    const messageData: any = {
      conversationId: conversation.id,
      messageId,
      // O fallback identifica o tipo na lista de conversas, mas não é legenda.
      // No balão, mídia sem texto deve persistir com corpo vazio.
      body: isMedia ? messageBody || "" : displayBody,
      type: type || "text",
      mediaUrl,
      mediaFileName,
      mediaMimeType,
      mediaSizeBytes,
      fromMe: true,
      status: "sent",
      timestamp: sentAt,
    };
    if (quotedMessage) {
      messageData.quotedMessageId = quotedMessage.messageId;
      messageData.quotedMessageBody = quotedMessagePreview(quotedMessage);
      messageData.quotedMessageType = quotedMessage.type || "text";
      messageData.quotedMessageFromMe = quotedMessage.fromMe;
    }

    // Sempre registrar quem enviou a mensagem
    messageData.respondedBy = userId || dbInstance.userId || null;
    messageData.respondedByName = userName || 'Operador';

    const convUpdateData: any = { 
      lastMessage: displayBody, 
      lastMessageAt: sentAt,
      archivedAt: null,
      archivedBy: null,
      archivedByName: null,
    };
    
    if (claimConversation) {
      convUpdateData.status = "open";
      convUpdateData.unreadCount = 0;
    }

    const { message, callbackTracking } = await prisma.$transaction(async (tx) => {
      const savedMessage = await tx.whatsAppMessage.create({ data: messageData });
      const attemptCounted = await recordOutboundForCallbackTracking(tx, conversation.id, sentAt);
      const updatedConversation = await tx.whatsAppConversation.update({
        where: { id: conversation.id },
        data: convUpdateData,
        select: {
          updatedAt: true,
          lastOutboundAt: true,
          callbackDueAt: true,
          callbackTrackingStartedAt: true,
          callbackStreakCount: true,
          callbackTotalCount: true,
        },
      });
      return {
        message: savedMessage,
        callbackTracking: {
          ...updatedConversation,
          attemptCounted,
        },
      };
    });

    const [responseMessage] = await signPrivateMediaUrls([message]);
    return NextResponse.json({ success: true, message: responseMessage, callbackTracking });

  } catch (error: any) {
    console.error("[WhatsApp Send API Error]:", error);
    return NextResponse.json({ error: "Erro interno", details: error.message }, { status: 500 });
  }
}
