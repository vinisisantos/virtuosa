import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getInstancesForRequest } from "@/lib/whatsapp/instance-resolver";
import { getInstanceProvider } from "@/lib/whatsapp/provider";
import {
  downloadEvolutionMediaDataUrl,
  evolutionMessageMatchesConversation,
  findEvolutionMessageById,
} from "@/lib/whatsapp/inbound-media";
import {
  createPrivateBlobReadUrl,
  isPrivateBlobUrl,
  storePrivateInboundMedia,
} from "@/lib/whatsapp/media-storage";
import { broadcastInboxRealtimeChange } from "@/lib/whatsapp/inbox-realtime";

export const maxDuration = 60;

export async function POST(req: Request) {
  const input = await req.json().catch(() => null);
  const id = typeof input?.id === "string" ? input.id : "";
  if (!id) return NextResponse.json({ error: "Mensagem inválida." }, { status: 400 });

  const { instances } = await getInstancesForRequest(req);
  const instanceIds = instances.filter((instance) => instance.canView).map((instance) => instance.id);
  if (!instanceIds.length) return NextResponse.json({ error: "Sem acesso à caixa." }, { status: 403 });

  const message = await prisma.whatsAppMessage.findFirst({
    where: { id, conversation: { instanceId: { in: instanceIds } } },
    select: {
      id: true,
      conversationId: true,
      messageId: true,
      fromMe: true,
      type: true,
      mediaUrl: true,
      mediaMimeType: true,
      conversation: {
        select: {
          lastKnownJid: true,
          instance: { select: { id: true, name: true, provider: true } },
          contact: { select: { phone: true } },
        },
      },
    },
  });
  if (!message) return NextResponse.json({ error: "Mensagem não encontrada." }, { status: 404 });
  if (message.fromMe || !["image", "audio"].includes(message.type)) {
    return NextResponse.json({ error: "Essa mídia não permite recuperação." }, { status: 400 });
  }

  try {
    let url = message.mediaUrl;
    let mimeType = message.mediaMimeType;
    let sizeBytes: number | null = null;
    if (!isPrivateBlobUrl(url)) {
      if (getInstanceProvider(message.conversation.instance) !== "evolution") {
        return NextResponse.json({ error: "Recuperação não disponível para esta caixa." }, { status: 400 });
      }
      let dataUrl = url?.startsWith("data:") ? url : null;
      if (!dataUrl) {
        const instanceName = message.conversation.instance.name;
        const baseUrl = (process.env.EVOLUTION_API_URL || "http://localhost:8080").replace(/\/+$/, "");
        const response = await fetch(`${baseUrl}/chat/findMessages/${encodeURIComponent(instanceName)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: process.env.EVOLUTION_API_KEY || "" },
          body: JSON.stringify({ where: { key: { id: message.messageId } }, page: 1, offset: 10 }),
          signal: AbortSignal.timeout(12_000),
        });
        if (!response.ok) throw new Error(`Histórico indisponível na Evolution (${response.status}).`);
        const original = findEvolutionMessageById(
          await response.json(),
          message.messageId,
          (record) => evolutionMessageMatchesConversation({
            record,
            fromMe: false,
            lastKnownJid: message.conversation.lastKnownJid,
            contactPhone: message.conversation.contact.phone,
          }),
        );
        if (!original) {
          return NextResponse.json({ error: "Não foi possível confirmar a origem desta mídia no histórico." }, { status: 404 });
        }
        dataUrl = await downloadEvolutionMediaDataUrl({
          instanceName,
          message: original,
          fallbackMimeType: mimeType,
        });
      }

      const stored = await storePrivateInboundMedia({
        conversationId: message.conversationId,
        messageDbId: message.id,
        dataUrl,
        fallbackMimeType: mimeType,
      });
      const updated = await prisma.whatsAppMessage.updateMany({
        where: { id: message.id, conversationId: message.conversationId, mediaUrl: message.mediaUrl },
        data: { mediaUrl: stored.url, mediaMimeType: stored.mimeType, mediaSizeBytes: stored.sizeBytes },
      });
      if (updated.count) {
        url = stored.url;
        mimeType = stored.mimeType;
        sizeBytes = stored.sizeBytes;
        await broadcastInboxRealtimeChange({
          instanceId: message.conversation.instance.id,
          conversationId: message.conversationId,
          messageId: message.messageId,
          kind: "message",
        }).catch(() => {});
      } else {
        const current = await prisma.whatsAppMessage.findUnique({
          where: { id: message.id },
          select: { mediaUrl: true, mediaMimeType: true, mediaSizeBytes: true },
        });
        url = current?.mediaUrl || null;
        mimeType = current?.mediaMimeType || null;
        sizeBytes = current?.mediaSizeBytes ?? null;
      }
    }

    if (!url || !isPrivateBlobUrl(url)) throw new Error("Mídia não ficou disponível no armazenamento privado.");
    return NextResponse.json({
      mediaUrl: await createPrivateBlobReadUrl(url),
      mediaMimeType: mimeType,
      mediaSizeBytes: sizeBytes,
    });
  } catch (error) {
    console.error("[WhatsApp Media] Falha na recuperação manual:", error);
    return NextResponse.json({ error: "Não foi possível recuperar a mídia. Tente novamente mais tarde." }, { status: 502 });
  }
}
