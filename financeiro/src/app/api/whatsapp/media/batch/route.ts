import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getInstancesForRequest } from "@/lib/whatsapp/instance-resolver";
import {
  buildCrmMediaBatchMarkerBody,
  normalizeCrmMediaBatch,
} from "@/lib/whatsapp/media-batch";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const conversationId = typeof body.conversationId === "string" ? body.conversationId.trim() : "";
    const batch = normalizeCrmMediaBatch({ id: body.batchId, messageIds: body.messageIds });
    if (!conversationId || !batch) {
      return NextResponse.json({ error: "Lote de imagens inválido" }, { status: 400 });
    }

    const { instances } = await getInstancesForRequest(req);
    const instanceIds = instances
      .filter((instance) => instance.status !== "archived" && instance.canReply === true)
      .map((instance) => instance.id);
    const conversation = await prisma.whatsAppConversation.findFirst({
      where: { id: conversationId, instanceId: { in: instanceIds } },
      select: { id: true },
    });
    if (!conversation) {
      return NextResponse.json({ error: "Conversa não encontrada para este WhatsApp" }, { status: 404 });
    }

    const imageMessages = await prisma.whatsAppMessage.findMany({
      where: {
        conversationId,
        messageId: { in: batch.messageIds },
        type: "image",
        fromMe: true,
      },
      select: {
        messageId: true,
        timestamp: true,
        respondedBy: true,
        respondedByName: true,
      },
    });
    if (imageMessages.length !== batch.messageIds.length) {
      return NextResponse.json({ error: "Nem todas as imagens do lote foram registradas" }, { status: 409 });
    }

    const imageByMessageId = new Map(imageMessages.map((message) => [message.messageId, message]));
    const orderedImages = batch.messageIds.map((messageId) => imageByMessageId.get(messageId)!);
    const firstImage = orderedImages[0];
    const markerMessageId = `crm_album_${batch.id}`;
    await prisma.whatsAppMessage.upsert({
      where: {
        conversationId_messageId: { conversationId, messageId: markerMessageId },
      },
      create: {
        conversationId,
        messageId: markerMessageId,
        body: buildCrmMediaBatchMarkerBody(batch),
        type: "albumMessage",
        fromMe: true,
        status: "sent",
        timestamp: new Date(firstImage.timestamp.getTime() - 1),
        respondedBy: firstImage.respondedBy,
        respondedByName: firstImage.respondedByName,
      },
      update: {
        body: buildCrmMediaBatchMarkerBody(batch),
        timestamp: new Date(firstImage.timestamp.getTime() - 1),
      },
    });

    return NextResponse.json({ success: true, batchId: batch.id });
  } catch (error) {
    console.error("[WhatsApp Media Batch API Error]:", error);
    return NextResponse.json({ error: "Não foi possível agrupar as imagens" }, { status: 500 });
  }
}
