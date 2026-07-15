import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { getInstancesForRequest } from "@/lib/whatsapp/instance-resolver";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { instances } = await getInstancesForRequest(req);
    const instanceIds = instances.map((instance) => instance.id);

    if (instanceIds.length === 0) {
      return NextResponse.json({ error: "Nenhuma instância encontrada" }, { status: 404 });
    }

    const result = await prisma.whatsAppConversation.updateMany({
      where: {
        id,
        instanceId: { in: instanceIds },
      },
      data: { unreadCount: 1 },
    });

    if (result.count !== 1) {
      return NextResponse.json({ error: "Conversa não encontrada ou sem permissão" }, { status: 404 });
    }

    return NextResponse.json({ success: true, conversation: { id, unreadCount: 1 } });
  } catch (error) {
    console.error("[Mark Conversation Unread API Error]:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
