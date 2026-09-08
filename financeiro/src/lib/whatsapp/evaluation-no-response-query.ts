import { Prisma } from "@prisma/client";
import { EVALUATION_CONFIRMATION_REQUEST_AUTOMATION_TRIGGER } from "@/lib/whatsapp/evaluation-schedule-confirmation-message";
import { EVALUATION_NO_RESPONSE_TRIGGER } from "@/lib/whatsapp/evaluation-no-response-policy";

export type NoResponseScope = {
  id: string; unit: string; instanceId: string; delayHours: number;
  updatedAt: Date;
};

export type NoResponseCandidate = {
  sourceLogId: string; automationId: string; appointmentId: string; startTime: Date;
  clientName: string; clientPhone: string; contactPhone: string; conversationId: string;
  instanceId: string; instanceName: string; provider: string; lastKnownJid: string | null;
  unit: string; sentAt: Date;
  confirmationMessageId: string; confirmationReference: "message_id" | "legacy_audit";
  confirmationBody: string; confirmationSteps: unknown;
};

function phoneKeySql(column: Prisma.Sql) {
  const digits = Prisma.sql`regexp_replace(${column}, '[^0-9]', '', 'g')`;
  return Prisma.sql`right(CASE WHEN length(${digits}) > 11 AND left(${digits}, 2) = '55'
    THEN substring(${digits} from 3) ELSE ${digits} END, 11)`;
}

export function noResponseCandidatesQuery(scopes: NoResponseScope[], now: Date, conversationId: string, revalidate?: { sourceLogId: string; claimId: string }) {
  if (!scopes.length) throw new Error("Nenhuma unidade habilitada.");
  if (!conversationId) throw new Error("Selecione a conversa para enviar o lembrete.");
  const values = scopes.map((scope) => Prisma.sql`(${scope.id}, ${scope.unit}, ${scope.instanceId}, ${scope.delayHours}::int, ${scope.updatedAt}::timestamp)`);
  return Prisma.sql`
    WITH scopes(id, unit, instance_id, delay_hours, updated_at) AS (VALUES ${Prisma.join(values)})
    SELECT source.id AS "sourceLogId", target.id AS "automationId", a.id AS "appointmentId",
      a."startTime", a."clientName", a."clientPhone", contact.phone AS "contactPhone",
      c.id AS "conversationId", i.id AS "instanceId", i.name AS "instanceName", i.provider,
      c."lastKnownJid", a.unit, sent.timestamp AS "sentAt",
      sent."messageId" AS "confirmationMessageId", sent.reference AS "confirmationReference",
      sent.body AS "confirmationBody", request.steps AS "confirmationSteps"
    FROM scopes s
    JOIN "Automation" target ON target.id = s.id AND target."isActive" = true
      AND target."triggerType" = ${EVALUATION_NO_RESPONSE_TRIGGER} AND target.unit = s.unit
      AND target."updatedAt" = s.updated_at
    JOIN "Automation" request ON request.unit = s.unit
      AND request."triggerType" = ${EVALUATION_CONFIRMATION_REQUEST_AUTOMATION_TRIGGER}
    JOIN "AutomationLog" source ON source."automationId" = request.id AND source.result = 'success'
      AND source."executedAt" >= ${new Date(now.getTime() - 8 * 86400000)}::timestamp
      AND source."triggerData"->>'action' = ${EVALUATION_CONFIRMATION_REQUEST_AUTOMATION_TRIGGER}
      AND source."triggerData"->>'unit' = s.unit
      AND source."triggerData"->>'instanceId' = s.instance_id
    JOIN "WhatsAppConversation" c ON c.id = source."triggerData"->>'conversationId' AND c.id = ${conversationId}
      AND c."instanceId" = s.instance_id AND c."blockedAt" IS NULL AND c."archivedAt" IS NULL
      AND c.status NOT IN ('closed', 'resolved', 'lost')
    JOIN "WhatsAppInstance" i ON i.id = c."instanceId" AND i.unit = s.unit AND i.status = 'connected'
    JOIN "WhatsAppContact" contact ON contact.id = c."contactId"
    JOIN LATERAL (
      SELECT m."messageId", m.timestamp, m.body, 'message_id' AS reference
      FROM "WhatsAppMessage" m
      WHERE m."conversationId" = c.id AND m."messageId" = source."triggerData"->>'confirmationMessageId'
        AND m."fromMe" = true AND m.status NOT IN ('failed', 'error', 'deleted')
      UNION ALL
      SELECT legacy."messageId", legacy.timestamp, legacy.body, 'legacy_audit' AS reference
      FROM (
        -- Envios antigos não gravavam o ID. A janela acompanha o limite da reserva de envio;
        -- só uma mensagem da automação pode existir nela, e o serviço ainda confere o texto integral.
        SELECT m."messageId", m.timestamp, m.body, m.status, m.type, count(*) OVER () AS matches
        FROM "WhatsAppMessage" m
        WHERE source."triggerData"->>'confirmationMessageId' IS NULL
          AND source."triggerData"->>'source' = 'manual'
          AND m."conversationId" = c.id AND m."fromMe" = true
          AND m."respondedByName" = 'Automação de agenda'
          AND m.timestamp BETWEEN source."executedAt" AND source."executedAt" + interval '2 minutes'
          AND m."createdAt" BETWEEN source."executedAt" AND source."executedAt" + interval '2 minutes'
      ) legacy
      WHERE legacy.matches = 1 AND legacy.type = 'text'
        AND legacy.status NOT IN ('failed', 'error', 'deleted')
    ) sent ON true
    JOIN "Agendamento" a ON a.id = source."triggerData"->>'appointmentId' AND a.unit = s.unit
      AND a.status IN ('pendente', 'nao_confirmou') AND a.procedimento ILIKE '%avalia%'
      AND a."startTime" > ${now}::timestamp
      AND to_char(a."startTime", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') = source."triggerData"->>'startTime'
    JOIN "SalesPipeline" deal ON deal.id = substring(a.notes from '[[]pipelineDealId:([^]]+)[]]')
      AND deal.unit = a.unit AND deal.stage = 'agendado'
    WHERE sent.timestamp + s.delay_hours * interval '1 hour' <= ${now}::timestamp
      AND (c."lastInboundAt" IS NULL OR c."lastInboundAt" < source."executedAt")
      AND ${phoneKeySql(Prisma.sql`a."clientPhone"`)} = ${phoneKeySql(Prisma.sql`contact.phone`)}
      AND NOT EXISTS (
        SELECT 1 FROM "WhatsAppMessage" inbound WHERE inbound."conversationId" = c.id AND inbound."fromMe" = false
          AND (inbound.timestamp >= source."executedAt" OR inbound."createdAt" >= source."executedAt")
      )
      AND NOT EXISTS (
        SELECT 1 FROM "AutomationLog" attempt
        WHERE attempt.id = ${EVALUATION_NO_RESPONSE_TRIGGER} || ':' || a.id || ':' || (source."triggerData"->>'startTime')
          ${revalidate ? Prisma.sql`AND attempt.id <> ${revalidate.claimId}` : Prisma.empty}
      )
      ${revalidate ? Prisma.sql`AND source.id = ${revalidate.sourceLogId}` : Prisma.empty}
    ORDER BY sent.timestamp ASC, source.id ASC
    LIMIT 1
  `;
}
