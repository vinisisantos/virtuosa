import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import {
  SAVED_REPLY_CATEGORY_MAX_PER_USER,
  SAVED_REPLY_MAX_PER_USER,
  buildSavedReplyCampaignOptions,
  validateSavedReplyInput,
} from "@/lib/whatsapp/saved-replies";
import { withSavedReplyCategorySchema } from "@/lib/whatsapp/saved-replies-schema";

export const dynamic = "force-dynamic";

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

export async function GET(req: Request) {
  try {
    const userId = authenticatedUserId(req);
    if (!userId) return NextResponse.json({ error: "Usuário não identificado" }, { status: 401 });

    const [replies, categories, campaignRows] = await withSavedReplyCategorySchema(() => Promise.all([
      prisma.whatsAppSavedReply.findMany({
        where: { userId },
        select: {
          id: true,
          categoryId: true,
          title: true,
          content: true,
          position: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: [{ position: "asc" }, { updatedAt: "desc" }, { id: "desc" }],
        take: SAVED_REPLY_MAX_PER_USER,
      }),
      prisma.whatsAppSavedReplyCategory.findMany({
        where: { userId },
        select: {
          id: true,
          title: true,
          campaignName: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: [{ title: "asc" }, { id: "asc" }],
        take: SAVED_REPLY_CATEGORY_MAX_PER_USER,
      }),
      prisma.campaign.findMany({
        where: {
          unit: { in: ["Osasco", "SBC", "SCS"] },
          status: { not: "encerrada" },
        },
        select: { name: true, unit: true },
        orderBy: [{ name: "asc" }, { unit: "asc" }],
        take: 200,
      }),
    ]));

    return NextResponse.json({
      replies,
      categories,
      campaignOptions: buildSavedReplyCampaignOptions(campaignRows),
    }, {
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
    if (!await savedReplyCategoryBelongsToUser(parsed.value.categoryId, userId)) {
      return NextResponse.json({ error: "Categoria não encontrada" }, { status: 404 });
    }

    const [replyCount, maximumPosition] = await withSavedReplyCategorySchema(() => Promise.all([
      prisma.whatsAppSavedReply.count({ where: { userId } }),
      prisma.whatsAppSavedReply.aggregate({
        where: { userId },
        _max: { position: true },
      }),
    ]));
    if (replyCount >= SAVED_REPLY_MAX_PER_USER) {
      return NextResponse.json({
        error: `Você pode salvar até ${SAVED_REPLY_MAX_PER_USER} respostas rápidas`,
      }, { status: 409 });
    }

    const reply = await withSavedReplyCategorySchema(() => prisma.whatsAppSavedReply.create({
      data: {
        userId,
        ...parsed.value,
        position: (maximumPosition._max.position ?? -1) + 1,
      },
      select: {
        id: true,
        categoryId: true,
        title: true,
        content: true,
        position: true,
        createdAt: true,
        updatedAt: true,
      },
    }));

    return NextResponse.json({ reply }, { status: 201 });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return NextResponse.json({ error: "Você já possui uma resposta com esse nome" }, { status: 409 });
    }
    console.error("[WhatsApp Saved Replies POST Error]:", error);
    return NextResponse.json({ error: "Não foi possível salvar a resposta rápida" }, { status: 500 });
  }
}
