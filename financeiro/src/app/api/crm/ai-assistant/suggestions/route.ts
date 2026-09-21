import { NextRequest, NextResponse } from "next/server";
import { getUserFromHeaders } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { loadAccessibleSbcConversation } from "@/lib/ai-assistant/context";
import { generateConversationSuggestion } from "@/lib/ai-assistant/generate";
import { aiAssistantErrorResponse } from "@/lib/ai-assistant/http";
import { AiAssistantError, normalizeAiAssistantMode } from "@/lib/ai-assistant/policy";
import { personalizeAiAssistantResponse } from "@/lib/ai-assistant/privacy";

export const dynamic = "force-dynamic";

function requireUser(req: NextRequest) {
  const user = getUserFromHeaders(req);
  if (!user) throw new AiAssistantError("Não autorizado", 401);
  return user;
}

function conversationIdFrom(value: unknown) {
  if (typeof value !== "string" || !value.trim()) throw new AiAssistantError("Conversa não informada");
  return value.trim();
}

function serializeDraft(draft: {
  id: string;
  content: string;
  status: string;
  version: number;
  sourceMessageId: string | null;
  usage: unknown;
  createdAt: Date;
  updatedAt: Date;
} | null, savedContactName?: string | null) {
  if (!draft) return null;
  return {
    id: draft.id,
    content: personalizeAiAssistantResponse(draft.content, savedContactName),
    status: draft.status,
    version: draft.version,
    sourceMessageId: draft.sourceMessageId,
    usage: draft.usage,
    createdAt: draft.createdAt.toISOString(),
    updatedAt: draft.updatedAt.toISOString(),
  };
}

export async function GET(req: NextRequest) {
  try {
    requireUser(req);
    const conversationId = conversationIdFrom(req.nextUrl.searchParams.get("conversationId"));
    const { conversation } = await loadAccessibleSbcConversation(req, conversationId);
    const [draft, latestMessage] = await Promise.all([
      prisma.aiAssistantDraft.findUnique({ where: { conversationId } }),
      prisma.whatsAppMessage.findFirst({
        where: { conversationId, type: "text", status: { not: "deleted" }, body: { not: "" } },
        select: { id: true, fromMe: true },
        orderBy: [{ timestamp: "desc" }, { id: "desc" }],
      }),
    ]);
    const currentDraft = draft
      && !latestMessage?.fromMe
      && latestMessage?.id === draft.sourceMessageId
      && ["active", "inserted"].includes(draft.status)
      ? draft
      : null;
    return NextResponse.json({
      mode: conversation.aiMode,
      draft: serializeDraft(currentDraft, conversation.contact.name),
    });
  } catch (error) {
    return aiAssistantErrorResponse(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = requireUser(req);
    const input = await req.json();
    const conversationId = conversationIdFrom(input.conversationId);
    const result = await generateConversationSuggestion({
      req,
      conversationId,
      userId: user.userId,
      campaignName: typeof input.campaignName === "string" ? input.campaignName.slice(0, 240) : null,
      force: input.force === true,
    });
    return NextResponse.json({ draft: serializeDraft(result.draft), cached: result.cached });
  } catch (error) {
    return aiAssistantErrorResponse(error);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = requireUser(req);
    const input = await req.json();
    const conversationId = conversationIdFrom(input.conversationId);
    await loadAccessibleSbcConversation(req, conversationId);

    if (input.action === "mode") {
      const mode = normalizeAiAssistantMode(input.mode);
      const conversation = await prisma.whatsAppConversation.update({
        where: { id: conversationId },
        data: { aiMode: mode, aiModeUpdatedAt: new Date(), aiModeUpdatedBy: user.userId },
        select: { aiMode: true },
      });
      return NextResponse.json({ mode: conversation.aiMode });
    }

    const draftId = typeof input.draftId === "string" ? input.draftId : "";
    if (!draftId) throw new AiAssistantError("Sugestão não informada");
    if (input.action === "use") {
      const [draft, latestMessage] = await Promise.all([
        prisma.aiAssistantDraft.findFirst({ where: { id: draftId, conversationId } }),
        prisma.whatsAppMessage.findFirst({
          where: { conversationId, type: "text", status: { not: "deleted" }, body: { not: "" } },
          select: { id: true, fromMe: true },
          orderBy: [{ timestamp: "desc" }, { id: "desc" }],
        }),
      ]);
      if (!draft || latestMessage?.fromMe || latestMessage?.id !== draft.sourceMessageId) {
        throw new AiAssistantError("A conversa mudou; gere uma nova sugestão", 409);
      }
      const updated = await prisma.aiAssistantDraft.updateMany({
        where: { id: draftId, conversationId, status: { in: ["active", "inserted"] } },
        data: { status: "inserted", usedBy: user.userId, usedAt: new Date() },
      });
      if (!updated.count) throw new AiAssistantError("A sugestão mudou; gere outra", 409);
      return NextResponse.json({ success: true });
    }
    if (input.action === "discard") {
      await prisma.aiAssistantDraft.updateMany({
        where: { id: draftId, conversationId, status: { in: ["active", "inserted"] } },
        data: { status: "discarded", usedBy: user.userId, usedAt: new Date() },
      });
      return NextResponse.json({ success: true });
    }
    throw new AiAssistantError("Ação inválida");
  } catch (error) {
    return aiAssistantErrorResponse(error);
  }
}
