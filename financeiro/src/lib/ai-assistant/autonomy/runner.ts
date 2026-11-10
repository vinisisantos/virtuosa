import { Prisma, type AliceAutonomousTurn } from "@prisma/client";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { sendAutomationText } from "@/lib/whatsapp/automation-sender";
import { ALICE_ATTENDANT_NAME } from "@/lib/whatsapp/inbox-attendant";
import { routeAliceHandoff } from "@/lib/ai-assistant/handoff";
import { looksLikeSchedulingExchange, type AliceAutoScheduleResult } from "@/lib/ai-assistant/auto-schedule";
import { loadAliceAutonomyConfig, aliceAutonomyRuntimeStatus } from "@/lib/ai-assistant/autonomy/config";
import { loadAliceAutonomousContext, type AliceAutonomousContext } from "@/lib/ai-assistant/autonomy/context";
import { generateAliceAutonomousReply, type AutonomousGeneration } from "@/lib/ai-assistant/autonomy/generate";
import { claimAliceAutonomousTurn, recoverAliceAutonomousTurns } from "@/lib/ai-assistant/autonomy/queue";
import { validateAliceAutonomousTurn, AliceAutonomyStopped } from "@/lib/ai-assistant/autonomy/guard";
import { finishAliceAutonomousTurn, notifyAliceAutonomousHandoff } from "@/lib/ai-assistant/autonomy/lifecycle";
import { ALICE_AUTONOMY_COMPLEMENT_MS, aliceAutonomyRequiresHumanOwnership } from "@/lib/ai-assistant/autonomy/policy";
import { aliceAutonomySchedulingTextValid } from "@/lib/ai-assistant/autonomy/content-policy";
import { readAliceTurnPayload, legacyAliceTurnPayload, guardAliceTurn, auditAliceGuardEvents, type AliceTurnPayload } from "@/lib/alice/turn-payload";
import { getOrCreateMemory, recordAliceSentMessage } from "@/lib/alice/memory";
import { applyCurrentAliceMemory } from "@/lib/alice/runtime-memory";
import { currentAliceAppointment, type AliceMemoryRuntime } from "@/lib/alice/runtime-context";
import { prepareAliceAudioTurn } from "@/lib/alice/audio/prepare";
import { markCompletedAliceRepliesRead } from "@/lib/ai-assistant/autonomy/answered-read";

export type AliceAutonomyDependencies = {
  database: typeof prisma;
  now: () => Date;
  runtimeStatus: typeof aliceAutonomyRuntimeStatus;
  loadConfig: typeof loadAliceAutonomyConfig;
  loadContext: typeof loadAliceAutonomousContext;
  validate: typeof validateAliceAutonomousTurn;
  prepareAudio: typeof prepareAliceAudioTurn;
  generate: typeof generateAliceAutonomousReply;
  send: typeof sendAutomationText;
  handoff: typeof routeAliceHandoff;
  schedule?: (params: { req: NextRequest; turn: AliceAutonomousTurn; context: AliceAutonomousContext; claimToken: string }) => Promise<AliceAutoScheduleResult>;
};

const defaults: AliceAutonomyDependencies = {
  database: prisma, now: () => new Date(), runtimeStatus: aliceAutonomyRuntimeStatus, loadConfig: loadAliceAutonomyConfig,
  loadContext: loadAliceAutonomousContext, validate: validateAliceAutonomousTurn, generate: generateAliceAutonomousReply,
  send: sendAutomationText, handoff: routeAliceHandoff,
  prepareAudio: prepareAliceAudioTurn,
};

export async function processAliceAutonomousTurn(
  claim: { turn: AliceAutonomousTurn; token: string }, req: NextRequest, overrides: Partial<AliceAutonomyDependencies> = {},
) {
  const deps = { ...defaults, ...overrides };
  const { database, now } = deps;
  const { turn, token } = claim;
  const deadline = Date.now() + 55_000;
  let memoryRuntime: AliceMemoryRuntime | undefined;
  const finish = (status: "skipped" | "needs_human" | "uncertain" | "failed", reason: string) =>
    finishAliceAutonomousTurn({ turn, token, status, reason, database, now: now() });
  const completeAccepted = (firstSentAt?: Date) => database.$transaction(async (tx) => {
    const completed = await tx.aliceAutonomousTurn.updateMany({
      where: { id: turn.id, claimToken: token, status: "processing" },
      data: { status: "sent", ...(firstSentAt && { firstSentAt }), completedAt: now(),
        claimToken: null, messagesJson: Prisma.JsonNull, error: null },
    });
    if (completed.count) await markCompletedAliceRepliesRead(tx, [turn.id]);
    return completed.count ? "sent" : "skipped";
  });
  const human = async (reason: "clinical_safety" | "unsupported_procedure" | "model_requested", error: string = reason) => {
    if (memoryRuntime && reason === "clinical_safety") await applyCurrentAliceMemory(memoryRuntime.scope, turn.sourceMessageId,
      { escalarHumano: true, motivoEscalonamento: reason }, database);
    if (await finish("needs_human", error) && aliceAutonomyRequiresHumanOwnership("needs_human", error)
      && error !== "schedule_option_expired_or_invalid") {
      await notifyAliceAutonomousHandoff(turn, reason, deps.handoff);
    }
    return "needs_human";
  };
  const scheduleFailure = async () => await finish("failed", "schedule_option_expired_or_invalid") ? "failed" : "skipped";
  const generationTotals = { inputTokens: 0, outputTokens: 0, generationMs: 0, costMicroUsd: 0,
    cacheReadInputTokens: 0, cacheCreationInputTokens: 0 };
  let generationUsageRecorded = !turn.generationStartedAt || turn.usageRecorded;
  const recordGenerationMetrics = async (metrics: Omit<AutonomousGeneration,
    "messages" | "needsHuman" | "proposal" | "generationFailure">) => {
    generationTotals.inputTokens += metrics.inputTokens;
    generationTotals.outputTokens += metrics.outputTokens;
    generationTotals.generationMs += metrics.generationMs;
    generationTotals.costMicroUsd += metrics.costMicroUsd;
    generationTotals.cacheReadInputTokens += metrics.cacheReadInputTokens;
    generationTotals.cacheCreationInputTokens += metrics.cacheCreationInputTokens;
    generationUsageRecorded &&= metrics.usageRecorded;
    await database.aliceAutonomousTurn.update({ where: { id: turn.id }, data: {
      model: metrics.model, usageRecorded: generationUsageRecorded,
      costMicroUsd: turn.costMicroUsd + generationTotals.costMicroUsd,
      inputTokens: turn.inputTokens + generationTotals.inputTokens,
      outputTokens: turn.outputTokens + generationTotals.outputTokens,
      generationMs: turn.generationMs + generationTotals.generationMs,
      cacheReadInputTokens: turn.cacheReadInputTokens + generationTotals.cacheReadInputTokens,
      cacheCreationInputTokens: turn.cacheCreationInputTokens + generationTotals.cacheCreationInputTokens,
    } });
  };
  let externalSendStarted = false;
  try {
    if (!await deps.validate(turn, token, "processing", database)) { await finish("skipped", "conversation_changed"); return "skipped"; }
    const audio = await deps.prepareAudio(turn, database, now());
    if (audio === "review") return human("model_requested", "audio_requires_review");
    if (audio === "prepared") {
      if (!await deps.validate(turn, token, "processing", database)) { await finish("skipped", "conversation_changed_during_audio"); return "skipped"; }
      const deferred = await database.aliceAutonomousTurn.updateMany({ where: { id: turn.id, claimToken: token, status: "processing" },
        data: { status: "queued", claimToken: null, claimedAt: null, availableAt: now() } });
      return deferred.count ? "queued" : "skipped";
    }
    const context = await deps.loadContext(turn, database, now());
    if (!context) { await finish("skipped", "context_changed"); return "skipped"; }
    memoryRuntime = context.memoryRuntime;
    if (context.handoffReason) return human(context.handoffReason);
    let payload: AliceTurnPayload | null = readAliceTurnPayload(turn.messagesJson);
    let messages = payload?.proposal.resposta || (Array.isArray(turn.messagesJson) ? turn.messagesJson.filter((value): value is string => typeof value === "string") : []);
    if (turn.messagesJson !== null && !messages.length) return human("model_requested", "invalid_persisted_sequence");
    // Turnos antigos passam pelas travas, mas não recebem resumo inventado nem nova geração.
    if (memoryRuntime && messages.length && !payload) payload = legacyAliceTurnPayload(messages);
    if (payload && !memoryRuntime) return human("model_requested", "memory_path_disabled");
    if (!messages.length) {
      if (!context.memoryRuntime?.guard.fear && looksLikeSchedulingExchange(context.messages)) {
        if (!deps.schedule) return human("model_requested", "trusted_booking_unavailable");
        // O serviço de agenda pode enviar a confirmação antes de devolver seu resultado.
        externalSendStarted = true;
        const booking = await deps.schedule({ req, turn, context, claimToken: token });
        externalSendStarted = booking.status === "booked";
        if (booking.status === "review") return human("model_requested", "booking_requires_review");
        if (booking.status === "booked") {
          const ledger = await database.aliceAutoSchedule.findUnique({
            where: { conversationId_replyMessageId: { conversationId: turn.conversationId, replyMessageId: turn.sourceMessageId } },
            select: { appointmentId: true },
          });
          const linked = await database.aliceAutonomousTurn.updateMany({
            where: { id: turn.id, claimToken: token, status: "processing" }, data: { appointmentId: ledger?.appointmentId || null },
          });
          if (!linked.count) return "skipped";
          const state = booking.confirmation === "submitted" ? "sent" : "uncertain";
          if (state === "uncertain") {
            if (await finish("uncertain", "booking_confirmation_uncertain")) await notifyAliceAutonomousHandoff(turn, "model_requested", deps.handoff);
            return state;
          }
          return await completeAccepted(now());
        }
      }
      const generating = await database.aliceAutonomousTurn.updateMany({ where: { id: turn.id, claimToken: token, status: "processing" },
        data: { generationStartedAt: now(), usageRecorded: false } });
      if (!generating.count) return "skipped";
      if (Date.now() >= deadline - 20_000) return human("model_requested", "worker_budget_exhausted");
      const generated = await deps.generate(context, undefined, AbortSignal.timeout(Math.max(1, deadline - Date.now() - 20_000)));
      const { messages: generatedMessages, needsHuman, proposal, generationFailure, ...metrics } = generated;
      // O custo pertence ao turno mesmo quando uma intervenção durante a geração cancela a resposta.
      await recordGenerationMetrics(metrics);
      if (needsHuman || !generatedMessages.length) return human("model_requested", generationFailure || "generation_requires_review");
      messages = generatedMessages;
      if (memoryRuntime) {
        if (!proposal) return human("model_requested", "structured_proposal_missing");
        payload = { version: 1, proposal };
      }
      const saved = await database.aliceAutonomousTurn.updateMany({ where: { id: turn.id, claimToken: token, status: "processing" }, data: { messagesJson: payload || messages } });
      if (!saved.count) return "skipped";
    }
    if (memoryRuntime && payload) {
      const memory = await getOrCreateMemory(memoryRuntime.scope, {}, database);
      memoryRuntime.guard.presentationAt = memory.apresentacaoFeitaEm;
      memoryRuntime.guard.appointment = await currentAliceAppointment(memoryRuntime.scope, context.conversation.contact.phone, database);
      const guarded = guardAliceTurn(payload, memoryRuntime, turn.nextMessageIndex);
      await auditAliceGuardEvents(turn.id, guarded.events, database);
      if (guarded.status === "handoff") return human("model_requested", guarded.reason);
      if (guarded.status === "skip") {
        if (turn.nextMessageIndex > 0 && turn.firstSentAt) {
          return await completeAccepted();
        }
        await finish("skipped", guarded.reason); return "skipped";
      }
      payload = guarded.payload;
      messages = payload.proposal.resposta;
    }
    let message = messages[turn.nextMessageIndex];
    if (!message || messages.length > 2 || message.length > 1_200) return human("model_requested", "invalid_message_sequence");
    if (!aliceAutonomySchedulingTextValid([message], now())) {
      const retryBudgetMs = deadline - Date.now() - 20_000;
      if (turn.nextMessageIndex > 0 || turn.firstSentAt || retryBudgetMs < 5_000) {
        return scheduleFailure();
      }
      if (!await deps.validate(turn, token, "processing", database)) {
        await finish("skipped", "conversation_changed_before_schedule_retry");
        return "skipped";
      }
      const retryContext = { ...context, schedulingRetry: true,
        // A segunda tentativa precisa responder sem sugerir um horário que já falhou na validação.
        prompt: { ...context.prompt, HORARIOS_SBC: [] } };
      let retried: AutonomousGeneration;
      try {
        retried = await deps.generate(retryContext, undefined, AbortSignal.timeout(retryBudgetMs));
      } catch {
        return scheduleFailure();
      }
      const { messages: retryMessages, needsHuman: retryNeedsHuman, proposal: retryProposal,
        generationFailure: retryFailure, ...retryMetrics } = retried;
      await recordGenerationMetrics(retryMetrics);
      if (retryNeedsHuman || !retryMessages.length) {
        return human("model_requested", retryFailure || "generation_requires_review");
      }
      messages = retryMessages;
      if (memoryRuntime) {
        if (!retryProposal) return human("model_requested", "structured_proposal_missing");
        payload = { version: 1, proposal: retryProposal };
        const latestMemory = await getOrCreateMemory(memoryRuntime.scope, {}, database);
        memoryRuntime.guard.presentationAt = latestMemory.apresentacaoFeitaEm;
        memoryRuntime.guard.appointment = await currentAliceAppointment(memoryRuntime.scope, context.conversation.contact.phone, database);
        const guarded = guardAliceTurn(payload, memoryRuntime, turn.nextMessageIndex);
        await auditAliceGuardEvents(turn.id, guarded.events, database);
        if (guarded.status === "handoff") return human("model_requested", guarded.reason);
        if (guarded.status === "skip") {
          if (turn.nextMessageIndex > 0 && turn.firstSentAt) return await completeAccepted();
          await finish("skipped", guarded.reason);
          return "skipped";
        }
        payload = guarded.payload;
        messages = payload.proposal.resposta;
      }
      message = messages[turn.nextMessageIndex];
      if (!message || messages.length > 2 || message.length > 1_200) return human("model_requested", "invalid_message_sequence");
      if (!aliceAutonomySchedulingTextValid([message], now())) return scheduleFailure();
      const savedRetry = await database.aliceAutonomousTurn.updateMany({ where: { id: turn.id, claimToken: token, status: "processing" },
        data: { messagesJson: payload || messages } });
      if (!savedRetry.count) return "skipped";
    }
    const sending = await database.aliceAutonomousTurn.updateMany({ where: { id: turn.id, claimToken: token, status: "processing" }, data: { status: "sending" } });
    if (!sending.count) return "skipped";
    const sent = await deps.send({
      dbInstance: context.conversation.instance, conversationId: turn.conversationId,
      contactPhone: context.conversation.contact.phone, lastKnownJid: context.conversation.lastKnownJid,
      message, respondedByName: ALICE_ATTENDANT_NAME, aliceAutonomous: true, requireProviderMessageId: true, providerTimeoutMs: 15_000,
      beforeSend: async () => {
        if (memoryRuntime && payload) {
          const latest = await getOrCreateMemory(memoryRuntime.scope, {}, database);
          const appointment = await currentAliceAppointment(memoryRuntime.scope, context.conversation.contact.phone, database);
          const final = guardAliceTurn(payload, { ...memoryRuntime, guard: { ...memoryRuntime.guard,
            presentationAt: latest.apresentacaoFeitaEm, appointment } }, turn.nextMessageIndex);
          if (latest.escalarHumano || final.status !== "ready" || final.payload.proposal.resposta[turn.nextMessageIndex] !== message) {
            throw new Error("alice_final_guard_changed");
          }
        }
        if (!await deps.validate(turn, token, "sending", database) || !aliceAutonomySchedulingTextValid([message], now())) throw new AliceAutonomyStopped();
        if (Date.now() > deadline - 16_000) throw new AliceAutonomyStopped();
        externalSendStarted = true;
      },
    });
    const ids = Array.isArray(turn.providerMessageIds) ? turn.providerMessageIds : [];
    const nextIndex = turn.nextMessageIndex + 1;
    const hasComplement = nextIndex < messages.length;
    if (memoryRuntime && payload) {
      await recordAliceSentMessage(memoryRuntime.scope, sent.messageRowId, database);
      if (!hasComplement && payload.persistMemory !== false) await applyCurrentAliceMemory(memoryRuntime.scope, turn.sourceMessageId, payload.proposal.memoria, database);
    }
    const recorded = await database.$transaction(async (tx) => {
      const transition = await tx.aliceAutonomousTurn.updateMany({ where: { id: turn.id, claimToken: token, status: "sending" }, data: {
        status: hasComplement ? "queued" : "sent", claimToken: null, claimedAt: null,
        nextMessageIndex: nextIndex, providerMessageIds: [...ids, sent.messageId], firstSentAt: turn.firstSentAt || sent.sentAt,
        availableAt: new Date(sent.sentAt.getTime() + ALICE_AUTONOMY_COMPLEMENT_MS),
        messagesJson: hasComplement ? payload || messages : Prisma.JsonNull, completedAt: hasComplement ? null : now(), error: null,
      } });
      if (!transition.count) return false;
      await tx.whatsAppConversation.updateMany({
        where: { id: turn.conversationId, instanceId: turn.instanceId, aiMode: "agent", status: context.conversation.status },
        data: { lastOutboundAt: sent.sentAt, ...(context.conversation.status === "waiting_response" ? { status: "open" } : {}) },
      });
      if (!hasComplement) await markCompletedAliceRepliesRead(tx, [turn.id]);
      return true;
    });
    return !recorded ? "skipped" : hasComplement ? "queued" : "sent";
  } catch (error) {
    if (error instanceof AliceAutonomyStopped || !externalSendStarted) {
      const status = error instanceof AliceAutonomyStopped ? "skipped" : "failed";
      if (await finish(status, status === "skipped" ? "conversation_changed_before_send" : "worker_failed_before_send")) {
        if (status === "failed") await notifyAliceAutonomousHandoff(turn, "model_requested", deps.handoff);
      }
      return status;
    }
    if (await finish("uncertain", "provider_send_uncertain_no_retry")) await notifyAliceAutonomousHandoff(turn, "model_requested", deps.handoff);
    return "uncertain";
  }
}

export async function runAliceAutonomousBatch(req: NextRequest, overrides: Partial<AliceAutonomyDependencies> = {}) {
  const deps = { ...defaults, ...overrides };
  const config = await deps.loadConfig(deps.database);
  if (!config.enabled) return { enabled: false, processed: 0, outcomes: [] as string[] };
  const runtime = deps.runtimeStatus();
  if (!runtime.ready) return { enabled: true, processed: 0, outcomes: [], blockers: runtime.blockers };
  const recovered = await recoverAliceAutonomousTurns(deps.database, deps.now());
  const outcomes: string[] = [];
  // Um modelo por invocação limita CPU, concorrência externa e ocupação do pool.
  const claim = await claimAliceAutonomousTurn(deps.database);
  if (claim) outcomes.push(await processAliceAutonomousTurn(claim, req, deps));
  const continuation = claim && outcomes[0] === "queued" ? await deps.database.aliceAutonomousTurn.findFirst({
    where: { id: claim.turn.id, status: "queued", nextMessageIndex: { gt: 0 } }, select: { id: true, availableAt: true },
  }) : null;
  return { enabled: true, processed: outcomes.length, outcomes, recovered, continuation };
}
