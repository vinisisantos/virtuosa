import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { validateSavedReplyCategoryInput } from "@/lib/whatsapp/saved-replies";
import { withSavedReplyCategorySchema } from "@/lib/whatsapp/saved-replies-schema";

function authenticatedUserId(req: Request) {
  return req.headers.get("x-user-id")?.trim() || "";
}

function isUniqueConstraintError(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = authenticatedUserId(req);
    if (!userId) return NextResponse.json({ error: "Usuário não identificado" }, { status: 401 });

    const { id } = await params;
    const parsed = validateSavedReplyCategoryInput(await req.json().catch(() => null));
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const result = await withSavedReplyCategorySchema(() => prisma.whatsAppSavedReplyCategory.updateMany({
      where: { id, userId },
      data: parsed.value,
    }));
    if (result.count !== 1) {
      return NextResponse.json({ error: "Categoria não encontrada" }, { status: 404 });
    }

    const category = await prisma.whatsAppSavedReplyCategory.findFirst({
      where: { id, userId },
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ category });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return NextResponse.json({ error: "Você já possui uma categoria com esse nome" }, { status: 409 });
    }
    console.error("[WhatsApp Saved Reply Category PATCH Error]:", error);
    return NextResponse.json({ error: "Não foi possível atualizar a categoria" }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = authenticatedUserId(req);
    if (!userId) return NextResponse.json({ error: "Usuário não identificado" }, { status: 401 });

    const { id } = await params;
    const result = await withSavedReplyCategorySchema(() => (
      prisma.whatsAppSavedReplyCategory.deleteMany({ where: { id, userId } })
    ));
    if (result.count !== 1) {
      return NextResponse.json({ error: "Categoria não encontrada" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[WhatsApp Saved Reply Category DELETE Error]:", error);
    return NextResponse.json({ error: "Não foi possível excluir a categoria" }, { status: 500 });
  }
}
