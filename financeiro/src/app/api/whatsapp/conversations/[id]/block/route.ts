import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { findAuthorizedConversation } from "@/lib/whatsapp/conversation-access";
import { whatsappConversationJid } from "@/lib/whatsapp/chat-action-identifiers";
import { updateEvolutionContactBlock } from "@/lib/whatsapp/evolution-chat-actions";
import {
  getInstanceProvider,
  readProviderPayload,
  summarizeProviderError,
  wahaRequest,
} from "@/lib/whatsapp/provider";

type BlockStatus = "block" | "unblock";

async function updateProviderBlockStatus(params: {
  instanceName: string;
  provider?: string | null;
  phone: string;
  remoteJid: string;
  status: BlockStatus;
}) {
  const provider = getInstanceProvider(params);
  if (provider === "waha") {
    const response = await wahaRequest(`/api/contacts/${params.status === "block" ? "block" : "unblock"}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactId: params.remoteJid, session: params.instanceName }),
      signal: AbortSignal.timeout(15000),
    });
    const payload = await readProviderPayload(response);

    if (!response.ok) {
      const details = summarizeProviderError(payload);
      throw new Error(details
        ? `O WhatsApp recusou a ação: ${details}`
        : "O WhatsApp não confirmou a ação. Tente novamente.");
    }
    return;
  }

  await updateEvolutionContactBlock(params);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    if (typeof body.blocked !== "boolean") {
      return NextResponse.json({ error: "Informe se o contato deve ser bloqueado" }, { status: 400 });
    }

    // Bloqueio foi liberado para todos os papéis que podem visualizar a conversa.
    const conversation = await findAuthorizedConversation(req, id, "view");
    if (!conversation) {
      return NextResponse.json({ error: "Conversa não encontrada ou sem permissão" }, { status: 404 });
    }
    if (conversation.instance.status !== "connected") {
      return NextResponse.json({
        error: "Este WhatsApp está desconectado. Reconecte a instância antes de alterar o bloqueio.",
      }, { status: 409 });
    }

    const isBlocked = Boolean(conversation.blockedAt);
    if (isBlocked === body.blocked) {
      return NextResponse.json({
        success: true,
        conversation: {
          id: conversation.id,
          blockedAt: conversation.blockedAt?.toISOString() || null,
          blockedByName: conversation.blockedByName || null,
        },
      });
    }

    const remoteJid = whatsappConversationJid(conversation.lastKnownJid, conversation.contact.phone);
    if (!remoteJid) {
      return NextResponse.json({ error: "Contato sem identificador válido para bloqueio" }, { status: 400 });
    }

    const nextStatus: BlockStatus = body.blocked ? "block" : "unblock";
    await updateProviderBlockStatus({
      instanceName: conversation.instance.name,
      provider: conversation.instance.provider,
      phone: conversation.contact.phone,
      remoteJid,
      status: nextStatus,
    });

    const userId = req.headers.get("x-user-id") || null;
    const userName = req.headers.get("x-user-name") || "Operador";
    const blockedAt = body.blocked ? new Date() : null;

    try {
      await prisma.$transaction([
        prisma.whatsAppConversation.update({
          where: { id: conversation.id },
          data: {
            blockedAt,
            blockedBy: body.blocked ? userId : null,
            blockedByName: body.blocked ? userName : null,
          },
        }),
        prisma.activityLog.create({
          data: {
            userId,
            userName,
            action: body.blocked ? "whatsapp_contact_blocked" : "whatsapp_contact_unblocked",
            entityType: "WhatsAppConversation",
            entityId: conversation.id,
            description: body.blocked
              ? "Contato bloqueado no WhatsApp pelo Inbox"
              : "Contato desbloqueado no WhatsApp pelo Inbox",
            metadata: JSON.stringify({
              instanceId: conversation.instanceId,
              provider: getInstanceProvider(conversation.instance),
            }),
            unit: conversation.instance.unit || null,
          },
        }),
      ]);
    } catch (databaseError) {
      // Evita manter o WhatsApp alterado se o CRM não conseguir registrar o estado.
      await updateProviderBlockStatus({
        instanceName: conversation.instance.name,
        provider: conversation.instance.provider,
        phone: conversation.contact.phone,
        remoteJid,
        status: body.blocked ? "unblock" : "block",
      }).catch((rollbackError) => {
        console.error("[WhatsApp Contact Block Rollback Error]:", rollbackError);
      });
      throw databaseError;
    }

    return NextResponse.json({
      success: true,
      conversation: {
        id: conversation.id,
        blockedAt: blockedAt?.toISOString() || null,
        blockedByName: body.blocked ? userName : null,
      },
    });
  } catch (error) {
    console.error("[WhatsApp Contact Block API Error]:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Erro ao atualizar bloqueio do contato",
    }, { status: 502 });
  }
}
