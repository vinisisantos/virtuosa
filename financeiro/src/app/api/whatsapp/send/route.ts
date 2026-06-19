import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const UAZAPI_URL = process.env.UAZAPI_URL || "https://free.uazapi.com";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Validar se tem os dados essenciais
    const { instance, contactId, body: messageBody, type, replyid, viewOnce } = body;

    if (!instance || !contactId || !messageBody) {
      return NextResponse.json({ error: "Faltam parâmetros obrigatórios" }, { status: 400 });
    }

    const dbInstance = await prisma.whatsAppInstance.findFirst({
      where: { name: instance },
    });

    if (!dbInstance) {
      return NextResponse.json({ error: "Instância não encontrada" }, { status: 404 });
    }

    // O contactId da nossa base tem que bater com o da uazapi, ex: 5511999999999
    // O envio na uazapi usa "number": contactId.replace("@s.whatsapp.net", "")
    const number = contactId.replace(/\D/g, "");

    const sendRes = await fetch(`${UAZAPI_URL}/messages/send/${type || "text"}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "token": dbInstance.token,
      },
      body: JSON.stringify({
        number,
        body: messageBody,
        delay: 500, // delay para mostrar "digitando..."
        replyid,
        viewOnce
      }),
    });

    const sendData = await sendRes.json();
    if (!sendRes.ok) {
      return NextResponse.json({ error: "Erro ao enviar na Uazapi", details: sendData }, { status: sendRes.status });
    }

    // Se for sucesso, gravamos a mensagem na nossa base (simulando a volta, ou podemos esperar o webhook de confirmation)
    // Para UX mais rápida, podemos só esperar o webhook "messages_update" para confirmar,
    // Mas vamos pré-salvar a mensagem como "sent" para já aparecer na tela.

    // 1. Achar/Criar conversa
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

    // A Uazapi retorna o ID gerado da mensagem no success
    const messageId = sendData.id || `temp_${Date.now()}`;

    const message = await prisma.whatsAppMessage.create({
      data: {
        conversationId: conversation.id,
        messageId: messageId,
        body: messageBody,
        type: type || "text",
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
