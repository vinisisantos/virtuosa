import { Prisma } from "@prisma/client";
import { ALICE_AUTONOMY_INSTANCE_ID } from "@/lib/ai-assistant/autonomy/policy";

export type AliceBacklogRow = {
  conversationId: string; contactName: string | null; phoneLast4: string | null; unreadCount: number;
  sourceMessageId: string; lastInboundAt: Date; receivedAt: Date;
};

function phoneKey(column: Prisma.Sql) {
  const digits = Prisma.sql`regexp_replace(COALESCE(${column},''),'[^0-9]','','g')`;
  return Prisma.sql`RIGHT(CASE WHEN ${digits} LIKE '55%' AND LENGTH(${digits})>11 THEN SUBSTRING(${digits} FROM 3) ELSE ${digits} END,11)`;
}

export function aliceBacklogQuery(params: { allowManualBefore: Date; cutoff: Date; from?: Date; anchorId?: string; boundaryId?: string; limit?: number; lock?: boolean }) {
  return Prisma.sql`
    WITH booked AS MATERIALIZED (
      SELECT ${phoneKey(Prisma.sql`appointment."clientPhone"`)} AS phone FROM "Agendamento" appointment
      WHERE appointment.unit='SBC' AND appointment."startTime">=${params.cutoff} AND appointment.procedimento ILIKE '%avalia%'
        AND appointment.status NOT IN ('cancelado','cancelada','desmarcou','desmarcado')
      UNION
      SELECT ${phoneKey(Prisma.sql`client.phone`)} FROM "Client" client JOIN "SalesPipeline" deal ON deal."clientId"=client.id
      WHERE client.unit='SBC' AND deal.unit='SBC' AND deal.stage='agendado'
    )
    SELECT c.id AS "conversationId", contact.name AS "contactName", RIGHT(regexp_replace(contact.phone, '[^0-9]', '', 'g'), 4) AS "phoneLast4",
      c."unreadCount", incoming.id AS "sourceMessageId", incoming.timestamp AS "lastInboundAt", incoming."createdAt" AS "receivedAt"
    FROM "WhatsAppConversation" c
    JOIN "WhatsAppInstance" instance ON instance.id=c."instanceId" AND instance.unit='SBC'
    JOIN "WhatsAppContact" contact ON contact.id=c."contactId"
    JOIN LATERAL (
      SELECT m.id, m.timestamp, m."createdAt" FROM "WhatsAppMessage" m
      WHERE m."conversationId"=c.id AND m."fromMe"=false AND m.status<>'deleted'
      ORDER BY m.timestamp DESC, m.id DESC LIMIT 1
    ) incoming ON true
    WHERE c."instanceId"=${ALICE_AUTONOMY_INSTANCE_ID} AND c."unreadCount">0
      AND c."blockedAt" IS NULL AND c."archivedAt" IS NULL AND c."commercialPaused"=false
      AND c.status NOT IN ('closed','resolved','lost')
      AND (c."aiModeUpdatedAt" IS NULL OR c."aiModeUpdatedAt"<=${params.allowManualBefore} OR c."aiMode"='agent' OR c."aiModeUpdatedBy"='alice-global-pause')
      AND incoming.timestamp<=${params.cutoff} AND incoming."createdAt"<=${params.cutoff}
      ${params.from ? Prisma.sql`AND incoming.timestamp>=${params.from}` : Prisma.empty}
      ${params.from && params.boundaryId ? Prisma.sql`AND (incoming.timestamp,c.id)>=(${params.from},${params.boundaryId})` : Prisma.empty}
      ${params.anchorId ? Prisma.sql`AND c.id=${params.anchorId}` : Prisma.empty}
      AND NOT EXISTS (SELECT 1 FROM "PipelineCommercialHold" hold WHERE hold."conversationId"=c.id)
      AND NOT EXISTS (SELECT 1 FROM booked WHERE booked.phone<>'' AND booked.phone=${phoneKey(Prisma.sql`contact.phone`)})
      AND NOT EXISTS (SELECT 1 FROM "WhatsAppMessage" outgoing WHERE outgoing."conversationId"=c.id AND outgoing."fromMe"=true
        AND outgoing.status<>'deleted' AND outgoing."respondedByName" IS DISTINCT FROM 'Automação de recepção'
        AND (outgoing.timestamp,outgoing.id)>(incoming.timestamp,incoming.id))
    ORDER BY incoming.timestamp ASC, c.id ASC LIMIT ${Math.min(201, params.limit || 201)} ${params.lock ? Prisma.sql`FOR UPDATE OF c` : Prisma.empty}`;
}

export function aliceAutonomySummaryQuery(since: Date) {
  return Prisma.sql`SELECT
    COUNT(DISTINCT t."conversationId")::int AS conversations,
    COUNT(*) FILTER (WHERE t.status IN ('queued','processing','sending'))::int AS queued,
    COUNT(*) FILTER (WHERE t.status='sent')::int AS sent,
    COUNT(*) FILTER (WHERE t.status='uncertain')::int AS uncertain,
    COUNT(*) FILTER (WHERE t.status='failed')::int AS failed,
    COUNT(*) FILTER (WHERE t.status='needs_human')::int AS "needsHuman",
    COUNT(DISTINCT t."appointmentId")::int AS appointments,
    COALESCE(SUM(t."inputTokens"),0)::float8 AS "inputTokens",
    COALESCE(SUM(t."outputTokens"),0)::float8 AS "outputTokens",
    COALESCE(SUM(t."cacheReadInputTokens"),0)::float8 AS "cacheReadInputTokens",
    COALESCE(SUM(t."cacheCreationInputTokens"),0)::float8 AS "cacheCreationInputTokens",
    COALESCE(SUM(t."costMicroUsd"),0)::float8 AS "costMicroUsd",
    COUNT(*) FILTER (WHERE t."generationStartedAt" IS NOT NULL AND t."usageRecorded"=false)::int AS "unknownCostTurns",
    COUNT(*) FILTER (WHERE t.origin='backlog')::int AS "backlogTurns",
    COALESCE(AVG(t."generationMs") FILTER (WHERE t."usageRecorded"=true),0)::float8 AS "averageGenerationMs",
    COALESCE(AVG(EXTRACT(EPOCH FROM (t."firstSentAt"-source."createdAt"))*1000)
      FILTER (WHERE t.origin='inbound' AND t."firstSentAt">=source."createdAt"),0)::float8 AS "averageResponseMs",
    COALESCE(AVG(EXTRACT(EPOCH FROM (t."firstSentAt"-t."createdAt"))*1000)
      FILTER (WHERE t.origin='backlog' AND t."firstSentAt">=t."createdAt"),0)::float8 AS "averageBacklogResponseMs"
    FROM "AliceAutonomousTurn" t LEFT JOIN "WhatsAppMessage" source ON source.id=t."sourceMessageId" AND source."conversationId"=t."conversationId"
    WHERE t.unit='SBC' AND t."instanceId"=${ALICE_AUTONOMY_INSTANCE_ID} AND t."createdAt">=${since}`;
}
