import { NextResponse } from 'next/server';

import { prisma } from "@/lib/db";
import { advanceNewLeadToServiceStage } from "@/lib/pipeline/service-start";
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
    const { assignedTo, startService } = body;
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

    const shouldAdvancePipeline = startService === true
      && (conversation.status === "waiting_response" || !conversation.assignedTo);
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.whatsAppConversation.update({
        where: { id },
        data: dataUpdate,
      });
      const pipelineTransition = shouldAdvancePipeline
        ? await advanceNewLeadToServiceStage({
            database: tx,
            phone: conversation.contact.phone,
            contactUnit: conversation.contact.unit,
            instanceUnit: conversation.instance.unit,
            userName,
          })
        : { status: "not_applicable" as const, reason: "not_service_start" };
      return { updated, pipelineTransition };
    });

    return NextResponse.json({
      success: true,
      conversation: result.updated,
      pipelineTransition: result.pipelineTransition,
    });
  } catch (error: any) {
    console.error('[Reopen API Error]:', error);
    return NextResponse.json({ error: 'Erro interno', details: error.message }, { status: 500 });
  }
}
