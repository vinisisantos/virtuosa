import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { findAuthorizedConversation } from "@/lib/whatsapp/conversation-access";
import {
  unauthorizedWhatsAppInternalNoteMentionIds,
  validateWhatsAppInternalNoteInput,
  whatsappInternalNoteNotificationLink,
} from "@/lib/whatsapp/internal-notes";

export const dynamic = "force-dynamic";

const INTERNAL_NOTE_LIST_LIMIT = 100;

function actorFromRequest(req: Request) {
  return {
    id: req.headers.get("x-user-id")?.trim() || "",
    name: req.headers.get("x-user-name")?.trim() || "Operador",
  };
}

async function mentionableUsers(instanceId: string, ownerUserId?: string | null) {
  return prisma.user.findMany({
    where: {
      isActive: true,
      OR: [
        ...(ownerUserId ? [{ id: ownerUserId }] : []),
        {
          whatsappInstanceMembers: {
            some: { instanceId, isActive: true },
          },
        },
      ],
    },
    select: { id: true, name: true },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });
}

function normalizedNotificationPreview(content: string) {
  const preview = content.replace(/\s+/g, " ").trim();
  return preview.length > 140 ? `${preview.slice(0, 137)}...` : preview;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = actorFromRequest(req);
    if (!actor.id) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const { id } = await params;
    const conversation = await findAuthorizedConversation(req, id, "view");
    if (!conversation) {
      return NextResponse.json({ error: "Conversa não encontrada ou sem permissão" }, { status: 404 });
    }

    const [latestNotes, users] = await Promise.all([
      prisma.whatsAppConversationInternalNote.findMany({
        where: { conversationId: id },
        select: {
          id: true,
          content: true,
          mentions: true,
          createdBy: true,
          createdByName: true,
          createdAt: true,
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: INTERNAL_NOTE_LIST_LIMIT,
      }),
      mentionableUsers(conversation.instanceId, conversation.instance.userId),
    ]);

    return NextResponse.json({
      notes: latestNotes.reverse(),
      mentionableUsers: users,
      internalNotesUpdatedAt: conversation.internalNotesUpdatedAt,
    }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("[WhatsApp internal notes GET]", error);
    return NextResponse.json({ error: "Não foi possível carregar as notas internas" }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = actorFromRequest(req);
    if (!actor.id) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const { id } = await params;
    const conversation = await findAuthorizedConversation(req, id, "reply");
    if (!conversation) {
      return NextResponse.json({ error: "Conversa não encontrada ou sem permissão para criar notas" }, { status: 404 });
    }

    const parsed = validateWhatsAppInternalNoteInput(await req.json().catch(() => null));
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const users = parsed.value.mentionedUserIds.length
      ? await mentionableUsers(conversation.instanceId, conversation.instance.userId)
      : [];
    const unauthorizedIds = unauthorizedWhatsAppInternalNoteMentionIds(
      parsed.value.mentionedUserIds,
      users.map((user) => user.id),
    );
    if (unauthorizedIds.length) {
      return NextResponse.json({
        error: "Só é possível mencionar participantes ativos desta instância",
      }, { status: 403 });
    }

    const userById = new Map(users.map((user) => [user.id, user]));
    const mentionSnapshots = parsed.value.mentionedUserIds.map((userId) => ({
      userId,
      name: userById.get(userId)?.name || "Usuário",
    }));
    const recipients = mentionSnapshots.filter((mention) => mention.userId !== actor.id);
    const now = new Date();
    const link = whatsappInternalNoteNotificationLink({
      conversationId: id,
      instanceId: conversation.instanceId,
      instanceUnit: conversation.instance.unit,
    });

    const note = await prisma.$transaction(async (tx) => {
      const created = await tx.whatsAppConversationInternalNote.create({
        data: {
          conversationId: id,
          content: parsed.value.content,
          mentions: mentionSnapshots,
          createdBy: actor.id,
          createdByName: actor.name,
          createdAt: now,
        },
        select: {
          id: true,
          content: true,
          mentions: true,
          createdBy: true,
          createdByName: true,
          createdAt: true,
        },
      });

      await tx.whatsAppConversation.update({
        where: { id },
        data: { internalNotesUpdatedAt: now },
      });

      if (recipients.length) {
        await tx.notification.createMany({
          data: recipients.map((recipient) => ({
            userId: recipient.userId,
            type: "whatsapp_internal_note_mention",
            title: "Você foi mencionado em uma nota interna",
            message: `${actor.name}: ${normalizedNotificationPreview(parsed.value.content)}`,
            icon: "alternate_email",
            link,
            unit: null,
          })),
        });
      }

      await tx.activityLog.create({
        data: {
          userId: actor.id,
          userName: actor.name,
          action: "whatsapp_internal_note_created",
          entityType: "WhatsAppConversationInternalNote",
          entityId: created.id,
          description: "Nota interna criada em uma conversa do WhatsApp",
          unit: conversation.contact.unit || conversation.instance.unit || null,
          metadata: JSON.stringify({
            conversationId: id,
            instanceId: conversation.instanceId,
            mentionedUserIds: mentionSnapshots.map((mention) => mention.userId),
          }),
        },
      });

      return created;
    });

    return NextResponse.json({ note, internalNotesUpdatedAt: now }, { status: 201 });
  } catch (error) {
    console.error("[WhatsApp internal notes POST]", error);
    return NextResponse.json({ error: "Não foi possível criar a nota interna" }, { status: 500 });
  }
}
