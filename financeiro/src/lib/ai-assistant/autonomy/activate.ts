import { prisma } from "@/lib/db";
import { AiAssistantError } from "@/lib/ai-assistant/policy";
import { clearAliceEscalationOnResume } from "@/lib/alice/runtime-memory";
import { ALICE_AUTONOMY_INSTANCE_ID } from "@/lib/ai-assistant/autonomy/policy";
import { enqueueAliceTurnInTransaction, lockAliceQueue } from "@/lib/ai-assistant/autonomy/queue";

type ModeSnapshot = { aiMode: string; aiModeUpdatedBy: string | null; aiModeUpdatedAt: Date | null; instanceId: string };

export function activateAliceConversation(conversationId: string, prior: ModeSnapshot, operator: string, activatedAt: Date,
  expectedSourceMessageId?: string | null, database = prisma, now = new Date()) {
  if (prior.instanceId !== ALICE_AUTONOMY_INSTANCE_ID || !operator) throw new AiAssistantError("Conversa fora do escopo da Alice.", 403);
  return database.$transaction(async (tx) => {
    await lockAliceQueue(conversationId, tx);
    const changed = await tx.whatsAppConversation.updateMany({
      where: { id: conversationId, instanceId: prior.instanceId, aiMode: prior.aiMode, aiModeUpdatedAt: prior.aiModeUpdatedAt,
        aiModeUpdatedBy: prior.aiModeUpdatedBy, blockedAt: null, archivedAt: null, commercialPaused: false,
        status: { notIn: ["closed", "resolved", "lost"] }, commercialHolds: { none: {} },
        instance: { unit: "SBC", status: "connected" } },
      data: { aiMode: "agent", aiModeUpdatedAt: now, aiModeUpdatedBy: operator },
    });
    if (!changed.count) throw new AiAssistantError("A conversa mudou ou está pausada. Atualize antes de ativar a Alice.", 409);
    const latest = await tx.whatsAppMessage.findFirst({
      where: { conversationId, status: { not: "deleted" } }, select: { id: true, timestamp: true, fromMe: true },
      orderBy: [{ timestamp: "desc" }, { id: "desc" }],
    });
    if (expectedSourceMessageId && (latest?.id !== expectedSourceMessageId || latest.fromMe)) {
      throw new AiAssistantError("A conversa já mudou; a mensagem selecionada não será retomada.", 409);
    }
    if (latest && !latest.fromMe) {
      const turn = await enqueueAliceTurnInTransaction({
        conversationId, instanceId: prior.instanceId, sourceMessageId: latest.id, timestamp: latest.timestamp, origin: "backlog",
        resumeBookingBy: prior.aiMode === "manual" && prior.aiModeUpdatedBy === "alice-handoff" ? operator : undefined,
        resumeHistoricalPriceBy: operator,
      }, tx, activatedAt, now);
      if (!turn.queued && !["processing", "sending", "sent"].includes(turn.reason)) {
        throw new AiAssistantError(turn.reason === "booking_not_excluded"
          ? "A Alice não retomou a mensagem. Confira o agendamento vinculado à conversa antes de responder."
          : "A Alice não retomou a mensagem pendente. Confira o histórico e o acompanhamento antes de responder.", 409);
      }
    }
    // A alteração do modo e a retomada são atômicas. Em caso de bloqueio, preservamos também a pausa da memória.
    await clearAliceEscalationOnResume({ conversationId, instanceId: prior.instanceId, unidade: "SBC" }, tx);
  }, { timeout: 10_000 });
}
