import { prisma } from "@/lib/db";
import { AiAssistantError } from "@/lib/ai-assistant/policy";
import { clearAliceEscalationOnResume } from "@/lib/alice/runtime-memory";
import { aliceCanResumeGeneralFear, aliceHealthHistoryRequiresHuman } from "@/lib/alice/fear-policy";
import { ALICE_AUTONOMY_INSTANCE_ID, ALICE_AUTONOMY_RECOVERY_WINDOW_MS } from "@/lib/ai-assistant/autonomy/policy";
import { enqueueAliceTurnInTransaction, lockAliceQueue } from "@/lib/ai-assistant/autonomy/queue";
import { recoverAlicePeriodNegotiation } from "@/lib/ai-assistant/autonomy/period-negotiation-recovery";
import { SBC_BOOKING_CHOICE_CLARIFICATION } from "@/lib/ai-assistant/sbc-scheduling-exchange";

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
      where: { conversationId, status: { not: "deleted" }, NOT: { type: "secretEncryptedMessage", body: "" } },
      select: { id: true, timestamp: true, createdAt: true, fromMe: true, type: true, body: true,
        respondedBy: true, respondedByName: true },
      orderBy: [{ timestamp: "desc" }, { id: "desc" }],
    });
    if (expectedSourceMessageId && (latest?.id !== expectedSourceMessageId || latest.fromMe)) {
      throw new AiAssistantError("A conversa já mudou; a mensagem selecionada não será retomada.", 409);
    }
    if (latest && !latest.fromMe) {
      const existing = await tx.aliceAutonomousTurn.findUnique({
        where: { conversationId_sourceMessageId: { conversationId, sourceMessageId: latest.id } },
        select: { origin: true, status: true, error: true, attempts: true, firstSentAt: true, generationStartedAt: true,
          nextMessageIndex: true, providerMessageIds: true, appointmentId: true, messagesJson: true, claimToken: true },
      });
      const origin = existing?.origin === "inbound" || (!existing && latest.timestamp >= activatedAt) ? "inbound" : "backlog";
      let resumeClinicalFearBy: string | undefined;
      const recoveryCutoff = new Date(now.getTime() - ALICE_AUTONOMY_RECOVERY_WINDOW_MS);
      if (prior.aiMode === "manual" && prior.aiModeUpdatedBy === "alice-handoff" && existing
        && ["needs_human", "failed"].includes(existing.status) && existing.error === "clinical_safety"
        && latest.timestamp >= recoveryCutoff && latest.createdAt >= recoveryCutoff && latest.type === "text" && latest.body.trim()
        && existing.attempts <= 1 && !existing.firstSentAt && !existing.generationStartedAt && existing.nextMessageIndex === 0
        && Array.isArray(existing.providerMessageIds) && existing.providerMessageIds.length === 0
        && !existing.appointmentId && existing.messagesJson === null && !existing.claimToken) {
        const [history, memory] = await Promise.all([
          tx.whatsAppMessage.findMany({ where: { conversationId, status: { not: "deleted" },
            NOT: { type: "secretEncryptedMessage", body: "" } },
            select: { id: true, fromMe: true, timestamp: true, type: true, status: true, body: true },
            orderBy: [{ timestamp: "desc" }, { id: "desc" }], take: 30 }),
          tx.leadMemory.findFirst({ where: { conversationId, unidade: "SBC" }, select: { escalarHumano: true,
            motivoEscalonamento: true, saudeObservacoes: true } }),
        ]);
        const dialogue = history.reverse();
        const lastAcceptedTeamIndex = dialogue.findLastIndex((message) => message.fromMe
          && ["sent", "delivered", "read", "played"].includes(message.status));
        const pending = dialogue.slice(lastAcceptedTeamIndex + 1);
        const incoming = pending.filter((message) => !message.fromMe);
        const memoryEscalationIsStale = memory?.escalarHumano === true && memory.motivoEscalonamento === "clinical_safety"
          && !aliceHealthHistoryRequiresHuman(memory.saudeObservacoes);
        const fearDialogue = pending.map((message) => ({ role: message.fromMe ? "atendente" : "cliente", text: message.body }));
        if (memoryEscalationIsStale && aliceCanResumeGeneralFear(fearDialogue, memory?.saudeObservacoes)
          && pending.length > 0 && pending.every((message) => message.type === "text") && incoming.at(-1)?.id === latest.id) {
          // Uma anotação de procedimentos prévios, sem condição ou reação, não deve manter falso escalonamento clínico.
          await clearAliceEscalationOnResume({ conversationId, instanceId: prior.instanceId, unidade: "SBC" }, tx);
          resumeClinicalFearBy = operator;
        }
      }
      const turn = await enqueueAliceTurnInTransaction({
        conversationId, instanceId: prior.instanceId, sourceMessageId: latest.id, timestamp: latest.timestamp, origin,
        resumeBookingBy: prior.aiMode === "manual" && prior.aiModeUpdatedBy === "alice-handoff" ? operator : undefined,
        resumeHistoricalPriceBy: operator,
        resumeScheduleBy: operator,
        resumeSoftFailureBy: operator,
        resumeClinicalFearBy,
        resumeEmptyEnvelopeBy: operator,
        resumeMediaTextBy: operator,
      }, tx, activatedAt, now);
      if (!turn.queued && !["processing", "sending", "sent"].includes(turn.reason)) {
        throw new AiAssistantError(turn.reason === "booking_not_excluded"
          ? "A Alice não retomou a mensagem. Confira o agendamento vinculado à conversa antes de responder."
          : "A Alice não retomou a mensagem pendente. Confira o histórico e o acompanhamento antes de responder.", 409);
      }
    }
    if (prior.aiMode === "manual" && prior.aiModeUpdatedBy === operator && latest?.fromMe
      && !latest.respondedBy && latest.respondedByName === "Alice" && latest.body === SBC_BOOKING_CHOICE_CLARIFICATION) {
      await recoverAlicePeriodNegotiation(conversationId, operator, tx, now);
    }
    // A alteração do modo e a retomada são atômicas. Em caso de bloqueio, preservamos também a pausa da memória.
    await clearAliceEscalationOnResume({ conversationId, instanceId: prior.instanceId, unidade: "SBC" }, tx);
  }, { timeout: 10_000 });
}
