import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { loadAssignedAliceHandoff } from "@/lib/ai-assistant/delegated-access";
import { AiAssistantError } from "@/lib/ai-assistant/policy";
import { constrainInlineMediaPayload } from "@/lib/whatsapp/message-payload";
import { signPrivateMediaUrls } from "@/lib/whatsapp/media-storage";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const conversation = await loadAssignedAliceHandoff(req, id);
    const messages = await prisma.whatsAppMessage.findMany({
      where: { conversationId: conversation.id, status: { not: "deleted" } },
      select: {
        id: true,
        body: true,
        type: true,
        fromMe: true,
        timestamp: true,
        mediaUrl: true,
        mediaMimeType: true,
        mediaFileName: true,
      },
      orderBy: [{ timestamp: "desc" }, { id: "desc" }],
      take: 120,
    });
    const safeMessages = await signPrivateMediaUrls(constrainInlineMediaPayload(messages.reverse()));
    return NextResponse.json({
      conversation: {
        id: conversation.id,
        contactName: conversation.contact.name,
        status: conversation.status,
        canReply: !conversation.blockedAt && !conversation.archivedAt
          && !["closed", "resolved", "lost"].includes(conversation.status)
          && conversation.instance.status === "connected",
      },
      messages: safeMessages,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof AiAssistantError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[Alice Handoff] Não foi possível abrir a conversa delegada", error);
    return NextResponse.json({ error: "Não foi possível abrir a conversa" }, { status: 500 });
  }
}
