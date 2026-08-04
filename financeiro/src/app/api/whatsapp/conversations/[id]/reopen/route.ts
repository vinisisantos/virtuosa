import { NextResponse } from 'next/server';

import { prisma } from "@/lib/db";
import { findAuthorizedConversation } from "@/lib/whatsapp/conversation-access";

// PATCH — Reabrir conversa
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = req.headers.get('x-user-id');

    if (!userId) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const conversation = await findAuthorizedConversation(req, id, "reply");
    if (!conversation) {
      return NextResponse.json({ error: "Conversa não encontrada ou sem permissão" }, { status: 404 });
    }
    if (
      conversation.assignedTo &&
      conversation.assignedTo !== userId &&
      conversation.authorizedInstance?.canManage !== true
    ) {
      return NextResponse.json({
        error: `Esta conversa está em atendimento por ${conversation.assignedToName || "outro operador"}.`,
      }, { status: 409 });
    }

    const userName = req.headers.get("x-user-name") || "Operador";
    const { assignedTo } = body;
    if (assignedTo && assignedTo !== userId) {
      return NextResponse.json({ error: "Não é permitido atribuir a conversa em nome de outra pessoa" }, { status: 403 });
    }

    const dataUpdate: any = {
      status: 'open',
      reopenedAt: new Date(),
      reopenCount: { increment: 1 },
    };

    if (assignedTo) {
      dataUpdate.assignedTo = userId;
      dataUpdate.assignedToName = userName;
      dataUpdate.unreadCount = 0;
    }

    const updated = await prisma.whatsAppConversation.update({
      where: { id },
      data: dataUpdate,
    });

    return NextResponse.json({ success: true, conversation: updated });
  } catch (error: any) {
    console.error('[Reopen API Error]:', error);
    return NextResponse.json({ error: 'Erro interno', details: error.message }, { status: 500 });
  }
}
