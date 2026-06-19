import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const conversationId = searchParams.get("conversationId");

    if (!conversationId) {
      return NextResponse.json({ error: "conversationId é obrigatório" }, { status: 400 });
    }

    const messages = await prisma.whatsAppMessage.findMany({
      where: {
        conversationId: conversationId,
      },
      orderBy: {
        timestamp: "asc",
      },
    });

    // Ao carregar as mensagens, zera o contador de não lidas
    await prisma.whatsAppConversation.update({
      where: { id: conversationId },
      data: { unreadCount: 0 },
    });

    return NextResponse.json({ messages });
  } catch (error: any) {
    console.error("[WhatsApp Messages API Error]:", error);
    return NextResponse.json({ error: "Erro interno", details: error.message }, { status: 500 });
  }
}
