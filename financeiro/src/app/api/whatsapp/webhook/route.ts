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

      // Se já existe uma mensagem com esse ID, não duplica (pode ser "messages_update")
      const existingMsg = await prisma.whatsAppMessage.findUnique({
        where: { messageId },
      });

      if (!existingMsg) {
        await prisma.whatsAppMessage.create({
          data: {
            conversationId: conversation.id,
            messageId,
            body: messageBody,
            type: msg.type || msg.messageType || "text",
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
