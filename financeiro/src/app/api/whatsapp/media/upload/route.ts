import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getInstancesForRequest } from "@/lib/whatsapp/instance-resolver";
import {
  privateBlobPathname,
} from "@/lib/whatsapp/media-storage";
import { WHATSAPP_MEDIA_MAX_FILE_BYTES } from "@/lib/whatsapp/media-constraints";

const ALLOWED_CONTENT_TYPES = [
  "image/*",
  "audio/*",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/octet-stream",
];

function parseClientPayload(value: string | null) {
  try {
    const parsed = JSON.parse(value || "{}");
    return {
      conversationId: typeof parsed.conversationId === "string" ? parsed.conversationId : "",
    };
  } catch {
    return { conversationId: "" };
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as HandleUploadBody;
    const { instances } = await getInstancesForRequest(req);
    const instanceIds = instances.filter((instance: any) => instance.status !== "archived").map((instance: any) => instance.id);

    if (!instanceIds.length) {
      return NextResponse.json({ error: "Nenhuma instância encontrada" }, { status: 404 });
    }

    const response = await handleUpload({
      request: req,
      body,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const { conversationId } = parseClientPayload(clientPayload);
        if (!conversationId) throw new Error("Conversa não informada para o upload");

        const conversation = await prisma.whatsAppConversation.findFirst({
          where: { id: conversationId, instanceId: { in: instanceIds } },
          select: { id: true },
        });
        if (!conversation) throw new Error("Conversa não encontrada ou sem permissão");

        const expectedPrefix = `whatsapp/${conversation.id}/`;
        const normalizedPathname = privateBlobPathname(`https://placeholder.private.blob.vercel-storage.com/${pathname}`);
        if (!normalizedPathname?.startsWith(expectedPrefix) || normalizedPathname.includes("..")) {
          throw new Error("Destino de upload inválido");
        }

        return {
          allowedContentTypes: ALLOWED_CONTENT_TYPES,
          maximumSizeInBytes: WHATSAPP_MEDIA_MAX_FILE_BYTES,
          addRandomSuffix: true,
          allowOverwrite: false,
          cacheControlMaxAge: 60,
          validUntil: Date.now() + 15 * 60 * 1000,
        };
      },
    });

    return NextResponse.json(response);
  } catch (error) {
    console.error("[WhatsApp Media Upload API Error]:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Não foi possível autorizar o upload",
    }, { status: 400 });
  }
}
