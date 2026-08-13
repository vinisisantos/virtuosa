import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { validateSavedReplyInput } from "@/lib/whatsapp/saved-replies";
import { withSavedReplyCategorySchema } from "@/lib/whatsapp/saved-replies-schema";

function authenticatedUserId(req: Request) {
  return req.headers.get("x-user-id")?.trim() || "";
}

function isUniqueConstraintError(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
}

async function savedReplyCategoryBelongsToUser(categoryId: string | null, userId: string) {
  if (!categoryId) return true;
  const category = await withSavedReplyCategorySchema(() => prisma.whatsAppSavedReplyCategory.findFirst({
    where: { id: categoryId, userId },
    select: { id: true },
  }));
  return Boolean(category);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = authenticatedUserId(req);
    if (!userId) return NextResponse.json({ error: "Usuário não identificado" }, { status: 401 });

    const { id } = await params;
    const parsed = validateSavedReplyInput(await req.json().catch(() => null));
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
    if (!await savedReplyCategoryBelongsToUser(parsed.value.categoryId, userId)) {
      return NextResponse.json({ error: "Categoria não encontrada" }, { status: 404 });
    }

    const result = await withSavedReplyCategorySchema(() => prisma.whatsAppSavedReply.updateMany({
      where: { id, userId },
      data: parsed.value,
    }));
    if (result.count !== 1) {
      return NextResponse.json({ error: "Resposta rápida não encontrada" }, { status: 404 });
    }

    const reply = await prisma.whatsAppSavedReply.findFirst({
      where: { id, userId },
      select: {
        id: true,
        categoryId: true,
        title: true,
        content: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ reply });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return NextResponse.json({ error: "Você já possui uma resposta com esse nome" }, { status: 409 });
    }
    console.error("[WhatsApp Saved Reply PATCH Error]:", error);
    return NextResponse.json({ error: "Não foi possível atualizar a resposta rápida" }, { status: 500 });
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
    const result = await prisma.whatsAppSavedReply.deleteMany({ where: { id, userId } });
    if (result.count !== 1) {
      return NextResponse.json({ error: "Resposta rápida não encontrada" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[WhatsApp Saved Reply DELETE Error]:", error);
    return NextResponse.json({ error: "Não foi possível excluir a resposta rápida" }, { status: 500 });
  }
}
