import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import {
  WHATSAPP_CALLBACK_ATTEMPT_STATUS,
} from "@/lib/whatsapp/callbacks";
import { WHATSAPP_CALLBACK_QUEUE_STATUS } from "@/lib/whatsapp/callback-queue";
import { findAuthorizedConversation } from "@/lib/whatsapp/conversation-access";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const userId = req.headers.get("x-user-id") || "";
    const userName = req.headers.get("x-user-name") || "Operador";

    if (!userId) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const conversation = await findAuthorizedConversation(req, id, "reply");
    if (!conversation) {
      return NextResponse.json({ error: "Conversa não encontrada ou sem permissão" }, { status: 404 });
    }
    if (
      conversation.assignedTo
      && conversation.assignedTo !== userId
      && conversation.authorizedInstance?.canManage !== true
    ) {
      return NextResponse.json({
        error: `Esta conversa está em atendimento por ${conversation.assignedToName || "outro operador"}.`,
      }, { status: 409 });
    }
    if (conversation.callbackQueueStatus !== WHATSAPP_CALLBACK_QUEUE_STATUS.responded) {
      return NextResponse.json({
        error: "Esta conversa não possui uma resposta de rechame aguardando retomada.",
      }, { status: 409 });
    }

    const resumedAt = new Date();
    const result = await prisma.$transaction(async (tx) => {
      const activeAttempt = await tx.whatsAppCallbackAttempt.findFirst({
        where: {
          conversationId: id,
          status: WHATSAPP_CALLBACK_ATTEMPT_STATUS.responded,
        },
        select: { id: true, attemptNumber: true },
        orderBy: { respondedAt: "desc" },
      });
      if (!activeAttempt) return null;

      const claimed = await tx.whatsAppCallbackAttempt.updateMany({
        where: {
          id: activeAttempt.id,
          status: WHATSAPP_CALLBACK_ATTEMPT_STATUS.responded,
        },
        data: {
          status: WHATSAPP_CALLBACK_ATTEMPT_STATUS.resumed,
          resumedAt,
          resumedBy: userId,
          resumedByName: userName,
        },
      });
      if (claimed.count === 0) return null;

      const updatedConversation = await tx.whatsAppConversation.update({
        where: { id },
        data: {
          status: "open",
          assignedTo: userId,
          assignedToName: userName,
          unreadCount: 0,
          callbackQueueStatus: WHATSAPP_CALLBACK_QUEUE_STATUS.inactive,
        },
        select: {
          id: true,
          status: true,
          assignedTo: true,
          assignedToName: true,
          unreadCount: true,
          updatedAt: true,
          callbackQueueStatus: true,
          callbackDueAt: true,
          callbackTrackingStartedAt: true,
          callbackStreakCount: true,
          callbackTotalCount: true,
        },
      });

      return { conversation: updatedConversation, attemptNumber: activeAttempt.attemptNumber };
    });

    if (!result) {
      return NextResponse.json({
        error: "A resposta já foi retomada por outra pessoa. Atualize a lista.",
      }, { status: 409 });
    }

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("[WhatsApp Callback Resume API Error]:", error);
    return NextResponse.json({
      error: "Não foi possível retomar o atendimento do rechame.",
      details: error instanceof Error ? error.message : "Erro interno",
    }, { status: 500 });
  }
}
