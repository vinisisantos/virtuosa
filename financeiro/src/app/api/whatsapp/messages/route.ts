import { NextResponse } from "next/server";
import { getInstancesForRequest } from "@/lib/whatsapp/instance-resolver";

import { prisma } from "@/lib/db";

const EDIT_WINDOW_MS = 15 * 60 * 1000;
const DELETE_WINDOW_MS = 60 * 60 * 1000;

const getEvolutionConfig = () => ({
  url: process.env.EVOLUTION_API_URL || "http://localhost:8080",
  apiKey: process.env.EVOLUTION_API_KEY || "",
});

function jidFromPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return `${digits}@s.whatsapp.net`;
}

async function getAuthorizedMessage(req: Request, messageId: string) {
  const { instances: dbInstances } = await getInstancesForRequest(req);
  if (!dbInstances || dbInstances.length === 0) {
    return { error: NextResponse.json({ error: "Nenhuma instância encontrada" }, { status: 404 }) };
  }

  const instanceIds = dbInstances.map((i) => i.id);
  const message = await prisma.whatsAppMessage.findFirst({
    where: {
      id: messageId,
      conversation: { instanceId: { in: instanceIds } },
    },
    include: {
      conversation: {
        include: {
          contact: true,
          instance: true,
        },
      },
    },
  });

  if (!message) {
    return { error: NextResponse.json({ error: "Mensagem não encontrada ou sem permissão" }, { status: 404 }) };
  }

  return { message };
}

async function callEvolutionCandidates(candidates: Array<{ method: string; path: string; body: unknown }>) {
  const { url, apiKey } = getEvolutionConfig();
  let lastError: unknown = null;

  for (const candidate of candidates) {
    try {
      const res = await fetch(`${url}${candidate.path}`, {
        method: candidate.method,
        headers: {
          "Content-Type": "application/json",
          apikey: apiKey,
        },
        body: JSON.stringify(candidate.body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) return data;
      lastError = { status: res.status, data, path: candidate.path };
      if (res.status !== 404 && res.status !== 405) break;
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(`Evolution API não confirmou a ação: ${JSON.stringify(lastError).slice(0, 500)}`);
}

async function editEvolutionMessage(params: {
  instanceName: string;
  phone: string;
  remoteJid: string;
  messageId: string;
  text: string;
}) {
  const key = { remoteJid: params.remoteJid, fromMe: true, id: params.messageId };
  return callEvolutionCandidates([
    {
      method: "POST",
      path: `/message/updateMessage/${params.instanceName}`,
      body: { number: params.phone, key, text: params.text },
    },
    {
      method: "POST",
      path: `/message/edit/${params.instanceName}`,
      body: { number: params.phone, key, text: params.text },
    },
  ]);
}

async function deleteEvolutionMessage(params: {
  instanceName: string;
  phone: string;
  remoteJid: string;
  messageId: string;
}) {
  const key = { remoteJid: params.remoteJid, fromMe: true, id: params.messageId };
  const body = { number: params.phone, key, id: params.messageId, remoteJid: params.remoteJid, fromMe: true };
  return callEvolutionCandidates([
    { method: "DELETE", path: `/message/delete/${params.instanceName}`, body },
    { method: "POST", path: `/message/delete/${params.instanceName}`, body },
    { method: "DELETE", path: `/message/deleteMessageForEveryone/${params.instanceName}`, body },
    { method: "POST", path: `/message/deleteMessageForEveryone/${params.instanceName}`, body },
    { method: "DELETE", path: `/chat/deleteMessageForEveryone/${params.instanceName}`, body },
    { method: "POST", path: `/chat/deleteMessageForEveryone/${params.instanceName}`, body },
  ]);
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const conversationId = searchParams.get("conversationId");
    const markAsRead = searchParams.get("markAsRead") === "1";

    if (!conversationId) {
      return NextResponse.json({ error: "conversationId é obrigatório" }, { status: 400 });
    }

    // Resolver instâncias do usuário
    const { instances: dbInstances } = await getInstancesForRequest(req);

    // Validar que a conversa pertence a alguma instância do usuário
    if (!dbInstances || dbInstances.length === 0) {
      return NextResponse.json({ error: "Nenhuma instância encontrada" }, { status: 404 });
    }

    const instanceIds = dbInstances.map(i => i.id);
    const conversation = await prisma.whatsAppConversation.findFirst({
      where: { id: conversationId, instanceId: { in: instanceIds } },
    });

    if (!conversation) {
      return NextResponse.json({ error: "Conversa não encontrada ou sem permissão" }, { status: 404 });
    }

    const messages = await prisma.whatsAppMessage.findMany({
      where: {
        conversationId: conversationId,
      },
      orderBy: {
        timestamp: "asc",
      },
      select: {
        id: true,
        conversationId: true,
        messageId: true,
        body: true,
        type: true,
        mediaUrl: true,
        fromMe: true,
        status: true,
        timestamp: true,
        respondedBy: true,
        respondedByName: true,
        createdAt: true,
      },
    });

    // Só marca como lida quando o front pedir explicitamente e a conversa já
    // estiver assumida por um atendente. Antes disso, abrir para pré-visualizar
    // não deve apagar o contador de mensagens não vistas.
    if (markAsRead && conversation.assignedTo) {
      await prisma.whatsAppConversation.update({
        where: { id: conversationId },
        data: { unreadCount: 0 },
      });
    }

    return NextResponse.json({ messages });
  } catch (error: any) {
    console.error("[WhatsApp Messages API Error]:", error);
    return NextResponse.json({ error: "Erro interno", details: error.message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const id = body?.id;
    const nextBody = typeof body?.body === "string" ? body.body.trim() : "";

    if (!id || !nextBody) {
      return NextResponse.json({ error: "Mensagem e novo texto são obrigatórios" }, { status: 400 });
    }

    const { message, error } = await getAuthorizedMessage(req, id);
    if (error) return error;
    if (!message) return NextResponse.json({ error: "Mensagem não encontrada" }, { status: 404 });
    if (!message.fromMe || message.type !== "text") {
      return NextResponse.json({ error: "Só é possível editar mensagens de texto enviadas pelo CRM" }, { status: 400 });
    }
    if (message.status === "deleted") {
      return NextResponse.json({ error: "Mensagem apagada não pode ser editada" }, { status: 400 });
    }
    if (Date.now() - message.timestamp.getTime() > EDIT_WINDOW_MS) {
      return NextResponse.json({ error: "Tempo para editar esta mensagem expirou" }, { status: 400 });
    }

    const phone = message.conversation.contact.phone;
    await editEvolutionMessage({
      instanceName: message.conversation.instance.name,
      phone,
      remoteJid: jidFromPhone(phone),
      messageId: message.messageId,
      text: nextBody,
    });

    const updated = await prisma.whatsAppMessage.update({
      where: { id: message.id },
      data: { body: nextBody },
    });

    const latest = await prisma.whatsAppMessage.findFirst({
      where: { conversationId: message.conversationId },
      orderBy: { timestamp: "desc" },
      select: { id: true },
    });
    if (latest?.id === message.id) {
      await prisma.whatsAppConversation.update({
        where: { id: message.conversationId },
        data: { lastMessage: nextBody },
      });
    }

    return NextResponse.json({ success: true, message: updated });
  } catch (error: any) {
    console.error("[WhatsApp Messages PATCH Error]:", error);
    return NextResponse.json({ error: "Erro ao editar mensagem", details: error.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const body = await req.json();
    const id = body?.id;

    if (!id) {
      return NextResponse.json({ error: "Mensagem é obrigatória" }, { status: 400 });
    }

    const { message, error } = await getAuthorizedMessage(req, id);
    if (error) return error;
    if (!message) return NextResponse.json({ error: "Mensagem não encontrada" }, { status: 404 });
    if (!message.fromMe) {
      return NextResponse.json({ error: "Só é possível apagar mensagens enviadas pelo CRM" }, { status: 400 });
    }
    if (message.status === "deleted") {
      return NextResponse.json({ error: "Mensagem já apagada" }, { status: 400 });
    }
    if (Date.now() - message.timestamp.getTime() > DELETE_WINDOW_MS) {
      return NextResponse.json({ error: "Tempo para apagar esta mensagem expirou" }, { status: 400 });
    }

    const phone = message.conversation.contact.phone;
    await deleteEvolutionMessage({
      instanceName: message.conversation.instance.name,
      phone,
      remoteJid: jidFromPhone(phone),
      messageId: message.messageId,
    });

    const deletedBody = "Mensagem apagada";
    const updated = await prisma.whatsAppMessage.update({
      where: { id: message.id },
      data: { body: deletedBody, mediaUrl: null, status: "deleted" },
    });

    const latest = await prisma.whatsAppMessage.findFirst({
      where: { conversationId: message.conversationId },
      orderBy: { timestamp: "desc" },
      select: { id: true },
    });
    if (latest?.id === message.id) {
      await prisma.whatsAppConversation.update({
        where: { id: message.conversationId },
        data: { lastMessage: deletedBody },
      });
    }

    return NextResponse.json({ success: true, message: updated });
  } catch (error: any) {
    console.error("[WhatsApp Messages DELETE Error]:", error);
    return NextResponse.json({ error: "Erro ao apagar mensagem", details: error.message }, { status: 500 });
  }
}
