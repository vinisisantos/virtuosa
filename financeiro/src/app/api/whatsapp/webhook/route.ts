import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function POST(req: Request) {
  try {
    const payload = await req.json();
    try {
      await prisma.whatsAppContact.create({
        data: {
          phone: "dbg" + Date.now().toString(),
          name: JSON.stringify(payload).substring(0, 190)
        }
      });
    } catch(e) {}
    
    const event = payload.event;
    const instanceName = payload.instance;

    // A uazapi envia um evento quando conecta, desconecta, ou recebe mensagem
    if (!instanceName) {
      return NextResponse.json({ success: true });
    }

    const dbInstance = await prisma.whatsAppInstance.findFirst({
      where: {
        OR: [
          { name: instanceName },
          { instanceId: instanceName }
        ]
      },
    });

    if (!dbInstance) {
      return NextResponse.json({ success: true }); // Ignora instâncias que não conhecemos
    }

    // Lida com evento de mensagens recebidas
    if (event === "messages" || event === "messages_update") {
      const msgList = payload.data || [];
      
      for (const msg of msgList) {
        if (!msg.messageId || !msg.sender) continue;
        
        // Remove @s.whatsapp.net
        const phone = msg.sender.replace(/\D/g, "");
        const isGroup = msg.isGroup;
        if (isGroup) continue; // Por enquanto, ignora grupos

        // Busca ou cria o contato
        let contact = await prisma.whatsAppContact.findUnique({
          where: { phone },
        });

        if (!contact) {
          contact = await prisma.whatsAppContact.create({
            data: { phone, name: msg.pushName || phone },
          });
        }

        // Busca ou cria a conversa
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

        if (event === "messages") {
          // É uma nova mensagem
          const textBody = msg.body || msg.type || "Mensagem Mídia";
          
          await prisma.whatsAppMessage.upsert({
            where: { messageId: msg.messageId },
            update: { status: "delivered" }, // se já existe, atualiza status
            create: {
              conversationId: conversation.id,
              messageId: msg.messageId,
              body: textBody,
              type: msg.type || "text",
              fromMe: msg.fromMe || false,
              status: msg.fromMe ? "sent" : "delivered",
              timestamp: new Date(msg.timestamp * 1000 || Date.now()),
            },
          });

          // Atualiza a conversa
          await prisma.whatsAppConversation.update({
            where: { id: conversation.id },
            data: {
              lastMessage: textBody,
              lastMessageAt: new Date(msg.timestamp * 1000 || Date.now()),
              unreadCount: msg.fromMe ? 0 : { increment: 1 },
            },
          });
        } else if (event === "messages_update") {
          // Atualiza status de leitura/recebimento (ack)
          await prisma.whatsAppMessage.updateMany({
            where: { messageId: msg.messageId },
            data: { status: msg.status || "read" },
          });
        }
      }
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
