import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || "open";

    const dbInstance = await prisma.whatsAppInstance.findFirst({
      where: { name: "virtuosa-main" },
    });

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
