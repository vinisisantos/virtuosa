import { NextResponse } from "next/server";
import { getInstanceForRequest } from "@/lib/whatsapp/instance-resolver";

import { prisma } from "@/lib/db";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || "all";

    // Resolver instância do usuário (admin pode usar ?targetUserId=xxx)
    const { instance: dbInstance } = await getInstanceForRequest(req);

    if (!dbInstance) {
      return NextResponse.json({ conversations: [] });
    }

    // Filtro de status dinâmico
    let statusFilter: any = {};
    if (status === 'all' || !status) {
      // Mostrar tudo exceto fechados
      statusFilter = { status: { not: 'closed' } };
    } else if (status === 'open') {
      statusFilter = { status: { in: ['open', 'waiting_customer', 'waiting_response'] } };
    } else if (status === 'closed') {
      statusFilter = { status: { in: ['resolved', 'closed'] } };
    } else {
      statusFilter = { status };
    }

    const conversations = await prisma.whatsAppConversation.findMany({
      where: {
        instanceId: dbInstance.id,
        ...statusFilter,
      },
      include: {
        contact: true,
      },
      orderBy: {
        lastMessageAt: "desc",
      },
    });

    return NextResponse.json({ conversations });
  } catch (error: any) {
    console.error("[WhatsApp Conversations API Error]:", error);
    return NextResponse.json({ error: "Erro interno", details: error.message }, { status: 500 });
  }
}
