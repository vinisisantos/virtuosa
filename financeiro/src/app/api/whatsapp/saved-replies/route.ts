import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import {
  SAVED_REPLY_MAX_PER_USER,
  validateSavedReplyInput,
} from "@/lib/whatsapp/saved-replies";

export const dynamic = "force-dynamic";

function authenticatedUserId(req: Request) {
  return req.headers.get("x-user-id")?.trim() || "";
}

function isUniqueConstraintError(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
}

export async function GET(req: Request) {
  try {
    const userId = authenticatedUserId(req);
    if (!userId) return NextResponse.json({ error: "Usuário não identificado" }, { status: 401 });

    const replies = await prisma.whatsAppSavedReply.findMany({
      where: { userId },
      select: {
        id: true,
        title: true,
        content: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: SAVED_REPLY_MAX_PER_USER,
    });

    return NextResponse.json({ replies }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("[WhatsApp Saved Replies GET Error]:", error);
    return NextResponse.json({ error: "Não foi possível carregar as respostas rápidas" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const userId = authenticatedUserId(req);
    if (!userId) return NextResponse.json({ error: "Usuário não identificado" }, { status: 401 });

    const parsed = validateSavedReplyInput(await req.json().catch(() => null));
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const replyCount = await prisma.whatsAppSavedReply.count({ where: { userId } });
    if (replyCount >= SAVED_REPLY_MAX_PER_USER) {
      return NextResponse.json({
        error: `Você pode salvar até ${SAVED_REPLY_MAX_PER_USER} respostas rápidas`,
      }, { status: 409 });
    }

    const reply = await prisma.whatsAppSavedReply.create({
      data: { userId, ...parsed.value },
      select: {
        id: true,
        title: true,
        content: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ reply }, { status: 201 });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return NextResponse.json({ error: "Você já possui uma resposta com esse nome" }, { status: 409 });
    }
    console.error("[WhatsApp Saved Replies POST Error]:", error);
    return NextResponse.json({ error: "Não foi possível salvar a resposta rápida" }, { status: 500 });
  }
}
