import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { markCompletedAliceRepliesRead } from "@/lib/ai-assistant/autonomy/answered-read";
import { loadAliceAutonomyConfig } from "@/lib/ai-assistant/autonomy/config";
import { currentAliceAppointment } from "@/lib/alice/current-appointment";
import { phoneLookupKey } from "@/lib/phone";
import { selectSbcSchedulingExchange } from "@/lib/ai-assistant/sbc-scheduling-exchange";
import { ALICE_AUTONOMY_CONFIG_KEY, ALICE_AUTONOMY_INSTANCE_ID, ALICE_AUTONOMY_LEASE_MS, aliceAutonomyAvailableAt,
  aliceAutonomyConversationEligible, aliceCanContinueAfterSoftHandoff, aliceRetryAttemptLimit } from "@/lib/ai-assistant/autonomy/policy";

export async function isAliceAutonomyActive(params: { conversationId: string; instanceId: string }, database = prisma) {
  if (params.instanceId !== ALICE_AUTONOMY_INSTANCE_ID) return false;
  const config = await loadAliceAutonomyConfig(database);
  if (!config.enabled) return false;
  const conversation = await database.whatsAppConversation.findFirst({
    where: { id: params.conversationId, instanceId: params.instanceId },
    select: { instanceId: true, status: true, blockedAt: true, archivedAt: true, commercialPaused: true, aiMode: true, instance: { select: { unit: true } } },
  });
  return Boolean(conversation && conversation.instance.unit === "SBC" && aliceAutonomyConversationEligible(conversation));
}

export async function pauseAliceForHuman(conversationId: string, database = prisma) {
  return database.$transaction(async (tx) => {
    const paused = await tx.whatsAppConversation.updateMany({
      where: { id: conversationId, instanceId: ALICE_AUTONOMY_INSTANCE_ID },
      data: { aiMode: "manual", aiModeUpdatedAt: new Date(), aiModeUpdatedBy: "human-takeover" },
    });
    if (paused.count) await tx.aliceAutonomousTurn.updateMany({
      where: { conversationId, instanceId: ALICE_AUTONOMY_INSTANCE_ID, status: { in: ["queued", "processing"] } },
      data: { status: "skipped", completedAt: new Date(), messagesJson: Prisma.JsonNull, claimToken: null, error: "human_takeover" },
    });
    return paused.count;
  });
}

type EnqueueAliceTurn = {
  conversationId: string; instanceId: string; sourceMessageId: string; timestamp: Date; origin: "inbound" | "backlog";
  resumeBookingBy?: string; resumeHistoricalPriceBy?: string; resumeScheduleBy?: string; resumeSoftFailureBy?: string;
  resumeClinicalFearBy?: string; resumeEmptyEnvelopeBy?: string;
};

export async function enqueueAliceAutonomousTurn(params: EnqueueAliceTurn, database = prisma, now = new Date()) {
  if (params.instanceId !== ALICE_AUTONOMY_INSTANCE_ID) return { queued: false, reason: "scope" };
  const config = await loadAliceAutonomyConfig(database);
  if (!config.enabled || !config.activatedAt) return { queued: false, reason: "disabled" };
  const activatedAt = new Date(config.activatedAt);
  return database.$transaction(async (tx) => {
    await lockAliceQueue(params.conversationId, tx);
    return enqueueAliceTurnInTransaction(params, tx, activatedAt, now);
  }, { timeout: 10_000 });
}

export async function lockAliceQueue(conversationId: string, tx: Prisma.TransactionClient) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`alice-turn:${conversationId}`}))`;
}

/** Ambos os chamadores serializam por conversa com lockAliceQueue antes da seleção da fonte. */
export async function enqueueAliceTurnInTransaction(params: EnqueueAliceTurn, tx: Prisma.TransactionClient,
  activatedAt: Date, now: Date) {
    const [conversation, source] = await Promise.all([
      tx.whatsAppConversation.findFirst({ where: { id: params.conversationId, instanceId: params.instanceId }, select: {
        instanceId: true, status: true, blockedAt: true, archivedAt: true, commercialPaused: true, aiMode: true, aiModeUpdatedAt: true, aiModeUpdatedBy: true, instance: { select: { unit: true } },
      } }),
      tx.whatsAppMessage.findFirst({ where: { id: params.sourceMessageId, conversationId: params.conversationId, fromMe: false,
        status: { not: "deleted" }, NOT: { type: "secretEncryptedMessage", body: "" } },
        select: { id: true, timestamp: true, createdAt: true, type: true, body: true } }),
    ]);
    if (!conversation || conversation.instance.unit !== "SBC" || !source || source.timestamp.getTime() > now.getTime() + 30_000) return { queued: false, reason: "invalid_source" };
    if (params.origin === "inbound" && (source.timestamp < activatedAt || source.createdAt < activatedAt)) {
      return { queued: false, reason: "before_activation" };
    }
    const latest = await tx.whatsAppMessage.findFirst({
      where: { conversationId: params.conversationId, fromMe: false, status: { not: "deleted" },
        NOT: { type: "secretEncryptedMessage", body: "" } },
      select: { id: true }, orderBy: [{ timestamp: "desc" }, { id: "desc" }],
    });
    if (latest?.id !== source.id) return { queued: false, reason: "superseded" };
    if (!aliceAutonomyConversationEligible({ ...conversation, aiMode: "agent" })) return { queued: false, reason: "conversation_paused" };
    // Sugestões e Manual explícito continuam sob controle humano; só o Manual ainda não configurado pode entrar automaticamente.
    let canResumeConversation = false;
    if (conversation.aiMode === "manual" && conversation.aiModeUpdatedBy === "alice-handoff" && params.origin === "inbound") {
      const priorTurn = await tx.aliceAutonomousTurn.findFirst({ where: { conversationId: params.conversationId, instanceId: params.instanceId },
        select: { sourceMessageId: true, status: true, error: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
      if (priorTurn && priorTurn.sourceMessageId !== source.id && ["needs_human", "failed"].includes(priorTurn.status)
        && aliceCanContinueAfterSoftHandoff(priorTurn.error || "")) {
        const escalated = await tx.leadMemory.findFirst({ where: { conversationId: params.conversationId, unidade: "SBC", escalarHumano: true }, select: { id: true } });
        canResumeConversation = !escalated;
      } else if (priorTurn && priorTurn.sourceMessageId !== source.id && ["needs_human", "failed"].includes(priorTurn.status)
        && priorTurn.error === "booking_requires_review" && source.type === "text" && source.body.trim()) {
        const [contact, escalated] = await Promise.all([
          tx.whatsAppConversation.findFirst({ where: { id: params.conversationId, instanceId: params.instanceId },
            select: { contact: { select: { phone: true } } } }),
          tx.leadMemory.findFirst({ where: { conversationId: params.conversationId, unidade: "SBC", escalarHumano: true }, select: { id: true } }),
        ]);
        const phone = contact?.contact.phone;
        const scope = { conversationId: params.conversationId, instanceId: params.instanceId, unidade: "SBC" as const };
        if (!escalated && phone && (phoneLookupKey(phone)?.length || 0) >= 10 && await currentAliceAppointment(scope, phone, tx)) {
          // Uma avaliação já confirmada libera perguntas gerais; nova negociação de horário continua com a equipe.
          const history = await tx.whatsAppMessage.findMany({ where: { conversationId: params.conversationId, status: { not: "deleted" },
            NOT: { type: "secretEncryptedMessage", body: "" } },
            select: { id: true, body: true, fromMe: true, status: true, type: true }, orderBy: [{ timestamp: "desc" }, { id: "desc" }], take: 30 });
          canResumeConversation = !selectSbcSchedulingExchange(history.reverse());
        }
      }
    }
    const canEnroll = conversation.aiMode === "manual"
      && (conversation.aiModeUpdatedBy === "alice-global-pause" || (!conversation.aiModeUpdatedAt && !conversation.aiModeUpdatedBy)
        || canResumeConversation);
    if (conversation.aiMode !== "agent" && canEnroll) {
      const enrolled = await tx.whatsAppConversation.updateMany({
        where: { id: params.conversationId, instanceId: params.instanceId, aiMode: conversation.aiMode, aiModeUpdatedAt: conversation.aiModeUpdatedAt },
        data: { aiMode: "agent", aiModeUpdatedAt: now, aiModeUpdatedBy: "alice-autonomy" },
      });
      if (!enrolled.count) return { queued: false, reason: "human_takeover" };
      conversation.aiMode = "agent";
    }
    if (!aliceAutonomyConversationEligible(conversation)) return { queued: false, reason: "conversation_paused" };
    await tx.aliceAutonomousTurn.updateMany({
      where: { conversationId: params.conversationId, sourceMessageId: { not: source.id }, status: { in: ["queued", "processing"] } },
      data: { status: "skipped", completedAt: now, messagesJson: Prisma.JsonNull, claimToken: null, error: "new_customer_message" },
    });
    const turn = await tx.aliceAutonomousTurn.upsert({
      where: { conversationId_sourceMessageId: { conversationId: params.conversationId, sourceMessageId: source.id } },
      create: { id: randomUUID(), conversationId: params.conversationId, instanceId: params.instanceId, sourceMessageId: source.id,
        origin: params.origin, availableAt: aliceAutonomyAvailableAt(source.createdAt, now, params.origin === "backlog") }, update: {},
      select: { id: true, status: true, error: true, origin: true, attempts: true, firstSentAt: true,
        generationStartedAt: true, nextMessageIndex: true, providerMessageIds: true, appointmentId: true },
    });
    const resumeBooking = turn.error === "booking_requires_review" && params.resumeBookingBy;
    const resumePrice = turn.error === "price_after_booking" && params.resumeHistoricalPriceBy;
    const resumeSchedule = turn.error === "schedule_option_expired_or_invalid" && params.resumeScheduleBy;
    const resumeSoftFailure = aliceCanContinueAfterSoftHandoff(turn.error || "") && params.resumeSoftFailureBy;
    const resumeAttemptLimit = aliceRetryAttemptLimit(turn.error, turn.attempts);
    const resumeClinicalFear = turn.error === "clinical_safety" && params.resumeClinicalFearBy;
    const resumeEmptyEnvelope = turn.error === "new_customer_message" ? params.resumeEmptyEnvelopeBy : undefined;
    const operator = resumeBooking || resumePrice || resumeSchedule || resumeSoftFailure || resumeClinicalFear || resumeEmptyEnvelope;
    const sourceCutoff = new Date(now.getTime() - 100 * 60 * 60 * 1000);
    const recentSource = source.timestamp >= sourceCutoff && source.createdAt >= sourceCutoff;
    let resumeBookingChoice = false;
    if (resumeBooking && params.origin === "inbound" && recentSource && source.type === "text" && source.body.trim()
      && turn.attempts <= 1 && !turn.firstSentAt && !turn.appointmentId && turn.nextMessageIndex === 0
      && !turn.generationStartedAt && Array.isArray(turn.providerMessageIds) && turn.providerMessageIds.length === 0) {
      const history = await tx.whatsAppMessage.findMany({ where: { conversationId: params.conversationId, status: { not: "deleted" },
        NOT: { type: "secretEncryptedMessage", body: "" } },
        select: { id: true, body: true, fromMe: true, status: true, type: true }, orderBy: [{ timestamp: "desc" }, { id: "desc" }], take: 30 });
      const exchange = selectSbcSchedulingExchange(history.reverse());
      if (exchange?.reply.id === source.id && !exchange.slot) {
        const [escalated, ledger] = await Promise.all([
          tx.leadMemory.findFirst({ where: { conversationId: params.conversationId, unidade: "SBC", escalarHumano: true }, select: { id: true } }),
          tx.aliceAutoSchedule.findUnique({ where: { conversationId_replyMessageId: { conversationId: params.conversationId, replyMessageId: source.id } }, select: { id: true } }),
        ]);
        resumeBookingChoice = !escalated && !ledger;
      }
    }
    const explicitRecovery = Boolean(resumeSchedule || resumeBookingChoice || resumeClinicalFear || resumeEmptyEnvelope
      || (resumeSoftFailure && ["inbound", "backlog"].includes(params.origin))
      || (params.origin === "backlog" && (resumeBooking || resumePrice)));
    const recoverableTurnStatus = ["needs_human", "failed"].includes(turn.status)
      || (turn.status === "skipped" && resumeEmptyEnvelope);
    if (recoverableTurnStatus && explicitRecovery && operator && conversation.aiModeUpdatedBy === operator) {
      if (resumeEmptyEnvelope && params.origin === "inbound" && turn.origin === "inbound" && recentSource
        && source.type === "text" && source.body.trim() && turn.attempts === 0 && !turn.firstSentAt
        && !turn.generationStartedAt && turn.nextMessageIndex === 0 && !turn.appointmentId
        && Array.isArray(turn.providerMessageIds) && turn.providerMessageIds.length === 0) {
        const [emptyEnvelope, escalation] = await Promise.all([
          tx.whatsAppMessage.findFirst({ where: { conversationId: params.conversationId, fromMe: false,
            status: { not: "deleted" }, type: "secretEncryptedMessage", body: "", timestamp: { gt: source.timestamp } }, select: { id: true } }),
          tx.leadMemory.findFirst({ where: { conversationId: params.conversationId, unidade: "SBC", escalarHumano: true }, select: { id: true } }),
        ]);
        if (!emptyEnvelope || escalation) return { queued: false, turnId: turn.id, reason: "not_resumable" };
        const resumed = await tx.$executeRaw`
          UPDATE "AliceAutonomousTurn" t SET status='queued',error=NULL,"completedAt"=NULL,"claimedAt"=NULL,
            "availableAt"=${aliceAutonomyAvailableAt(source.createdAt, now)},"messagesJson"=NULL,"updatedAt"=${now}
          WHERE t.id=${turn.id} AND t.status='skipped' AND t.error='new_customer_message' AND ${recentSource}
            AND t.origin='inbound' AND t.attempts=0 AND t."claimToken" IS NULL AND t."nextMessageIndex"=0
            AND t."firstSentAt" IS NULL AND t."generationStartedAt" IS NULL AND t."providerMessageIds"='[]'::jsonb
            AND t."appointmentId" IS NULL AND (t."messagesJson" IS NULL OR t."messagesJson"='null'::jsonb)
            AND t."sourceMessageId"=(SELECT id FROM "WhatsAppMessage" WHERE "conversationId"=t."conversationId"
              AND status<>'deleted' AND NOT (type='secretEncryptedMessage' AND btrim(body)='')
              ORDER BY timestamp DESC,id DESC LIMIT 1)
            AND EXISTS (SELECT 1 FROM "WhatsAppMessage" empty WHERE empty."conversationId"=t."conversationId"
              AND empty."fromMe"=FALSE AND empty.status<>'deleted' AND empty.type='secretEncryptedMessage'
              AND btrim(empty.body)='' AND empty.timestamp>${source.timestamp})
            AND NOT EXISTS (SELECT 1 FROM "AliceAutoSchedule" b WHERE b."conversationId"=t."conversationId" AND b."replyMessageId"=t."sourceMessageId")`;
        if (resumed === 1) return { queued: true, turnId: turn.id, reason: "queued" };
      }
      if (resumeBookingChoice) {
        const resumed = await tx.$executeRaw`
          UPDATE "AliceAutonomousTurn" t SET status='queued',error=NULL,"completedAt"=NULL,"claimedAt"=NULL,
            "availableAt"=${aliceAutonomyAvailableAt(source.createdAt, now)},"messagesJson"=NULL,"updatedAt"=${now}
          WHERE t.id=${turn.id} AND t.status IN ('needs_human','failed') AND t.error='booking_requires_review'
            AND ${recentSource} AND t.attempts<=1 AND t."claimToken" IS NULL
            AND t."nextMessageIndex"=0 AND t."firstSentAt" IS NULL AND t."generationStartedAt" IS NULL
            AND t."providerMessageIds"='[]'::jsonb AND t."appointmentId" IS NULL AND t."messagesJson" IS NULL
            AND t."sourceMessageId"=(SELECT id FROM "WhatsAppMessage" WHERE "conversationId"=t."conversationId"
              AND status<>'deleted' AND NOT (type='secretEncryptedMessage' AND btrim(body)='') ORDER BY timestamp DESC,id DESC LIMIT 1)
            AND NOT EXISTS (SELECT 1 FROM "AliceAutoSchedule" b WHERE b."conversationId"=t."conversationId" AND b."replyMessageId"=t."sourceMessageId")
            AND NOT EXISTS (SELECT 1 FROM "LeadMemory" m WHERE m."conversationId"=t."conversationId"
              AND m.unidade='SBC' AND m."escalarHumano")`;
        if (resumed === 1) return { queued: true, turnId: turn.id, reason: "queued" };
      }
      if (resumeSchedule && recentSource && source.type === "text" && source.body.trim() && turn.attempts <= 1) {
        const resumed = await tx.$executeRaw`
          UPDATE "AliceAutonomousTurn" t SET status='queued',error=NULL,"completedAt"=NULL,"claimedAt"=NULL,
            "availableAt"=${aliceAutonomyAvailableAt(source.createdAt, now, params.origin === "backlog")},"messagesJson"=NULL,"updatedAt"=${now}
          WHERE t.id=${turn.id} AND t.status IN ('needs_human','failed') AND t.error='schedule_option_expired_or_invalid' AND ${recentSource}
            AND t.attempts<=1
            AND t."claimToken" IS NULL AND t."nextMessageIndex"=0 AND t."firstSentAt" IS NULL
            AND t."generationStartedAt" IS NOT NULL AND t."providerMessageIds"='[]'::jsonb AND t."appointmentId" IS NULL
            AND t."sourceMessageId"=(SELECT id FROM "WhatsAppMessage" WHERE "conversationId"=t."conversationId"
              AND status<>'deleted' AND NOT (type='secretEncryptedMessage' AND btrim(body)='') ORDER BY timestamp DESC,id DESC LIMIT 1)
            AND NOT EXISTS (SELECT 1 FROM "AliceAutoSchedule" b WHERE b."conversationId"=t."conversationId" AND b."replyMessageId"=t."sourceMessageId")
            AND NOT EXISTS (SELECT 1 FROM "LeadMemory" m WHERE m."conversationId"=t."conversationId"
              AND m.unidade='SBC' AND m."escalarHumano")`;
        if (resumed === 1) return { queued: true, turnId: turn.id, reason: "queued" };
      }
      if (resumeClinicalFear && recentSource && source.type === "text" && source.body.trim()
        && turn.attempts <= 1 && !turn.firstSentAt && !turn.generationStartedAt && turn.nextMessageIndex === 0
        && !turn.appointmentId && Array.isArray(turn.providerMessageIds) && turn.providerMessageIds.length === 0) {
        const activeEscalation = await tx.leadMemory.findFirst({ where: { conversationId: params.conversationId,
          unidade: "SBC", escalarHumano: true }, select: { id: true } });
        if (activeEscalation) return { queued: false, turnId: turn.id, reason: "clinical_safety" };
        const resumed = await tx.$executeRaw`
          UPDATE "AliceAutonomousTurn" t SET status='queued',error=NULL,"completedAt"=NULL,"claimedAt"=NULL,
            "availableAt"=${aliceAutonomyAvailableAt(source.createdAt, now, params.origin === "backlog")},"messagesJson"=NULL,"updatedAt"=${now}
          WHERE t.id=${turn.id} AND t.status IN ('needs_human','failed') AND t.error='clinical_safety'
            AND t.attempts<=1 AND t."claimToken" IS NULL AND t."nextMessageIndex"=0 AND t."firstSentAt" IS NULL
            AND t."generationStartedAt" IS NULL AND t."providerMessageIds"='[]'::jsonb AND t."appointmentId" IS NULL
            AND t."messagesJson" IS NULL
            AND t."sourceMessageId"=(SELECT id FROM "WhatsAppMessage" WHERE "conversationId"=t."conversationId"
              AND status<>'deleted' AND NOT (type='secretEncryptedMessage' AND btrim(body)='') ORDER BY timestamp DESC,id DESC LIMIT 1)
            AND NOT EXISTS (SELECT 1 FROM "AliceAutoSchedule" b WHERE b."conversationId"=t."conversationId" AND b."replyMessageId"=t."sourceMessageId")
            AND NOT EXISTS (SELECT 1 FROM "LeadMemory" m WHERE m."conversationId"=t."conversationId"
              AND m.unidade='SBC' AND m."escalarHumano")`;
        if (resumed === 1) return { queued: true, turnId: turn.id, reason: "queued" };
      }
      if (resumeSoftFailure && ["inbound", "backlog"].includes(params.origin) && recentSource && source.type === "text" && source.body.trim()
        && turn.attempts <= resumeAttemptLimit && !turn.firstSentAt && !turn.appointmentId && turn.nextMessageIndex === 0
        && turn.generationStartedAt && Array.isArray(turn.providerMessageIds) && turn.providerMessageIds.length === 0) {
        const [contact, memory] = await Promise.all([
          tx.whatsAppConversation.findFirst({ where: { id: params.conversationId, instanceId: params.instanceId },
            select: { contact: { select: { phone: true } } } }),
          tx.leadMemory.findFirst({ where: { conversationId: params.conversationId, unidade: "SBC", escalarHumano: true }, select: { id: true } }),
        ]);
        const phone = contact?.contact.phone;
        const scope = { conversationId: params.conversationId, instanceId: params.instanceId, unidade: "SBC" as const };
        if (!memory && phone && (phoneLookupKey(phone)?.length || 0) >= 10 && !(await currentAliceAppointment(scope, phone, tx))) {
          const resumed = await tx.$executeRaw`
            UPDATE "AliceAutonomousTurn" t SET status='queued',error=NULL,"completedAt"=NULL,"claimedAt"=NULL,
              "availableAt"=${aliceAutonomyAvailableAt(source.createdAt, now, params.origin === "backlog")},"messagesJson"=NULL,"updatedAt"=${now}
            WHERE t.id=${turn.id} AND t.status IN ('needs_human','failed') AND t.error=${turn.error}
              AND t.attempts<=${resumeAttemptLimit} AND t."claimToken" IS NULL AND t."nextMessageIndex"=0 AND t."firstSentAt" IS NULL
              AND t."generationStartedAt" IS NOT NULL AND t."providerMessageIds"='[]'::jsonb AND t."appointmentId" IS NULL
              AND t."sourceMessageId"=(SELECT id FROM "WhatsAppMessage" WHERE "conversationId"=t."conversationId"
                AND status<>'deleted' AND NOT (type='secretEncryptedMessage' AND btrim(body)='') ORDER BY timestamp DESC,id DESC LIMIT 1)
              AND NOT EXISTS (SELECT 1 FROM "AliceAutoSchedule" b WHERE b."conversationId"=t."conversationId" AND b."replyMessageId"=t."sourceMessageId")`;
          if (resumed === 1) return { queued: true, turnId: turn.id, reason: "queued" };
        }
      }
      if (resumePrice) {
        const contact = await tx.whatsAppConversation.findFirst({ where: { id: params.conversationId, instanceId: params.instanceId },
          select: { contact: { select: { phone: true } } } });
        const phone = contact?.contact.phone;
        const scope = { conversationId: params.conversationId, instanceId: params.instanceId, unidade: "SBC" as const };
        if (!phone || (phoneLookupKey(phone)?.length || 0) < 10 || await currentAliceAppointment(scope, phone, tx)) {
          return { queued: false, turnId: turn.id, reason: "booking_not_excluded" };
        }
      }
      // Reutiliza a linha única da fonte, nunca uma remessa incerta. O bloqueio de preço
      // pode vir depois de uma geração paga, mas deve ter ocorrido antes da primeira saída.
      const resumed = await tx.$executeRaw`
        UPDATE "AliceAutonomousTurn" t SET status='queued',error=NULL,"completedAt"=NULL,"claimedAt"=NULL,
          "availableAt"=${aliceAutonomyAvailableAt(source.createdAt, now, true)},"updatedAt"=${now}
        WHERE t.id=${turn.id} AND t.status='needs_human' AND t.error=${turn.error}
          AND t."claimToken" IS NULL AND t."nextMessageIndex"=0 AND t."firstSentAt" IS NULL AND t."appointmentId" IS NULL
          AND (t."generationStartedAt" IS NULL OR t.error='price_after_booking') AND t."providerMessageIds"='[]'::jsonb
          ${resumePrice ? Prisma.sql`AND NOT EXISTS (SELECT 1 FROM "LeadMemory" m WHERE m."conversationId"=t."conversationId"
            AND m.unidade='SBC' AND m."escalarHumano")` : Prisma.empty}
          AND NOT EXISTS (SELECT 1 FROM "AliceAutoSchedule" b WHERE b."conversationId"=t."conversationId" AND b."replyMessageId"=t."sourceMessageId")
          AND t."sourceMessageId"=(SELECT id FROM "WhatsAppMessage" WHERE "conversationId"=t."conversationId"
            AND status<>'deleted' AND NOT (type='secretEncryptedMessage' AND btrim(body)='') ORDER BY timestamp DESC,id DESC LIMIT 1)`;
      if (resumed === 1) return { queued: true, turnId: turn.id, reason: "queued" };
    }
    return { queued: turn.status === "queued", turnId: turn.id, reason: turn.status };
}

export async function claimAliceAutonomousTurn(database = prisma, turnId?: string) {
  const token = randomUUID();
  return database.$transaction(async (tx) => {
    const gate = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT id FROM "AppSetting" WHERE key=${ALICE_AUTONOMY_CONFIG_KEY} FOR UPDATE SKIP LOCKED`);
    if (!gate.length) return null;
    // Uma instrução nova após o lock renova o snapshot antes de conferir a lease global.
    const rows = await tx.$queryRaw<import("@prisma/client").AliceAutonomousTurn[]>(Prisma.sql`
    WITH candidate AS (
      SELECT q.id FROM "AliceAutonomousTurn" q
      WHERE q.status = 'queued' AND q."availableAt" <= NOW() AND q."instanceId" = ${ALICE_AUTONOMY_INSTANCE_ID}
        ${turnId ? Prisma.sql`AND q.id=${turnId} AND q."nextMessageIndex">0` : Prisma.empty}
        AND NOT EXISTS (SELECT 1 FROM "AliceAutonomousTurn" busy WHERE busy."instanceId"=${ALICE_AUTONOMY_INSTANCE_ID}
          AND busy.status IN ('processing','sending') AND busy."claimedAt">=NOW()-interval '2 minutes')
      ORDER BY CASE WHEN q."nextMessageIndex">0 THEN 0 WHEN q.origin='inbound' THEN 1 ELSE 2 END,
        q."availableAt", q."createdAt", q.id FOR UPDATE SKIP LOCKED LIMIT 1
    ) UPDATE "AliceAutonomousTurn" q
    SET status='processing', "claimToken"=${token}, "claimedAt"=NOW(), "startedAt"=COALESCE(q."startedAt",NOW()), attempts=q.attempts+1, "updatedAt"=NOW()
    FROM candidate WHERE q.id=candidate.id RETURNING q.*`);
    return rows[0] ? { turn: rows[0], token } : null;
  });
}

export async function recoverAliceAutonomousTurns(database = prisma, now = new Date()) {
  const stale = new Date(now.getTime() - ALICE_AUTONOMY_LEASE_MS);
  return database.$transaction(async (tx) => {
    const interrupted = await tx.aliceAutonomousTurn.findMany({
      where: { instanceId: ALICE_AUTONOMY_INSTANCE_ID, status: { in: ["processing", "sending"] }, claimedAt: { lt: stale } },
      select: { id: true, conversationId: true }, take: 25,
    });
    if (!interrupted.length) return { uncertain: 0, failed: 0 };
    const ids = interrupted.map((item) => item.id);
    const recovered = await tx.$queryRaw<{ id: string; conversationId: string; status: string }[]>(Prisma.sql`
      UPDATE "AliceAutonomousTurn" turn SET
        status=CASE WHEN ledger.state='submitted' THEN 'sent' WHEN ledger.id IS NOT NULL OR turn.status='sending' THEN 'uncertain' ELSE 'failed' END,
        "appointmentId"=COALESCE(ledger."appointmentId",turn."appointmentId"),
        "firstSentAt"=CASE WHEN ledger.state='submitted' THEN COALESCE(turn."firstSentAt",ledger."updatedAt") ELSE turn."firstSentAt" END,
        "completedAt"=${now},"updatedAt"=${now},"claimToken"=NULL,
        "messagesJson"=CASE WHEN ledger.id IS NOT NULL AND ledger.state<>'submitted' OR turn.status='sending' THEN turn."messagesJson" ELSE NULL END,
        error=CASE WHEN ledger.state='submitted' THEN NULL WHEN ledger.id IS NOT NULL THEN 'booking_confirmation_interrupted_no_retry'
          WHEN turn.status='sending' THEN 'send_interrupted_no_retry' ELSE 'worker_interrupted_no_retry' END
      FROM (SELECT job.id,booking.id AS "bookingId",booking.state,booking."appointmentId",booking."updatedAt" FROM "AliceAutonomousTurn" job
        LEFT JOIN "AliceAutoSchedule" booking ON booking."conversationId"=job."conversationId" AND booking."replyMessageId"=job."sourceMessageId"
        WHERE job.id IN (${Prisma.join(ids)})) snapshot
      LEFT JOIN "AliceAutoSchedule" ledger ON ledger.id=snapshot."bookingId"
      WHERE turn.id=snapshot.id AND turn.status IN ('processing','sending') AND turn."claimedAt"<${stale}
      RETURNING turn.id,turn."conversationId",turn.status`);
    await markCompletedAliceRepliesRead(tx, recovered.filter((turn) => turn.status === "sent").map((turn) => turn.id));
    const unhealthy = recovered.filter((item) => item.status !== "sent");
    if (unhealthy.length) await tx.$queryRaw(Prisma.sql`
      UPDATE "AliceAudioTranscript" SET status='failed',error='audio_interrupted_no_retry',"completedAt"=${now}
      WHERE "instanceId"=${ALICE_AUTONOMY_INSTANCE_ID} AND status='processing' AND "createdAt"<${stale}
        AND "conversationId" IN (${Prisma.join(unhealthy.map((item) => item.conversationId))}) RETURNING "messageId"`);
    if (unhealthy.length) await tx.whatsAppConversation.updateMany({
      where: { id: { in: unhealthy.map((item) => item.conversationId) }, instanceId: ALICE_AUTONOMY_INSTANCE_ID, aiMode: "agent" },
      data: { aiMode: "manual", aiModeUpdatedAt: now, aiModeUpdatedBy: "alice-interrupted" },
    });
    return { uncertain: recovered.filter((item) => item.status === "uncertain").length, failed: recovered.filter((item) => item.status === "failed").length };
  });
}
