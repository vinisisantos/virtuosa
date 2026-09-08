import { Prisma } from "@prisma/client";
import { normalizedPhoneKeySql } from "@/lib/whatsapp/phone-sql";
import { CAMPAIGN_WELCOME_TRIGGER, WELCOME_LIBRARY_USER_ID, WELCOME_SCHEDULER_KEY } from "@/lib/whatsapp/campaign-welcome-policy";

export function welcomeReceptionQuery(input: { conversationId: string; clientId: string; instanceId: string; unit: string; messageId: string; timestamp: Date }) {
  return Prisma.sql`
    SELECT a.id, a."isActive"
    FROM "Automation" a
    JOIN "AppSetting" s ON s.key = ${WELCOME_SCHEDULER_KEY}
    JOIN "WhatsAppConversation" c ON c.id = ${input.conversationId} AND c."instanceId" = ${input.instanceId}
    JOIN "Client" lead ON lead.id = ${input.clientId} AND lead.unit = ${input.unit}
    WHERE a.id = ${`${CAMPAIGN_WELCOME_TRIGGER}:${input.unit}`} AND a.unit = ${input.unit}
      AND a."triggerType" = ${CAMPAIGN_WELCOME_TRIGGER}
      AND (s.value::jsonb->>'readyAt') IS NOT NULL
      AND c."createdAt" >= (s.value::jsonb->>'readyAt')::timestamp
      AND lead."arrivedAt" >= (s.value::jsonb->>'readyAt')::timestamp
      AND ${input.timestamp}::timestamp >= (s.value::jsonb->>'readyAt')::timestamp
      AND NOT EXISTS (SELECT 1 FROM "WhatsAppMessage" m WHERE m."conversationId" = c.id AND m."messageId" <> ${input.messageId})
    LIMIT 1`;
}

export function claimWelcomeQuery(token: string, now: Date, onlyIds?: string[]) {
  return Prisma.sql`
    UPDATE "WhatsAppWelcomeJob" j SET status = 'processing', "claimToken" = ${token}, "claimedAt" = ${now}, "updatedAt" = ${now}
    WHERE j.id = (SELECT id FROM "WhatsAppWelcomeJob" WHERE status = 'pending' AND "dueAt" <= ${now}
      ${onlyIds ? Prisma.sql`AND id IN (${Prisma.join(onlyIds)})` : Prisma.empty}
      ORDER BY "dueAt", id LIMIT 1 FOR UPDATE SKIP LOCKED)
    RETURNING j.*`;
}

export function welcomeContextQuery(id: string) {
  return Prisma.sql`
    SELECT j.*, a."isActive" AS "enabled", a."triggerConfig", a."updatedAt" AS "currentConfigUpdatedAt",
      lead."campaignName", lead.unit AS "clientUnit", lead."isActive" AS "clientActive",
      c."blockedAt", c."archivedAt", c."closedAt", c.status AS "conversationStatus", c."lastKnownJid",
      contact.phone AS "currentPhone", i.name AS "instanceName", i.provider, i.status AS "instanceStatus",
      reply."userId" AS "currentReplyUserId", category."userId" AS "currentCategoryUserId",
      category.title AS "currentCategoryTitle", category."campaignName" AS "currentCategoryCampaign",
      i.unit AS "instanceUnit", i."capturesLeads",
      EXISTS(SELECT 1 FROM "WhatsAppMessage" m WHERE m."conversationId" = c.id AND m."fromMe"
        AND m.status NOT IN ('failed', 'error', 'deleted')
        AND (j."greetingMessageId" IS NULL OR m."messageId" <> j."greetingMessageId")) AS "hasOtherOutbound",
      EXISTS(SELECT 1 FROM "WhatsAppMessage" m WHERE m."conversationId" = c.id AND NOT m."fromMe"
        AND j."greetingSentAt" IS NOT NULL AND (m.timestamp >= j."greetingSentAt" OR m."createdAt" >= j."greetingSentAt")) AS "hasReply",
      EXISTS(SELECT 1 FROM "SalesPipeline" d WHERE d."clientId" = lead.id AND d.unit = j.unit
        AND (d.stage <> 'novo_lead' OR d."lostReason" IS NOT NULL OR d."closedAt" IS NOT NULL)) AS "leftInitialStage",
      EXISTS(SELECT 1 FROM "Agendamento" ap WHERE ap.unit = j.unit AND ap.status NOT IN ('cancelado', 'nao_compareceu')
        AND ap."startTime" > j."createdAt"
        AND ${normalizedPhoneKeySql(Prisma.sql`ap."clientPhone"`)} = ${normalizedPhoneKeySql(Prisma.sql`contact.phone`)} ) AS "hasAppointment"
    FROM "WhatsAppWelcomeJob" j
    JOIN "Automation" a ON a.id = j."automationId"
    JOIN "WhatsAppConversation" c ON c.id = j."conversationId" AND c."instanceId" = j."instanceId"
    JOIN "WhatsAppInstance" i ON i.id = j."instanceId"
    JOIN "WhatsAppContact" contact ON contact.id = c."contactId"
    JOIN "Client" lead ON lead.id = j."clientId"
    LEFT JOIN "WhatsAppSavedReply" reply ON reply.id = j."replyId"
    LEFT JOIN "WhatsAppSavedReplyCategory" category ON category.id = reply."categoryId"
    WHERE j.id = ${id}`;
}

export function finishWelcomeQuery(id: string, token: string, status: string, reason: string | null, receipt?: { messageId: string; sentAt: Date }) {
  return Prisma.sql`
    WITH finished AS (
      UPDATE "WhatsAppWelcomeJob" SET status = ${status}, reason = ${reason}, "updatedAt" = now(),
        "questionMessageId" = coalesce(${receipt?.messageId ?? null}, "questionMessageId"),
        "questionSentAt" = coalesce(${receipt?.sentAt ?? null}::timestamp, "questionSentAt")
      WHERE id = ${id} AND "claimToken" = ${token} AND status IN ('processing', 'sending') RETURNING *
    ), audit AS (
      INSERT INTO "AutomationLog" (id, "automationId", "contactPhone", "triggerData", result, error, "executedAt")
      SELECT 'welcome:' || id, "automationId", "contactPhone", jsonb_build_object(
        'conversationId', "conversationId", 'unit', unit, 'instanceId', "instanceId", 'campaignKey', "campaignKey",
        'replyId', "replyId", 'greetingMessageId', "greetingMessageId", 'questionMessageId', "questionMessageId",
        'libraryUserId', ${WELCOME_LIBRARY_USER_ID}::text, 'reason', reason), status, reason, now()
      FROM finished ON CONFLICT (id) DO NOTHING RETURNING "automationId"
    )
    UPDATE "Automation" SET "executionCount" = "executionCount" + 1, "lastExecutedAt" = now()
    WHERE id IN (SELECT "automationId" FROM audit)`;
}
