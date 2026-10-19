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
    const { assignedTo, startService } = body;
    const conversation = await findAuthorizedConversation(req, id, "reply");
    if (!conversation) {
      return NextResponse.json({ error: "Conversa não encontrada ou sem permissão" }, { status: 404 });
    }
    // A distribuição pode indicar um responsável antes de alguém iniciar.
    const isStartingPendingService = startService === true
      && assignedTo === userId
      && conversation.status === "waiting_response";
    const sharedReply = conversation.authorizedInstance?.canReplyAcrossAssignments === true;
    if (
      conversation.assignedTo &&
      conversation.assignedTo !== userId &&
      conversation.authorizedInstance?.canManage !== true &&
      !sharedReply &&
      !isStartingPendingService
    ) {
      return NextResponse.json({
        error: `Esta conversa está em atendimento por ${conversation.assignedToName || "outro operador"}.`,
      }, { status: 409 });
    }

    const userName = req.headers.get("x-user-name") || "Operador";
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
        where: {
          id,
          instanceId: conversation.instanceId,
          ...(sharedReply ? {} : {
            assignedTo: conversation.assignedTo,
            status: conversation.status,
          }),
        },
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
    if (error?.code === "P2025") {
      return NextResponse.json({
        error: "A conversa foi atualizada por outra pessoa. Atualize a tela antes de iniciar o atendimento.",
      }, { status: 409 });
    }
    console.error('[Reopen API Error]:', error);
    return NextResponse.json({ error: 'Erro interno', details: error.message }, { status: 500 });
  }
}
