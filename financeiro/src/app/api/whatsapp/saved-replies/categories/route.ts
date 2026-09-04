import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import {
  SAVED_REPLY_CATEGORY_MAX_PER_USER,
  validateSavedReplyCategoryInput,
} from "@/lib/whatsapp/saved-replies";
import { withSavedReplyCategorySchema } from "@/lib/whatsapp/saved-replies-schema";

export const dynamic = "force-dynamic";

function authenticatedUserId(req: Request) {
  return req.headers.get("x-user-id")?.trim() || "";
}

function isUniqueConstraintError(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
}

export async function POST(req: Request) {
  try {
    const userId = authenticatedUserId(req);
    if (!userId) return NextResponse.json({ error: "Usuário não identificado" }, { status: 401 });

    const parsed = validateSavedReplyCategoryInput(await req.json().catch(() => null));
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const categoryCount = await withSavedReplyCategorySchema(() => (
      prisma.whatsAppSavedReplyCategory.count({ where: { userId } })
    ));
    if (categoryCount >= SAVED_REPLY_CATEGORY_MAX_PER_USER) {
      return NextResponse.json({
        error: `Você pode criar até ${SAVED_REPLY_CATEGORY_MAX_PER_USER} categorias`,
      }, { status: 409 });
    }

    const category = await withSavedReplyCategorySchema(() => prisma.whatsAppSavedReplyCategory.create({
      data: { userId, ...parsed.value },
      select: {
        id: true,
        title: true,
        campaignName: true,
        createdAt: true,
        updatedAt: true,
      },
    }));

    return NextResponse.json({ category }, { status: 201 });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return NextResponse.json({ error: "Você já possui uma categoria com esse nome" }, { status: 409 });
    }
    console.error("[WhatsApp Saved Reply Category POST Error]:", error);
    return NextResponse.json({ error: "Não foi possível criar a categoria" }, { status: 500 });
  }
}
