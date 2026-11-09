import { NextRequest, NextResponse } from "next/server";
import { getUserFromHeaders } from "@/lib/auth";
import { requireAliceAuthorizedUser } from "@/lib/ai-assistant/access";
import { prisma } from "@/lib/db";
import { loadAccessibleAliceConversation } from "@/lib/ai-assistant/context";
import { generateConversationSuggestion } from "@/lib/ai-assistant/generate";
import { aiAssistantErrorResponse } from "@/lib/ai-assistant/http";
import { AI_ASSISTANT_MODEL, AiAssistantError, normalizeAiAssistantMode } from "@/lib/ai-assistant/policy";
import { personalizeAiAssistantResponse } from "@/lib/ai-assistant/privacy";
import { requireAliceLiveRuntime } from "@/lib/ai-assistant/runtime";
import { aliceSequenceCanContinue, readAliceMessageSequence } from "@/lib/ai-assistant/message-sequence";
import { isSchedulingSuggestionExpired } from "@/lib/ai-assistant/sbc-scheduling-policy";
import { loadAliceAutonomyConfig, aliceAutonomyRuntimeStatus } from "@/lib/ai-assistant/autonomy/config";
import { ALICE_AUTONOMY_INSTANCE_ID } from "@/lib/ai-assistant/autonomy/policy";
import { enqueueAliceAutonomousTurn, pauseAliceForHuman } from "@/lib/ai-assistant/autonomy/queue";
import { clearAliceEscalationOnResume } from "@/lib/alice/runtime-memory";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function requireUser(req: NextRequest) {
  const user = getUserFromHeaders(req);
  if (!user) throw new AiAssistantError("Não autorizado", 401);
  requireAliceAuthorizedUser(user.userId);
  return user;
}

function conversationIdFrom(value: unknown) {
  if (typeof value !== "string" || !value.trim()) throw new AiAssistantError("Conversa não informada");
  return value.trim();
}

function targetMessageIdFrom(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !value.trim() || value.length > 120) {
    throw new AiAssistantError("Mensagem selecionada inválida");
  }
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
    const { conversation, unit } = await loadAccessibleAliceConversation(req, conversationId);
    const [draft, latestMessage] = await Promise.all([
      prisma.aiAssistantDraft.findUnique({ where: { conversationId } }),
      prisma.whatsAppMessage.findFirst({
        where: { conversationId, type: "text", status: { not: "deleted" }, body: { not: "" } },
        select: { id: true, fromMe: true },
        orderBy: [{ timestamp: "desc" }, { id: "desc" }],
      }),
    ]);
    const sequenceLatest = draft?.status === "sent" ? await prisma.whatsAppMessage.findFirst({
      where: { conversationId, status: { not: "deleted" } }, select: { id: true },
      orderBy: [{ timestamp: "desc" }, { id: "desc" }],
    }) : latestMessage;
    const currentDraft = draft
      && !isSchedulingSuggestionExpired(draft.usage)
      && (latestMessage?.id === draft.sourceMessageId || aliceSequenceCanContinue(draft, sequenceLatest?.id))
      && draft.unit === unit
      && draft.model === AI_ASSISTANT_MODEL
      && (["active", "inserted"].includes(draft.status) || aliceSequenceCanContinue(draft, sequenceLatest?.id))
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
      targetMessageId: targetMessageIdFrom(input.targetMessageId),
      force: input.force === true,
      compare: input.compare === true,
    });
    return NextResponse.json({ draft: serializeDraft(result.draft), cached: result.cached, handoff: result.handoff });
  } catch (error) {
    return aiAssistantErrorResponse(error);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = requireUser(req);
    const input = await req.json();
    const conversationId = conversationIdFrom(input.conversationId);
    const { unit, conversation: accessibleConversation } = await loadAccessibleAliceConversation(req, conversationId);

    if (input.action === "mode") {
      const mode = normalizeAiAssistantMode(input.mode);
      if (mode === "suggestions") requireAliceLiveRuntime();
      if (mode === "agent") {
        if (unit !== "SBC" || accessibleConversation.instanceId !== ALICE_AUTONOMY_INSTANCE_ID) {
          throw new AiAssistantError("O atendimento autônomo está disponível somente na caixa de leads de SBC.", 403);
        }
        if (!(await loadAliceAutonomyConfig()).enabled || !aliceAutonomyRuntimeStatus().ready) {
          throw new AiAssistantError("O atendimento autônomo precisa estar ativo e disponível no painel da Alice.", 409);
        }
        await clearAliceEscalationOnResume({ conversationId, instanceId: accessibleConversation.instanceId, unidade: "SBC" });
      } else if (accessibleConversation.aiMode === "agent") {
        await pauseAliceForHuman(conversationId);
      }
      const conversation = await prisma.whatsAppConversation.update({
        where: { id: conversationId },
        data: { aiMode: mode, aiModeUpdatedAt: new Date(), aiModeUpdatedBy: user.userId },
        select: { aiMode: true },
      });
      if (mode === "agent") {
        const latest = await prisma.whatsAppMessage.findFirst({
          where: { conversationId, status: { not: "deleted" } },
          select: { id: true, timestamp: true, fromMe: true },
          orderBy: [{ timestamp: "desc" }, { id: "desc" }],
        });
        if (latest && !latest.fromMe) await enqueueAliceAutonomousTurn({
          conversationId, instanceId: accessibleConversation.instanceId,
          sourceMessageId: latest.id, timestamp: latest.timestamp, origin: "backlog",
          resumeBookingBy: accessibleConversation.aiMode === "manual" && accessibleConversation.aiModeUpdatedBy === "alice-handoff" ? user.userId : undefined,
        });
      }
      return NextResponse.json({ mode: conversation.aiMode });
    }

    const draftId = typeof input.draftId === "string" ? input.draftId : "";
    if (!draftId) throw new AiAssistantError("Sugestão não informada");
    if (input.action === "use") {
      const [draft, latestMessage] = await Promise.all([
        prisma.aiAssistantDraft.findFirst({ where: { id: draftId, conversationId, unit, model: AI_ASSISTANT_MODEL } }),
        prisma.whatsAppMessage.findFirst({
          where: { conversationId, type: "text", status: { not: "deleted" }, body: { not: "" } },
          select: { id: true, fromMe: true },
          orderBy: [{ timestamp: "desc" }, { id: "desc" }],
        }),
      ]);
      if (!draft || (latestMessage?.id !== draft.sourceMessageId && !aliceSequenceCanContinue(draft, latestMessage?.id))) {
        throw new AiAssistantError("A conversa mudou; gere uma nova sugestão", 409);
      }
      if (Number.isSafeInteger(input.draftVersion) && input.draftVersion !== draft.version) {
        throw new AiAssistantError("A sugestão mudou; gere outra", 409);
      }
      const usage = draft.usage && typeof draft.usage === "object" && !Array.isArray(draft.usage)
        ? draft.usage as Record<string, unknown> : {};
      if (isSchedulingSuggestionExpired(usage)) throw new AiAssistantError("Os horários podem ter mudado; gere uma nova sugestão.", 409);
      const sequence = readAliceMessageSequence(usage);
      const continuingSequence = aliceSequenceCanContinue(draft, latestMessage?.id);
      const comparison = usage.comparison && typeof usage.comparison === "object" && !Array.isArray(usage.comparison)
        ? usage.comparison as Record<string, unknown> : null;
      const provider = input.provider === "codex" || input.provider === "claude" ? input.provider : null;
      const candidate = provider && comparison && comparison[provider] && typeof comparison[provider] === "object"
        ? comparison[provider] as Record<string, unknown> : null;
      if (provider && (typeof candidate?.response !== "string" || !candidate.response.trim() || candidate.response.length > 1200)) {
        throw new AiAssistantError("Esta sugestão não está disponível", 409);
      }
      const candidateMessages = Array.isArray(candidate?.messages) && candidate.messages.length === 2
        && candidate.messages.every((message) => typeof message === "string" && message.trim())
        ? candidate.messages as [string, string] : null;
      const initialSequence = usage.sequenceAllowed === true && provider && candidateMessages && !continuingSequence
        ? { provider, index: 0, messages: candidateMessages } : null;
      const selectedContent = continuingSequence && sequence ? sequence.messages[1]
        : initialSequence ? initialSequence.messages[0]
          : typeof candidate?.response === "string" ? candidate.response : draft.content;
      if (continuingSequence && (!sequence || provider !== sequence.provider)) {
        throw new AiAssistantError("Continue com o mesmo provedor da primeira mensagem", 409);
      }
      const selectedVersion = provider ? draft.version + 1 : draft.version;
      await prisma.$transaction(async (tx) => {
        if (continuingSequence) {
          await tx.$queryRaw`SELECT "id" FROM "WhatsAppConversation" WHERE "id" = ${conversationId} FOR UPDATE`;
          const currentMessage = await tx.whatsAppMessage.findFirst({
            where: { conversationId, status: { not: "deleted" } }, select: { id: true },
            orderBy: [{ timestamp: "desc" }, { id: "desc" }],
          });
          if (currentMessage?.id !== draft.sentMessageId) throw new AiAssistantError("A conversa mudou; gere uma nova sugestão", 409);
        }
        const updated = await tx.aiAssistantDraft.updateMany({
          where: { id: draftId, conversationId, version: draft.version, status: { in: continuingSequence ? ["sent"] : ["active", "inserted"] } },
          data: { status: "inserted", usedBy: user.userId, usedAt: new Date(),
            ...(provider ? { content: selectedContent, version: { increment: 1 }, usage: {
              ...usage, comparison: { ...comparison, selected: provider },
              ...(continuingSequence && sequence ? { sequence: { ...sequence, index: 1 } } : initialSequence ? { sequence: initialSequence } : {}),
            } } : {}),
          },
        });
        if (!updated.count) throw new AiAssistantError("A sugestão mudou; gere outra", 409);
        await tx.aiAssistantOperation.updateMany({
          where: {
            unit,
            kind: "suggestion",
            draftId,
            draftVersion: draft.version,
            draftOutcome: { in: ["pending", "inserted"] },
          },
          data: { draftOutcome: "inserted", ...(provider ? { draftVersion: selectedVersion } : {}) },
        });
      });
      return NextResponse.json({ success: true, content: selectedContent, draftId, draftVersion: selectedVersion });
    }
    if (input.action === "discard") {
      const requestedVersion = Number.isSafeInteger(input.draftVersion) ? input.draftVersion as number : undefined;
      const draft = await prisma.aiAssistantDraft.findFirst({
        where: {
          id: draftId,
          conversationId,
          unit,
          model: AI_ASSISTANT_MODEL,
          status: { in: ["active", "inserted"] },
          ...(requestedVersion !== undefined ? { version: requestedVersion } : {}),
        },
        select: { version: true },
      });
      if (draft) {
        await prisma.$transaction(async (tx) => {
          const updated = await tx.aiAssistantDraft.updateMany({
            where: { id: draftId, conversationId, version: draft.version, status: { in: ["active", "inserted"] } },
            data: { status: "discarded", usedBy: user.userId, usedAt: new Date() },
          });
          if (updated.count) {
            await tx.aiAssistantOperation.updateMany({
              where: {
                unit,
                kind: "suggestion",
                draftId,
                draftVersion: draft.version,
                draftOutcome: { in: ["pending", "inserted"] },
              },
              data: { draftOutcome: "discarded", draftWasEdited: false },
            });
          }
        });
      }
      return NextResponse.json({ success: true });
    }
    throw new AiAssistantError("Ação inválida");
  } catch (error) {
    return aiAssistantErrorResponse(error);
  }
}
