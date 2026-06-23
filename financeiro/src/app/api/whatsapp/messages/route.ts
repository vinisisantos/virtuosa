import { NextResponse } from "next/server";
import { getInstancesForRequest } from "@/lib/whatsapp/instance-resolver";

import { prisma } from "@/lib/db";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const conversationId = searchParams.get("conversationId");

    if (!conversationId) {
      return NextResponse.json({ error: "conversationId é obrigatório" }, { status: 400 });
    }

    // Resolver instâncias do usuário
    const { instances: dbInstances } = await getInstancesForRequest(req);

    // Validar que a conversa pertence a alguma instância do usuário
    if (!dbInstances || dbInstances.length === 0) {
      return NextResponse.json({ error: "Nenhuma instância encontrada" }, { status: 404 });
    }

    const instanceIds = dbInstances.map(i => i.id);
    const conversation = await prisma.whatsAppConversation.findFirst({
      where: { id: conversationId, instanceId: { in: instanceIds } },
    });

    if (!conversation) {
      return NextResponse.json({ error: "Conversa não encontrada ou sem permissão" }, { status: 404 });
    }

    const messages = await prisma.whatsAppMessage.findMany({
      where: {
        conversationId: conversationId,
      },
      orderBy: {
        timestamp: "asc",
      },
      select: {
        id: true,
        conversationId: true,
        messageId: true,
        body: true,
        type: true,
        mediaUrl: true,
        fromMe: true,
        status: true,
        timestamp: true,
        respondedBy: true,
        respondedByName: true,
        createdAt: true,
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
