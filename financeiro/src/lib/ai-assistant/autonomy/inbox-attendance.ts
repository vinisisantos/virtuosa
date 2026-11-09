import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ALICE_AUTONOMY_INSTANCE_ID } from "@/lib/ai-assistant/autonomy/policy";

export async function aliceAttendingConversationIds(
  conversations: { id: string; instanceId: string; aiMode?: string }[],
  database: Pick<typeof prisma, "$queryRaw"> = prisma,
) {
  const ids = conversations.filter((item) => item.instanceId === ALICE_AUTONOMY_INSTANCE_ID && item.aiMode === "agent")
    .map((item) => item.id);
  if (!ids.length) return new Set<string>();
  // A lease/enrollment, sozinha, não comprova atendimento. Usar apenas saída
  // aceita nesta ativação, sem transformar a Alice em usuária com permissões.
  const rows = await database.$queryRaw<{ conversationId: string }[]>(Prisma.sql`
    SELECT conversation.id AS "conversationId" FROM "WhatsAppConversation" conversation
    WHERE conversation.id IN (${Prisma.join(ids)}) AND conversation."instanceId"=${ALICE_AUTONOMY_INSTANCE_ID}
      AND conversation."aiMode"='agent' AND conversation."archivedAt" IS NULL AND conversation."blockedAt" IS NULL
      AND conversation."commercialPaused"=FALSE AND conversation.status NOT IN ('closed','resolved','lost')
      AND EXISTS (SELECT 1 FROM "AliceAutonomousTurn" turn WHERE turn."conversationId"=conversation.id
        AND turn."instanceId"=conversation."instanceId" AND turn."firstSentAt" IS NOT NULL
        AND (conversation."aiModeUpdatedAt" IS NULL OR turn."firstSentAt">=conversation."aiModeUpdatedAt"))
  `);
  return new Set(rows.map((item) => item.conversationId));
}
