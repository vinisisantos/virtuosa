import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function POST(req: Request) {
  try {
    const payload = await req.json();

    try {
      await prisma.whatsAppMessage.create({
        data: {
          conversationId: "debug-logger",
          messageId: "dbg_" + Date.now(),
          body: JSON.stringify(payload),
          type: "debug",
          fromMe: false,
          status: "delivered",
          timestamp: new Date(),
        }
      });
    } catch (e) {
      // Ignora erro do logger
    }
    
    const event = payload.EventType || payload.event;
    const instanceToken = payload.token;

    if (!instanceToken) {
      return NextResponse.json({ success: true });
    }

    const dbInstance = await prisma.whatsAppInstance.findFirst({
      where: { token: instanceToken },
    });

    if (!dbInstance) {
      return NextResponse.json({ success: true }); // Ignora instâncias que não conhecemos
    }

    // Uazapi real payload sends a single message object in `payload.message`
    if (event === "messages" || event === "messages_update") {
      const msg = payload.message;
      if (!msg) return NextResponse.json({ success: true });

      const remoteJid = msg.chatid || msg.sender;
      // ignora mensagens sem remetente claro
      if (!remoteJid) {
        return NextResponse.json({ success: true });
      }

      // 1. Encontrar ou criar o contato
      const contactPhone = remoteJid.replace("@s.whatsapp.net", "").replace("@c.us", "");
      let contactName = msg.senderName || msg.pushName || contactPhone;

      let contact = await prisma.whatsAppContact.findUnique({
        where: { phone: contactPhone },
      });

      if (!contact) {
        contact = await prisma.whatsAppContact.create({
          data: { phone: contactPhone, name: contactName },
        });
      }

      // 2. Encontrar ou criar a conversa (vinculada à instância)
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

      // 3. Salvar a mensagem
      const messageId = msg.messageid || msg.id;
      const messageBody = msg.text || (msg.content && msg.content.text) || "";
      const isFromMe = msg.fromMe || false;
      const msgType = msg.type || msg.messageType || "text";

      // Se já existe uma mensagem com esse ID, não duplica (pode ser "messages_update")
      const existingMsg = await prisma.whatsAppMessage.findUnique({
        where: { messageId },
      });

      if (!existingMsg) {
        let mediaUrl = null;
        let finalMsgType = msgType;
        
        // Se for mídia, tenta resgatar a URL
        const isMedia = ["media", "image", "video", "audio", "document", "ptt", "sticker", "videoplay", "imageMessage", "videoMessage", "audioMessage", "documentMessage", "stickerMessage"].includes(msgType);
        if (isMedia && messageId) {
          try {
            const UAZAPI_URL = process.env.UAZAPI_URL || "https://free.uazapi.com";
            const downloadRes = await fetch(`${UAZAPI_URL}/message/download`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "token": instanceToken,
              },
              body: JSON.stringify({
                id: messageId,
                return_link: true,
                generate_mp3: true
              })
            });
            const downloadData = await downloadRes.json();
            if (downloadData && downloadData.fileURL) {
              mediaUrl = downloadData.fileURL;
              
              // Ajustar o tipo visual baseado no mimetype se for apenas "media"
              if (finalMsgType === "media" && downloadData.mimetype) {
                if (downloadData.mimetype.startsWith("image/")) finalMsgType = "image";
                else if (downloadData.mimetype.startsWith("audio/")) finalMsgType = "audio";
                else if (downloadData.mimetype.startsWith("video/")) finalMsgType = "video";
                else finalMsgType = "document";
              }
            }
          } catch (e) {
            console.error("Erro ao baixar mediaUrl para", messageId, e);
          }
        }

        await prisma.whatsAppMessage.create({
          data: {
            conversationId: conversation.id,
            messageId,
            body: messageBody,
            type: finalMsgType,
            mediaUrl: mediaUrl,
            fromMe: isFromMe,
            status: isFromMe ? "sent" : "delivered",
            timestamp: msg.messageTimestamp ? new Date(msg.messageTimestamp) : new Date(),
          },
        });
      } else {
        // Se já existe, atualiza o status de leitura
        await prisma.whatsAppMessage.update({
          where: { messageId },
          data: { status: msg.status || existingMsg.status },
        });
      }

      // Atualiza ultima mensagem na conversa
      await prisma.whatsAppConversation.update({
        where: { id: conversation.id },
        data: {
          lastMessage: messageBody,
          lastMessageAt: msg.messageTimestamp ? new Date(msg.messageTimestamp) : new Date(),
          unreadCount: isFromMe ? 0 : { increment: 1 },
        },
      });
    }

    if (event === "connection") {
      const status = payload.data?.status;
      if (status) {
        await prisma.whatsAppInstance.update({
          where: { id: dbInstance.id },
          data: { status: status },
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[WhatsApp Webhook Error]:", error);
    // Retorna 200 pro webhook não ficar tentando dnv
    return NextResponse.json({ success: false, error: error.message }); 
  }
}
