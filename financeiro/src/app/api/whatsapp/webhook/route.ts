import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Webhook handler compatível com Evolution API v2.
 * 
 * Eventos tratados:
 * - messages.upsert    → Nova mensagem recebida/enviada
 * - messages.update    → Atualização de status da mensagem
 * - connection.update  → Mudança no status da conexão
 * - qrcode.updated     → Novo QR code gerado
 */
export async function POST(req: Request) {
  try {
    const payload = await req.json();

    // Evolution API v2 envia: { event, instance, data, ... }
    const event = payload.event || payload.EventType || payload.action;
    const instanceName = payload.instance || payload.instanceName;

    if (!instanceName && !payload.token) {
      return NextResponse.json({ success: true });
    }

    // Buscar instância no banco — Evolution identifica por nome, não por token
    const dbInstance = await prisma.whatsAppInstance.findFirst({
      where: payload.token
        ? { token: payload.token }          // fallback Uazapi (compatibilidade)
        : { name: instanceName },           // Evolution API
    });

    if (!dbInstance) {
      return NextResponse.json({ success: true });
    }

    // ─── MENSAGENS ────────────────────────────────────────────
    if (event === "messages.upsert" || event === "messages" || event === "messages_update" || event === "messages.update") {
      // Evolution: dados em payload.data; Uazapi fallback: payload.message
      const msgData = payload.data || payload.message;
      if (!msgData) return NextResponse.json({ success: true });

      // Evolution pode enviar array ou objeto único
      const messages = Array.isArray(msgData) ? msgData : [msgData];

      for (const msg of messages) {
        await processMessage(msg, dbInstance, payload);
      }
    }

    // ─── CONEXÃO ──────────────────────────────────────────────
    if (event === "connection.update" || event === "connection") {
      const state = payload.data?.state || payload.data?.status || payload.status;
      if (state) {
        const newStatus = state === "open" ? "connected"
          : state === "close" ? "disconnected"
          : state === "connecting" ? "connecting"
          : state;

        await prisma.whatsAppInstance.update({
          where: { id: dbInstance.id },
          data: { status: newStatus },
        });
      }
    }

    // ─── QR CODE ──────────────────────────────────────────────
    if (event === "qrcode.updated" || event === "qrcode") {
      const qrBase64 = payload.data?.qrcode?.base64 || payload.data?.base64 || payload.qrcode;
      if (qrBase64) {
        await prisma.whatsAppInstance.update({
          where: { id: dbInstance.id },
          data: { qrcode: qrBase64, status: "connecting" },
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[WhatsApp Webhook Error]:", error);
    return NextResponse.json({ success: false, error: error.message });
  }
}

/**
 * Processa uma mensagem individual do webhook
 */
async function processMessage(
  msg: any,
  dbInstance: { id: string; token: string; name: string },
  payload: any
) {
  // ─── Extrair dados da mensagem ────────────────────────────
  // Evolution API v2 format:
  //   msg.key.remoteJid, msg.key.fromMe, msg.key.id
  //   msg.pushName
  //   msg.message.conversation | msg.message.extendedTextMessage.text
  //   msg.messageTimestamp (unix seconds number)
  //   msg.messageType ("conversation", "extendedTextMessage", "imageMessage", etc.)
  //
  // Uazapi fallback format:
  //   msg.chatid, msg.fromMe, msg.messageid
  //   msg.senderName | msg.pushName
  //   msg.text
  //   msg.messageTimestamp (ISO string)

  const remoteJid = msg.key?.remoteJid || msg.chatid || msg.sender;
  if (!remoteJid) return;

  // Ignora grupos
  if (remoteJid.includes("@g.us")) return;

  // Extrair telefone
  const contactPhone = remoteJid.replace("@s.whatsapp.net", "").replace("@c.us", "");
  if (!/^\d{8,15}$/.test(contactPhone)) return;

  const isFromMe = msg.key?.fromMe ?? msg.fromMe ?? false;
  const messageId = msg.key?.id || msg.messageid || msg.id;
  if (!messageId) return;

  // ─── Extrair texto do corpo da mensagem ─────────────────────
  const messageBody = extractMessageBody(msg);

  // ─── Extrair tipo da mensagem ───────────────────────────────
  const msgType = extractMessageType(msg);

  // ─── Extrair nome do contato ────────────────────────────────
  const contactName = msg.pushName || msg.senderName || contactPhone;

  // ─── Extrair foto de perfil (se disponível) ──────────────────
  const profilePicFromPayload: string | null =
    msg.profilePicUrl ||
    msg.senderProfilePicUrl ||
    msg.contact?.profilePicUrl ||
    msg.chat?.profilePicUrl ||
    null;

  // ═══ 1. Encontrar ou criar contato ════════════════════════
  let contact = await prisma.whatsAppContact.findUnique({
    where: { phone: contactPhone },
  });

  const isNewContact = !contact;

  if (!contact) {
    contact = await prisma.whatsAppContact.create({
      data: {
        phone: contactPhone,
        name: contactName,
        profilePic: profilePicFromPayload,
      },
    });
  } else {
    const updates: any = {};
    if (contactName && contactName !== contactPhone && !contact.name) updates.name = contactName;
    if (profilePicFromPayload && !contact.profilePic) updates.profilePic = profilePicFromPayload;
    if (Object.keys(updates).length > 0) {
      contact = await prisma.whatsAppContact.update({
        where: { id: contact.id },
        data: updates,
      });
    }
  }

  // ═══ 2. Encontrar ou criar conversa (upsert para evitar duplicatas) ═══
  let conversation = await prisma.whatsAppConversation.upsert({
    where: {
      contactId_instanceId: {
        contactId: contact.id,
        instanceId: dbInstance.id,
      },
    },
    update: {}, // se já existe, não altera nada aqui
    create: {
      instanceId: dbInstance.id,
      contactId: contact.id,
      status: "open",
    },
  });

  const isNewConversation = (new Date().getTime() - new Date(conversation.createdAt).getTime()) < 5000;

  // Auto-reopen: se conversa está resolved/closed e cliente envia nova mensagem, reabrir
  if (conversation && !isFromMe && (conversation.status === 'resolved' || conversation.status === 'closed')) {
    conversation = await prisma.whatsAppConversation.update({
      where: { id: conversation.id },
      data: {
        status: 'open',
        reopenedAt: new Date(),
        reopenCount: { increment: 1 },
      },
    });
  }

  // ═══ 3. Auto-criar negócio no Pipeline ═════════════════════
  if (!isFromMe && (isNewContact || isNewConversation)) {
    try {
      let client = await prisma.client.findFirst({
        where: { phone: contactPhone },
      });

      if (!client) {
        client = await prisma.client.create({
          data: {
            name: contactName !== contactPhone ? contactName : `Lead WhatsApp ${contactPhone}`,
            phone: contactPhone,
            source: "whatsapp",
            stage: "entrada",
          },
        });
      }

      const existingDeal = await prisma.salesPipeline.findFirst({
        where: {
          clientId: client.id,
          lostReason: null,
          closedAt: null,
        },
      });

      if (!existingDeal) {
        const defaultPipeline = await prisma.pipeline.findFirst({
          orderBy: { createdAt: "asc" },
        });

        let defPipelineId: string | null = null;
        let defStageId: string | null = null;

        if (defaultPipeline) {
          defPipelineId = defaultPipeline.id;
          const firstStage = await prisma.pipelineStage.findFirst({
            where: { pipelineId: defaultPipeline.id },
            orderBy: { position: "asc" },
          });
          if (firstStage) defStageId = firstStage.id;
        }

        await prisma.salesPipeline.create({
          data: {
            clientId: client.id,
            clientName: client.name,
            stage: "novo_lead",
            pipelineId: defPipelineId,
            stageId: defStageId,
            source: "whatsapp",
            notes: `Lead via WhatsApp (${contactPhone})`,
          },
        });
      }
    } catch (e) {
      console.error("[Webhook] Erro ao criar negócio automático:", e);
    }
  }

  // ═══ 3.5 Automação de saudação para novos contatos ═════════
  if (!isFromMe && isNewConversation && isNewContact) {
    try {
      const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'http://localhost:8080';
      const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || '';

      // Mensagem de boas-vindas
      const greetingMsg = `Oi! Tudo bem? Bem-vindo(a) à *Virtuosa*! ✨ Para começarmos, como você se chama?`;

      await fetch(`${EVOLUTION_API_URL}/message/sendText/${dbInstance.name}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': EVOLUTION_API_KEY,
        },
        body: JSON.stringify({
          number: contactPhone,
          text: greetingMsg,
        }),
      });
    } catch (e) {
      console.error("[Webhook] Erro ao enviar saudação:", e);
    }
  }

  // ═══ 3.6 Capturar nome do cliente ══════════════════════════
  // Se o contato não tem nome e envia uma mensagem curta (provável resposta ao pedido de nome)
  if (!isFromMe && contact && (!contact.name || contact.name === contactPhone)) {
    const text = messageBody.trim();
    // Nome provável: 2-50 chars, sem números, sem links, pelo menos 2 palavras ou 1 palavra > 2 chars
    const looksLikeName = text.length >= 2 && text.length <= 50 &&
      !/\d/.test(text) && !text.includes('http') && !text.includes('@') &&
      !/^(oi|olá|ola|bom dia|boa tarde|boa noite|sim|não|ok|tudo bem|obrigado|obrigada|ajuda|help)$/i.test(text);

    if (looksLikeName) {
      // Capitalizar nome
      const capitalizedName = text.replace(/\b\w/g, (c) => c.toUpperCase());

      await prisma.whatsAppContact.update({
        where: { id: contact.id },
        data: { name: capitalizedName },
      });

      // Atualizar o client na tabela Client também
      try {
        await prisma.client.updateMany({
          where: { phone: contactPhone },
          data: { name: capitalizedName },
        });
      } catch {}

      // Enviar confirmação com o nome
      try {
        const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'http://localhost:8080';
        const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || '';
        const confirmMsg = `Anotado, ${capitalizedName}! 🚀 Nossa equipe já foi notificada e vai te responder o mais rápido possível.`;

        await fetch(`${EVOLUTION_API_URL}/message/sendText/${dbInstance.name}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': EVOLUTION_API_KEY,
          },
          body: JSON.stringify({
            number: contactPhone,
            text: confirmMsg,
          }),
        });
      } catch (e) {
        console.error('[Webhook] Erro ao enviar confirmação de nome:', e);
      }
    }
  }

  // Checar se é resposta de pesquisa CSAT (1, 2, ou 3)
  if (!isFromMe && conversation && ['1', '2', '3'].includes(messageBody.trim())) {
    const csatMap: Record<string, number> = { '1': 5, '2': 3, '3': 1 };
    const score = csatMap[messageBody.trim()];
    if (score && !conversation.satisfactionScore) {
      await prisma.whatsAppConversation.update({
        where: { id: conversation.id },
        data: { satisfactionScore: score },
      });
    }
  }

  // ═══ 4. Salvar ou atualizar mensagem ═══════════════════════
  const existingMsg = await prisma.whatsAppMessage.findUnique({
    where: { messageId },
  });

  if (!existingMsg) {
    let mediaUrl: string | null = null;
    let finalMsgType = msgType;

    // Na Evolution API v2, mídia pode vir como base64 no payload ou precisar download
    const isMedia = ["image", "video", "audio", "document", "ptt", "sticker",
      "imageMessage", "videoMessage", "audioMessage", "documentMessage", "stickerMessage",
      "pttMessage", "media", "videoplay"].includes(msgType);

    if (isMedia) {
      const mediaMessage = msg.message?.imageMessage || msg.message?.videoMessage ||
        msg.message?.audioMessage || msg.message?.documentMessage ||
        msg.message?.stickerMessage;

      if (mediaMessage) {
        // Tentar baixar mídia via Evolution API getBase64FromMediaMessage
        try {
          const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'http://localhost:8080';
          const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || '';

          const mediaRes = await fetch(
            `${EVOLUTION_API_URL}/chat/getBase64FromMediaMessage/${dbInstance.name}`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'apikey': EVOLUTION_API_KEY,
              },
              body: JSON.stringify({ message: msg }),
            }
          );

          if (mediaRes.ok) {
            const mediaData = await mediaRes.json();
            if (mediaData.base64) {
              const mimetype = mediaMessage.mimetype || 'application/octet-stream';
              mediaUrl = `data:${mimetype};base64,${mediaData.base64}`;
            }
          }
        } catch (e) {
          console.error('[Webhook] Erro ao baixar mídia via Evolution API:', e);
        }

        // Fallback: verificar se URL ou base64 já veio no payload
        if (!mediaUrl) {
          if (mediaMessage.url) {
            mediaUrl = mediaMessage.url;
          } else if (mediaMessage.base64) {
            const mimetype = mediaMessage.mimetype || 'application/octet-stream';
            mediaUrl = `data:${mimetype};base64,${mediaMessage.base64}`;
          }
        }
      }

      // Normalizar tipo da mensagem
      if (finalMsgType === "media" || finalMsgType === "imageMessage") finalMsgType = "image";
      else if (finalMsgType === "videoMessage" || finalMsgType === "videoplay") finalMsgType = "video";
      else if (finalMsgType === "audioMessage" || finalMsgType === "ptt" || finalMsgType === "pttMessage") finalMsgType = "audio";
      else if (finalMsgType === "documentMessage") finalMsgType = "document";
      else if (finalMsgType === "stickerMessage") finalMsgType = "sticker";
    }

    // Timestamp: Evolution usa unix seconds (number), Uazapi usa ISO string
    let timestamp: Date;
    if (typeof msg.messageTimestamp === "number") {
      timestamp = new Date(msg.messageTimestamp * 1000);
    } else if (msg.messageTimestamp) {
      timestamp = new Date(msg.messageTimestamp);
    } else {
      timestamp = new Date();
    }

    await prisma.whatsAppMessage.create({
      data: {
        conversationId: conversation.id,
        messageId,
        body: messageBody,
        type: finalMsgType,
        mediaUrl,
        fromMe: isFromMe,
        status: isFromMe ? "sent" : "delivered",
        timestamp,
      },
    });
  } else {
    // Atualiza status de mensagem existente
    const dataToUpdate: any = {};

    // Evolution: status vem em messages.update
    if (msg.status !== undefined) {
      const statusMap: Record<number, string> = {
        0: "error",
        1: "pending",
        2: "sent",
        3: "delivered",
        4: "read",
        5: "played",
      };
      dataToUpdate.status = typeof msg.status === "number"
        ? (statusMap[msg.status] || "sent")
        : (msg.status || existingMsg.status);
    }

    if (Object.keys(dataToUpdate).length > 0) {
      await prisma.whatsAppMessage.update({
        where: { messageId },
        data: dataToUpdate,
      });
    }
  }

  // ═══ 5. Atualizar última mensagem na conversa ═══════════════
  await prisma.whatsAppConversation.update({
    where: { id: conversation.id },
    data: {
      lastMessage: messageBody || existingMsg?.body,
      lastMessageAt: new Date(),
      unreadCount: isFromMe ? 0 : { increment: 1 },
    },
  });
}

// ─── Helpers ────────────────────────────────────────────────────

function extractMessageBody(msg: any): string {
  // Evolution API v2: texto em diferentes locais dependendo do tipo
  if (msg.message) {
    const m = msg.message;
    return (
      m.conversation ||
      m.extendedTextMessage?.text ||
      m.imageMessage?.caption ||
      m.videoMessage?.caption ||
      m.documentMessage?.caption ||
      m.buttonsResponseMessage?.selectedDisplayText ||
      m.listResponseMessage?.title ||
      m.templateButtonReplyMessage?.selectedDisplayText ||
      ""
    );
  }
  // Uazapi fallback
  return msg.text || (msg.content && msg.content.text) || "";
}

function extractMessageType(msg: any): string {
  // Evolution API v2: msg.messageType contém o tipo
  if (msg.messageType) {
    const typeMap: Record<string, string> = {
      conversation: "text",
      extendedTextMessage: "text",
      imageMessage: "image",
      videoMessage: "video",
      audioMessage: "audio",
      documentMessage: "document",
      stickerMessage: "sticker",
      pttMessage: "ptt",
      contactMessage: "text",
      locationMessage: "text",
      reactionMessage: "text",
    };
    return typeMap[msg.messageType] || msg.messageType;
  }
  // Uazapi fallback
  return msg.type || msg.messageType || "text";
}
