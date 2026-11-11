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
import { sanitizeAiAssistantText } from "@/lib/ai-assistant/privacy";
import { aliceFearPolicy } from "@/lib/alice/fear-policy";
import { sbcOutOfHoursReply } from "@/lib/ai-assistant/autonomy/out-of-hours";

type BookingFollowup = { kind: "booking_followup"; version: 1; questions: string[]; startTime: string;
  payload?: AliceTurnPayload; messages?: string[] };

function readBookingFollowup(value: unknown): BookingFollowup | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (data.kind !== "booking_followup" || data.version !== 1 || typeof data.startTime !== "string"
    || !Number.isFinite(Date.parse(data.startTime)) || !Array.isArray(data.questions) || !data.questions.length
    || data.questions.length > 8 || data.questions.some((question) => typeof question !== "string" || !question.trim() || question.length > 1_200)) return null;
  const payload = readAliceTurnPayload(data.payload);
  const messages = Array.isArray(data.messages) && data.messages.every((message) => typeof message === "string") ? data.messages as string[] : undefined;
  return { kind: "booking_followup", version: 1, questions: data.questions as string[], startTime: data.startTime,
    ...(payload ? { payload } : {}), ...(messages ? { messages } : {}) };
}

function bookingFollowupContext(context: AliceAutonomousContext, followup: BookingFollowup): AliceAutonomousContext {
  const questions = followup.questions.map((text) => ({ text: sanitizeAiAssistantText(text, [context.contactName || ""]) }));
  const fear = aliceFearPolicy({ UNIDADE: "SBC", CONVERSA: [{ role: "cliente", text: questions.map((question) => question.text).join("\n") }],
    MENSAGENS_RECENTES_SEM_RESPOSTA: questions });
  const memoryRuntime = context.memoryRuntime ? { ...context.memoryRuntime, guard: { ...context.memoryRuntime.guard,
    fear: context.memoryRuntime.guard.fear?.requiresHuman ? context.memoryRuntime.guard.fear : fear || context.memoryRuntime.guard.fear } } : undefined;
  return { ...context, ...(memoryRuntime ? { memoryRuntime } : {}), bookingFollowup: true, prompt: { ...context.prompt, HORARIOS_SBC: [],
    DUVIDAS_APOS_AGENDAMENTO: { dataRegistrada: followup.startTime, confirmacao: "submitted" },
    MENSAGENS_RECENTES_SEM_RESPOSTA: questions,
    ULTIMA_MENSAGEM_CLIENTE: { id: context.source.id, text: questions.map((question) => question.text).join("\n") } } };
}

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
  let bookingFollowup = readBookingFollowup(turn.messagesJson);
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
    if (bookingFollowup && reason !== "clinical_safety") error = "booking_followup_requires_review";
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
    const loadedContext = await deps.loadContext(turn, database, now());
    if (!loadedContext) { await finish("skipped", "context_changed"); return "skipped"; }
    if (bookingFollowup && (!turn.appointmentId || !turn.firstSentAt || turn.nextMessageIndex !== 1
      || !Array.isArray(turn.providerMessageIds) || turn.providerMessageIds.length !== 1)) return human("model_requested", "invalid_booking_followup");
    let context = bookingFollowup ? bookingFollowupContext(loadedContext, bookingFollowup) : loadedContext;
    memoryRuntime = context.memoryRuntime;
    if (context.handoffReason) return human(context.handoffReason);
    let payload: AliceTurnPayload | null = bookingFollowup?.payload || readAliceTurnPayload(turn.messagesJson);
    let messages = payload?.proposal.resposta || bookingFollowup?.messages || (Array.isArray(turn.messagesJson) ? turn.messagesJson.filter((value): value is string => typeof value === "string") : []);
    if (turn.messagesJson !== null && !messages.length && !bookingFollowup) return human("model_requested", "invalid_persisted_sequence");
    // Turnos antigos passam pelas travas, mas não recebem resumo inventado nem nova geração.
    if (memoryRuntime && messages.length && !payload) payload = legacyAliceTurnPayload(messages);
    if (payload && !memoryRuntime) return human("model_requested", "memory_path_disabled");
    if (!messages.length && !bookingFollowup && !turn.firstSentAt && !turn.appointmentId && turn.nextMessageIndex === 0
      && !context.memoryRuntime?.guard.appointment && !context.prompt.DADOS_AGENDA_ATUAIS) {
      const availabilityReply = sbcOutOfHoursReply(context, now());
      if (availabilityReply) {
        messages = [availabilityReply];
        if (memoryRuntime) payload = { version: 1, persistMemory: false, proposal: { resposta: messages,
          memoria: { resumo: "Resposta operacional sobre a grade, sem atualização de fatos da cliente." },
          seApresentouNestaResposta: false, escalarHumano: false, confidence: "high", usedKnowledge: [] } };
        const saved = await database.aliceAutonomousTurn.updateMany({ where: { id: turn.id, claimToken: token, status: "processing" },
          data: { messagesJson: payload || messages, usageRecorded: turn.usageRecorded || !turn.generationStartedAt } });
        if (!saved.count) return "skipped";
      }
    }
    if (!messages.length) {
      if (!bookingFollowup && !context.memoryRuntime?.guard.fear?.requiresHuman && looksLikeSchedulingExchange(context.messages)) {
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
          if (booking.pendingQuestions?.length) {
            const receipt = booking.confirmationMessage;
            bookingFollowup = { kind: "booking_followup", version: 1, questions: booking.pendingQuestions, startTime: booking.startTime };
            if (!receipt?.messageId || !receipt.messageRowId || !Number.isFinite(receipt.sentAt.getTime())) {
              return human("model_requested", "booking_followup_receipt_missing");
            }
            // A confirmação é uma saída deste turno. Registrar seu ID mantém o guard estrito no complemento.
            const queued = await database.aliceAutonomousTurn.updateMany({ where: { id: turn.id, claimToken: token, status: "processing" }, data: {
              status: "queued", claimToken: null, claimedAt: null, firstSentAt: receipt.sentAt,
              providerMessageIds: [receipt.messageId], nextMessageIndex: 1, messagesJson: bookingFollowup,
              availableAt: new Date(receipt.sentAt.getTime() + ALICE_AUTONOMY_COMPLEMENT_MS),
            } });
            return queued.count ? "queued" : "skipped";
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
      if (bookingFollowup && messages.length !== 1) return human("model_requested", "invalid_booking_followup_sequence");
      if (memoryRuntime) {
        if (!proposal) return human("model_requested", "structured_proposal_missing");
        payload = { version: 1, proposal };
      }
      const saved = await database.aliceAutonomousTurn.updateMany({ where: { id: turn.id, claimToken: token, status: "processing" }, data: {
        messagesJson: bookingFollowup ? { ...bookingFollowup, ...(payload ? { payload } : { messages }) } : payload || messages,
      } });
      if (!saved.count) return "skipped";
    }
    if (memoryRuntime && payload) {
      const memory = await getOrCreateMemory(memoryRuntime.scope, {}, database);
      memoryRuntime.guard.presentationAt = memory.apresentacaoFeitaEm;
      memoryRuntime.guard.appointment = await currentAliceAppointment(memoryRuntime.scope, context.conversation.contact.phone, database);
      const guarded = guardAliceTurn(payload, memoryRuntime, bookingFollowup ? 0 : turn.nextMessageIndex);
      await auditAliceGuardEvents(turn.id, guarded.events, database);
      if (guarded.status === "handoff") return human("model_requested", guarded.reason);
      if (guarded.status === "skip") {
        if (bookingFollowup) return human("model_requested", "booking_followup_empty");
        if (turn.nextMessageIndex > 0 && turn.firstSentAt) {
          return await completeAccepted();
        }
        await finish("skipped", guarded.reason); return "skipped";
      }
      payload = guarded.payload;
      messages = payload.proposal.resposta;
    }
    const responseIndex = bookingFollowup ? 0 : turn.nextMessageIndex;
    let message = messages[responseIndex];
    if (!message || messages.length > 2 || message.length > 1_200) return human("model_requested", "invalid_message_sequence");
    if (bookingFollowup && /\b\d{1,2}\/\d{1,2}\b/u.test(message) && /\b\d{1,2}(?:h|:\d{2})/iu.test(message)) {
      return human("model_requested", "booking_followup_new_offer");
    }
    if (!aliceAutonomySchedulingTextValid(turn.nextMessageIndex === 0 ? messages : [message], now(), context.prompt)) {
      if (bookingFollowup) return human("model_requested", "booking_followup_invalid_content");
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
      message = messages[responseIndex];
      if (!message || messages.length > 2 || message.length > 1_200) return human("model_requested", "invalid_message_sequence");
      if (!aliceAutonomySchedulingTextValid(turn.nextMessageIndex === 0 ? messages : [message], now(), retryContext.prompt)) return scheduleFailure();
      context = retryContext;
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
            presentationAt: latest.apresentacaoFeitaEm, appointment } }, responseIndex);
          if (latest.escalarHumano || final.status !== "ready" || final.payload.proposal.resposta[responseIndex] !== message) {
            throw new Error("alice_final_guard_changed");
          }
        }
        if (!await deps.validate(turn, token, "sending", database)
          || !aliceAutonomySchedulingTextValid(turn.nextMessageIndex === 0 ? messages : [message], now(), context.prompt)) throw new AliceAutonomyStopped();
        if (Date.now() > deadline - 16_000) throw new AliceAutonomyStopped();
        externalSendStarted = true;
      },
    });
    const ids = Array.isArray(turn.providerMessageIds) ? turn.providerMessageIds : [];
    const nextIndex = turn.nextMessageIndex + 1;
    const hasComplement = !bookingFollowup && nextIndex < messages.length;
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
    if (bookingFollowup && !(error instanceof AliceAutonomyStopped) && !externalSendStarted) {
      return human("model_requested", "booking_followup_requires_review");
    }
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
