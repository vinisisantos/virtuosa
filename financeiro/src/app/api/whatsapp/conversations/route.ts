import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { getInstanceForRequest } from "@/lib/whatsapp/instance-resolver";

const prisma = new PrismaClient();

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || "open";

    // Resolver instância do usuário (admin pode usar ?targetUserId=xxx)
    const { instance: dbInstance, error, statusCode } = await getInstanceForRequest(req);

    if (error) {
      return NextResponse.json({ error }, { status: statusCode || 403 });
    }

    if (!dbInstance) {
      return NextResponse.json({ conversations: [] });
    }

    const conversations = await prisma.whatsAppConversation.findMany({
      where: {
        instanceId: dbInstance.id,
        status: status,
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
