import { Prisma, type AliceAutonomousTurn } from "@prisma/client";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { sendAutomationText } from "@/lib/whatsapp/automation-sender";
import { routeAliceHandoff } from "@/lib/ai-assistant/handoff";
import { looksLikeSchedulingExchange, type AliceAutoScheduleResult } from "@/lib/ai-assistant/auto-schedule";
import { loadAliceAutonomyConfig, aliceAutonomyRuntimeStatus } from "@/lib/ai-assistant/autonomy/config";
import { loadAliceAutonomousContext, type AliceAutonomousContext } from "@/lib/ai-assistant/autonomy/context";
import { generateAliceAutonomousReply } from "@/lib/ai-assistant/autonomy/generate";
import { claimAliceAutonomousTurn, recoverAliceAutonomousTurns } from "@/lib/ai-assistant/autonomy/queue";
import { validateAliceAutonomousTurn, AliceAutonomyStopped } from "@/lib/ai-assistant/autonomy/guard";
import { finishAliceAutonomousTurn, notifyAliceAutonomousHandoff } from "@/lib/ai-assistant/autonomy/lifecycle";
import { ALICE_AUTONOMY_COMPLEMENT_MS } from "@/lib/ai-assistant/autonomy/policy";
import { aliceAutonomySchedulingTextValid } from "@/lib/ai-assistant/autonomy/content-policy";

export type AliceAutonomyDependencies = {
  database: typeof prisma;
  now: () => Date;
  runtimeStatus: typeof aliceAutonomyRuntimeStatus;
  loadConfig: typeof loadAliceAutonomyConfig;
  loadContext: typeof loadAliceAutonomousContext;
  validate: typeof validateAliceAutonomousTurn;
  generate: typeof generateAliceAutonomousReply;
  send: typeof sendAutomationText;
  handoff: typeof routeAliceHandoff;
  schedule?: (params: { req: NextRequest; turn: AliceAutonomousTurn; context: AliceAutonomousContext; claimToken: string }) => Promise<AliceAutoScheduleResult>;
};

const defaults: AliceAutonomyDependencies = {
  database: prisma, now: () => new Date(), runtimeStatus: aliceAutonomyRuntimeStatus, loadConfig: loadAliceAutonomyConfig,
  loadContext: loadAliceAutonomousContext, validate: validateAliceAutonomousTurn, generate: generateAliceAutonomousReply,
  send: sendAutomationText, handoff: routeAliceHandoff,
};

export async function processAliceAutonomousTurn(
  claim: { turn: AliceAutonomousTurn; token: string }, req: NextRequest, overrides: Partial<AliceAutonomyDependencies> = {},
) {
  const deps = { ...defaults, ...overrides };
  const { database, now } = deps;
  const { turn, token } = claim;
  const finish = (status: "skipped" | "needs_human" | "uncertain" | "failed", reason: string) =>
    finishAliceAutonomousTurn({ turn, token, status, reason, database, now: now() });
  const human = async (reason: "clinical_safety" | "unsupported_procedure" | "model_requested", error: string = reason) => {
    if (await finish("needs_human", error)) await notifyAliceAutonomousHandoff(turn, reason, deps.handoff);
    return "needs_human";
  };
  let externalSendStarted = false;
  try {
    if (!await deps.validate(turn, token, "processing", database)) { await finish("skipped", "conversation_changed"); return "skipped"; }
    const context = await deps.loadContext(turn, database, now());
    if (!context) { await finish("skipped", "context_changed"); return "skipped"; }
    if (context.handoffReason) return human(context.handoffReason);
    let messages = Array.isArray(turn.messagesJson) ? turn.messagesJson.filter((value): value is string => typeof value === "string") : [];
    if (!messages.length) {
      if (looksLikeSchedulingExchange(context.messages)) {
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
          await database.aliceAutonomousTurn.update({ where: { id: turn.id }, data: { appointmentId: ledger?.appointmentId || null } });
          const state = booking.confirmation === "submitted" ? "sent" : "uncertain";
          if (state === "uncertain") {
            await finish("uncertain", "booking_confirmation_uncertain");
            await notifyAliceAutonomousHandoff(turn, "model_requested", deps.handoff);
          } else await database.aliceAutonomousTurn.updateMany({ where: { id: turn.id, claimToken: token, status: "processing" },
            data: { status: "sent", firstSentAt: now(), completedAt: now(), claimToken: null, messagesJson: Prisma.JsonNull, error: null } });
          return state;
        }
      }
      const generating = await database.aliceAutonomousTurn.updateMany({ where: { id: turn.id, claimToken: token, status: "processing" }, data: { generationStartedAt: now() } });
      if (!generating.count) return "skipped";
      const generated = await deps.generate(context);
      const { messages: generatedMessages, needsHuman, ...metrics } = generated;
      // O custo pertence ao turno mesmo quando uma intervenção durante a geração cancela a resposta.
      await database.aliceAutonomousTurn.update({ where: { id: turn.id }, data: metrics });
      if (needsHuman || !generatedMessages.length) return human("model_requested", "generation_requires_review");
      messages = generatedMessages;
      const saved = await database.aliceAutonomousTurn.updateMany({ where: { id: turn.id, claimToken: token, status: "processing" }, data: { messagesJson: messages } });
      if (!saved.count) return "skipped";
    }
    const message = messages[turn.nextMessageIndex];
    if (!message || messages.length > 2 || message.length > 1_200) return human("model_requested", "invalid_message_sequence");
    if (!aliceAutonomySchedulingTextValid([message], now())) return human("model_requested", "schedule_option_expired_or_invalid");
    const sending = await database.aliceAutonomousTurn.updateMany({ where: { id: turn.id, claimToken: token, status: "processing" }, data: { status: "sending" } });
    if (!sending.count) return "skipped";
    const sent = await deps.send({
      dbInstance: context.conversation.instance, conversationId: turn.conversationId,
      contactPhone: context.conversation.contact.phone, lastKnownJid: context.conversation.lastKnownJid,
      message, respondedByName: "Alice (automação)", requireProviderMessageId: true, providerTimeoutMs: 15_000,
      beforeSend: async () => {
        if (!await deps.validate(turn, token, "sending", database) || !aliceAutonomySchedulingTextValid([message], now())) throw new AliceAutonomyStopped();
        externalSendStarted = true;
      },
    });
    const ids = Array.isArray(turn.providerMessageIds) ? turn.providerMessageIds : [];
    const nextIndex = turn.nextMessageIndex + 1;
    const hasComplement = nextIndex < messages.length;
    await database.$transaction(async (tx) => {
      await tx.aliceAutonomousTurn.updateMany({ where: { id: turn.id, claimToken: token, status: "sending" }, data: {
        status: hasComplement ? "queued" : "sent", claimToken: null, claimedAt: null,
        nextMessageIndex: nextIndex, providerMessageIds: [...ids, sent.messageId], firstSentAt: turn.firstSentAt || sent.sentAt,
        availableAt: new Date(sent.sentAt.getTime() + ALICE_AUTONOMY_COMPLEMENT_MS),
        messagesJson: hasComplement ? messages : Prisma.JsonNull, completedAt: hasComplement ? null : now(), error: null,
      } });
      await tx.whatsAppConversation.updateMany({ where: { id: turn.conversationId, instanceId: turn.instanceId }, data: { lastOutboundAt: sent.sentAt } });
    });
    return hasComplement ? "queued" : "sent";
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
