import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { getInstancesForRequest } from "@/lib/whatsapp/instance-resolver";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const archived = body.archived;

    if (typeof archived !== "boolean") {
      return NextResponse.json({ error: "Informe se a conversa deve ser arquivada" }, { status: 400 });
    }

    const { instances } = await getInstancesForRequest(req);
    const instanceIds = instances.map((instance) => instance.id);

    if (instanceIds.length === 0) {
      return NextResponse.json({ error: "Nenhuma instância encontrada" }, { status: 404 });
    }

    const userId = req.headers.get("x-user-id");
    const userName = req.headers.get("x-user-name");
    const archivedAt = archived ? new Date() : null;
    const result = await prisma.whatsAppConversation.updateMany({
      where: {
        id,
        instanceId: { in: instanceIds },
      },
      data: {
        archivedAt,
        archivedBy: archived ? userId : null,
        archivedByName: archived ? userName || "Operador" : null,
      },
    });

    if (result.count !== 1) {
      return NextResponse.json({ error: "Conversa não encontrada ou sem permissão" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      conversation: { id, archivedAt: archivedAt?.toISOString() || null },
    });
  } catch (error) {
    console.error("[Archive Conversation API Error]:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
