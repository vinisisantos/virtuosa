import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { validateSavedReplyOrderInput } from "@/lib/whatsapp/saved-replies";
import { withSavedReplyCategorySchema } from "@/lib/whatsapp/saved-replies-schema";

export const dynamic = "force-dynamic";

function authenticatedUserId(req: Request) {
  return req.headers.get("x-user-id")?.trim() || "";
}

export async function PUT(req: Request) {
  try {
    const userId = authenticatedUserId(req);
    if (!userId) return NextResponse.json({ error: "Usuário não identificado" }, { status: 401 });

    const parsed = validateSavedReplyOrderInput(await req.json().catch(() => null));
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const orderedIds = parsed.value.ids;
    const result = await withSavedReplyCategorySchema(() => prisma.$transaction(async (tx) => {
      const ownedReplies = await tx.whatsAppSavedReply.findMany({
        where: { userId },
        select: { id: true },
      });
      const ownedIds = new Set(ownedReplies.map((reply) => reply.id));
      if (ownedIds.size !== orderedIds.length || orderedIds.some((id) => !ownedIds.has(id))) {
        return { stale: true } as const;
      }

      const values = Prisma.join(orderedIds.map((id, position) => (
        Prisma.sql`(${id}::text, ${position}::integer)`
      )));
      await tx.$executeRaw(Prisma.sql`
        UPDATE "WhatsAppSavedReply" AS reply
        SET "position" = ordering."position"
        FROM (VALUES ${values}) AS ordering("id", "position")
        WHERE reply."id" = ordering."id"
          AND reply."userId" = ${userId}
      `);

      return { stale: false } as const;
    }));

    if (result.stale) {
      return NextResponse.json({
        error: "Sua biblioteca mudou. Reabra as respostas rápidas e tente novamente.",
      }, { status: 409 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[WhatsApp Saved Replies Reorder Error]:", error);
    return NextResponse.json({ error: "Não foi possível salvar a ordem das respostas rápidas" }, { status: 500 });
  }
}
