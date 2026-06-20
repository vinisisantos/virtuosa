import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function POST(req: Request) {
  try {
    const payload = await req.json();

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

      // Ignora grupos (@g.us) — só mensagens individuais
      if (remoteJid.includes("@g.us")) {
        return NextResponse.json({ success: true });
      }

      // 1. Encontrar ou criar o contato
      const contactPhone = remoteJid.replace("@s.whatsapp.net", "").replace("@c.us", "");
      // Valida que é um número real (evita salvar payloads de debug)
      if (!/^\d{8,15}$/.test(contactPhone)) {
        return NextResponse.json({ success: true });
      }

      let contactName = msg.senderName || msg.pushName || contactPhone;

      let contact = await prisma.whatsAppContact.findUnique({
        where: { phone: contactPhone },
      });

      const isNewContact = !contact;

      if (!contact) {
        contact = await prisma.whatsAppContact.create({
          data: { phone: contactPhone, name: contactName },
        });
      } else if (contactName && contactName !== contactPhone && !contact.name) {
        // Update name if we now have one
        contact = await prisma.whatsAppContact.update({
          where: { id: contact.id },
          data: { name: contactName },
        });
      }

      // 2. Encontrar ou criar a conversa (vinculada à instância)
      let conversation = await prisma.whatsAppConversation.findFirst({
        where: { contactId: contact.id, instanceId: dbInstance.id },
      });

      const isNewConversation = !conversation;

      if (!conversation) {
        conversation = await prisma.whatsAppConversation.create({
          data: {
            instanceId: dbInstance.id,
            contactId: contact.id,
            status: "open",
          },
        });
      }

      // 3. Auto-criar negócio no Pipeline quando é uma mensagem RECEBIDA de contato novo
      const isFromMe = msg.fromMe || false;
      if (!isFromMe && (isNewContact || isNewConversation)) {
        try {
          // Busca cliente pelo telefone
          let client = await prisma.client.findFirst({
            where: { phone: contactPhone },
          });

          // Se não existe, cria um cliente básico
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

          // Verifica se já existe negócio ativo para esse cliente
          const existingDeal = await prisma.salesPipeline.findFirst({
            where: {
              clientId: client.id,
              lostReason: null,
              closedAt: null,
            },
          });

          if (!existingDeal) {
            // Busca o pipeline e primeiro estágio padrão
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


      // 3. Salvar a mensagem
      const messageId = msg.messageid || msg.id;
      const messageBody = msg.text || (msg.content && msg.content.text) || "";
      // isFromMe already declared above
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
        const dataToUpdate: any = { status: msg.status || existingMsg.status };

        // Auto-recuperação: se for mídia e não tiver URL, tenta baixar agora (útil para envios que demoram)
        if (!existingMsg.mediaUrl) {
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
                dataToUpdate.mediaUrl = downloadData.fileURL;
                let finalMsgType = existingMsg.type;
                if (existingMsg.type === "media" || existingMsg.type === "text") {
                  if (downloadData.mimetype) {
                    if (downloadData.mimetype.startsWith("image/")) finalMsgType = "image";
                    else if (downloadData.mimetype.startsWith("audio/")) finalMsgType = "audio";
                    else if (downloadData.mimetype.startsWith("video/")) finalMsgType = "video";
                    else finalMsgType = "document";
                  }
                }
                dataToUpdate.type = finalMsgType;
              }
            } catch (e) {
              console.error("Erro auto-recuperação mediaUrl:", messageId, e);
            }
          }
        }

        await prisma.whatsAppMessage.update({
          where: { messageId },
          data: dataToUpdate,
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
