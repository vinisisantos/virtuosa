import { NextResponse } from "next/server";
import { getInstancesForRequest } from "@/lib/whatsapp/instance-resolver";

import { prisma } from "@/lib/db";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || "all";

    // Resolver instâncias do usuário
    const { instances: dbInstances } = await getInstancesForRequest(req);

    if (!dbInstances || dbInstances.length === 0) {
      return NextResponse.json({ conversations: [] });
    }

    const instanceIds = dbInstances.map(i => i.id);

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
        instanceId: { in: instanceIds },
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
