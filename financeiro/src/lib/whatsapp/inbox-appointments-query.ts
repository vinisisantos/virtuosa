import { Prisma } from "@prisma/client";
import {
  ACTIVE_INBOX_APPOINTMENT_STATUSES,
  type InboxAppointmentSnapshot,
} from "#lib/whatsapp/inbox-appointments";

export function inboxAppointmentsQuery(
  instanceIds: string[],
  requestedUnit?: string | null,
  allowedUnits = ["SCS", "SBC", "Osasco"],
) {
  // Um snapshot por caixa autorizada também atualiza cards paginados quando
  // só a agenda mudou, sem depender do updatedAt da conversa ou de nova mensagem.
  return Prisma.sql`
    WITH phones AS (
      SELECT 'appointment' AS kind, a.id, a.unit, a."startTime",
        regexp_replace(a."clientPhone", '[^0-9]', '', 'g') AS digits
      FROM "Agendamento" a
      WHERE a.unit IN ('SCS', 'SBC', 'Osasco')
        AND a.unit IN (${Prisma.join(allowedUnits.length ? allowedUnits : [""])})
        AND a.procedimento ILIKE '%avalia%'
        AND lower(trim(a.status)) IN (${Prisma.join(ACTIVE_INBOX_APPOINTMENT_STATUSES)})
      UNION ALL
      SELECT 'conversation', c.id,
        CASE WHEN i.unit = 'Todas' THEN COALESCE(${requestedUnit || null}, NULLIF(t.unit, 'Todas')) ELSE i.unit END,
        NULL::timestamp, regexp_replace(t.phone, '[^0-9]', '', 'g')
      FROM "WhatsAppConversation" c
      JOIN "WhatsAppInstance" i ON i.id = c."instanceId"
      JOIN "WhatsAppContact" t ON t.id = c."contactId"
      WHERE c."instanceId" IN (${Prisma.join(instanceIds.length ? instanceIds : [""])})
        AND t.phone NOT LIKE '%@lid' AND t.phone NOT LIKE '%@hosted.lid'
    ), national AS (
      SELECT *, CASE WHEN length(digits) IN (12,13) AND left(digits,2) = '55'
        THEN substr(digits,3) ELSE digits END AS number FROM phones
    ), keyed AS (
      SELECT *, CASE WHEN length(number) = 11 AND substr(number,3,1) = '9'
          THEN left(number,2) || right(number,8)
        WHEN length(number) = 10 THEN number ELSE NULL END AS phone_key
      FROM national
    )
    SELECT DISTINCT ON (c.id) c.id AS "conversationId", a.id, a.unit, a."startTime"
    FROM keyed c JOIN keyed a ON a.kind = 'appointment' AND a.unit = c.unit AND a.phone_key = c.phone_key
    WHERE c.kind = 'conversation' AND c.phone_key IS NOT NULL
    ORDER BY c.id, a."startTime" DESC, a.id`;
}

export function inboxAppointmentSnapshot(
  rows: Array<{ conversationId: string; id: string; unit: string; startTime: Date }>,
): InboxAppointmentSnapshot {
  return Object.fromEntries(rows.map(({ conversationId, ...appointment }) => [
    conversationId, { ...appointment, startTime: appointment.startTime.toISOString() },
  ]));
}
