import { Prisma } from "@prisma/client";

// Uma busca indexada por conversa dentro de UMA consulta, sem histórico ilimitado.
export function latestDispatchesQuery(conversationIds: string[]) {
  if (!conversationIds.length) throw new Error("Informe as conversas já autorizadas");
  return Prisma.sql`
    SELECT message.* FROM unnest(ARRAY[${Prisma.join([...new Set(conversationIds)])}]::text[]) AS scope(id)
    CROSS JOIN LATERAL (
      SELECT "id", "conversationId", "dispatchMetadata", "timestamp", "respondedByName", "status", "fromMe"
      FROM "WhatsAppMessage"
      WHERE "conversationId" = scope.id AND "dispatchMetadata" IS NOT NULL AND "fromMe" = true
      ORDER BY "timestamp" DESC, "id" DESC LIMIT 1
    ) message
  `;
}
