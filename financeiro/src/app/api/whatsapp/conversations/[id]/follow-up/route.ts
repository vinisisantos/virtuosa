import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { findAuthorizedConversation } from "@/lib/whatsapp/conversation-access";
import {
  WHATSAPP_FOLLOW_UP_STATUS_CANCELLED,
  WHATSAPP_FOLLOW_UP_STATUS_COMPLETED,
  WHATSAPP_FOLLOW_UP_STATUS_SCHEDULED,
  validateWhatsAppFollowUpSchedule,
} from "@/lib/whatsapp/follow-ups";

function activeFollowUpSelect() {
  return {
    id: true,
    scheduledAt: true,
    note: true,
    status: true,
    assignedTo: true,
    assignedToName: true,
    createdBy: true,
    createdByName: true,
    createdAt: true,
    updatedAt: true,
  } as const;
}

function followUpMetadata(value: unknown) {
  return JSON.stringify(value);
}

async function authorizedContext(req: Request, conversationId: string) {
  const userId = req.headers.get("x-user-id")?.trim() || "";
  const userName = req.headers.get("x-user-name")?.trim() || "Operador";
  if (!userId) return { error: NextResponse.json({ error: "Não autenticado" }, { status: 401 }) };

  const conversation = await findAuthorizedConversation(req, conversationId, "reply");
  if (!conversation) {
    return { error: NextResponse.json({ error: "Conversa não encontrada ou sem permissão" }, { status: 404 }) };
  }

  if (
    conversation.assignedTo
    && conversation.assignedTo !== userId
    && conversation.authorizedInstance?.canManage !== true
  ) {
    return {
      error: NextResponse.json({
        error: `Esta conversa está em atendimento por ${conversation.assignedToName || "outro operador"}.`,
      }, { status: 409 }),
    };
  }

  return { userId, userName, conversation };
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const context = await authorizedContext(req, id);
    if ("error" in context) return context.error;

    if (["closed", "resolved", "lost"].includes(context.conversation.status)) {
      return NextResponse.json({ error: "Reabra a conversa antes de agendar um retorno" }, { status: 409 });
    }
    if (context.conversation.blockedAt) {
      return NextResponse.json({ error: "Desbloqueie o contato antes de agendar um retorno" }, { status: 409 });
    }

    const body = await req.json().catch(() => ({}));
    const schedule = validateWhatsAppFollowUpSchedule({
      date: body.date,
      time: body.time,
      note: body.note,
    });
    if ("error" in schedule) {
      return NextResponse.json({ error: schedule.error }, { status: 400 });
    }

    const assignedTo = context.conversation.assignedTo || context.userId;
    const assignedToName = context.conversation.assignedToName || context.userName;
    const result = await prisma.$transaction(async (tx) => {
      const previous = await tx.whatsAppConversationFollowUp.findFirst({
        where: { conversationId: id, status: WHATSAPP_FOLLOW_UP_STATUS_SCHEDULED },
        select: activeFollowUpSelect(),
      });

      const followUp = previous
        ? await tx.whatsAppConversationFollowUp.update({
            where: { id: previous.id },
            data: {
              scheduledAt: schedule.scheduledAt,
              note: schedule.note,
              assignedTo,
              assignedToName,
              createdBy: context.userId,
              createdByName: context.userName,
            },
            select: activeFollowUpSelect(),
          })
        : await tx.whatsAppConversationFollowUp.create({
            data: {
              conversationId: id,
              scheduledAt: schedule.scheduledAt,
              note: schedule.note,
              assignedTo,
              assignedToName,
              createdBy: context.userId,
              createdByName: context.userName,
            },
            select: activeFollowUpSelect(),
          });

      if (!context.conversation.assignedTo) {
        await tx.whatsAppConversation.update({
          where: { id },
          data: { assignedTo, assignedToName },
        });
      }

      await tx.activityLog.create({
        data: {
          userId: context.userId,
          userName: context.userName,
          action: previous ? "whatsapp_follow_up_rescheduled" : "whatsapp_follow_up_scheduled",
          entityType: "WhatsAppConversation",
          entityId: id,
          description: previous ? "Retorno do WhatsApp reagendado" : "Retorno do WhatsApp agendado",
          unit: context.conversation.contact.unit || context.conversation.instance.unit || null,
          metadata: followUpMetadata({
            previousScheduledAt: previous?.scheduledAt || null,
            scheduledAt: followUp.scheduledAt,
            note: followUp.note,
            assignedTo,
            instanceId: context.conversation.instanceId,
          }),
        },
      });

      return followUp;
    });

    return NextResponse.json({ success: true, followUp: result });
  } catch (error) {
    console.error("[Schedule WhatsApp follow-up]", error);
    return NextResponse.json({ error: "Não foi possível agendar o retorno" }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const context = await authorizedContext(req, id);
    if ("error" in context) return context.error;

    const body = await req.json().catch(() => ({}));
    const action = body.action === "complete" ? "complete" : body.action === "cancel" ? "cancel" : null;
    if (!action) {
      return NextResponse.json({ error: "Ação de retorno inválida" }, { status: 400 });
    }

    const current = await prisma.whatsAppConversationFollowUp.findFirst({
      where: { conversationId: id, status: WHATSAPP_FOLLOW_UP_STATUS_SCHEDULED },
      select: activeFollowUpSelect(),
    });
    if (!current) {
      return NextResponse.json({ error: "Não há retorno agendado nesta conversa" }, { status: 404 });
    }
    if (
      current.assignedTo !== context.userId
      && context.conversation.authorizedInstance?.canManage !== true
    ) {
      return NextResponse.json({ error: `Este retorno pertence a ${current.assignedToName}.` }, { status: 409 });
    }

    const now = new Date();
    await prisma.$transaction([
      prisma.whatsAppConversationFollowUp.update({
        where: { id: current.id },
        data: action === "complete"
          ? {
              status: WHATSAPP_FOLLOW_UP_STATUS_COMPLETED,
              completedAt: now,
              completedBy: context.userId,
              completedByName: context.userName,
            }
          : {
              status: WHATSAPP_FOLLOW_UP_STATUS_CANCELLED,
              cancelledAt: now,
              cancelledBy: context.userId,
              cancelledByName: context.userName,
            },
      }),
      prisma.activityLog.create({
        data: {
          userId: context.userId,
          userName: context.userName,
          action: action === "complete" ? "whatsapp_follow_up_completed" : "whatsapp_follow_up_cancelled",
          entityType: "WhatsAppConversation",
          entityId: id,
          description: action === "complete" ? "Retorno do WhatsApp concluído" : "Retorno do WhatsApp cancelado",
          unit: context.conversation.contact.unit || context.conversation.instance.unit || null,
          metadata: followUpMetadata({
            followUpId: current.id,
            scheduledAt: current.scheduledAt,
            note: current.note,
            assignedTo: current.assignedTo,
            instanceId: context.conversation.instanceId,
          }),
        },
      }),
    ]);

    return NextResponse.json({ success: true, followUp: null });
  } catch (error) {
    console.error("[Update WhatsApp follow-up]", error);
    return NextResponse.json({ error: "Não foi possível atualizar o retorno" }, { status: 500 });
  }
}
