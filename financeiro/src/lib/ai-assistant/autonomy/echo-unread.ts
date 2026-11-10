import type { Prisma } from "@prisma/client";
import { ALICE_AUTONOMY_INSTANCE_ID, ALICE_AUTONOMY_UNIT } from "@/lib/ai-assistant/autonomy/policy";

export async function unreadCountForNewWhatsAppMessage(params: {
  isSendablePhone: boolean; isFromMe: boolean;
  dbInstance: { id: string; unit?: string | null };
  conversation: { id: string; aiMode?: string | null };
}, tx: Pick<Prisma.TransactionClient, "$queryRaw">) {
  if (!params.isSendablePhone) return 0;
  if (!params.isFromMe) return { increment: 1 };
  const { dbInstance, conversation } = params;
  if (dbInstance.id !== ALICE_AUTONOMY_INSTANCE_ID || dbInstance.unit !== ALICE_AUTONOMY_UNIT || conversation.aiMode !== "agent") return 0;

  // Antes de o provedor devolver o ID, um eco da Alice e uma saída pelo aparelho
  // não têm autoria distinguível. Nessa janela, só a conclusão do turno dá baixa.
  const [proof] = await tx.$queryRaw<{ inFlight: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM "AliceAutonomousTurn" t
      WHERE t."instanceId"=${dbInstance.id} AND t."conversationId"=${conversation.id}
        AND t."claimToken" IS NOT NULL AND t.status IN ('sending','processing')
        AND (t.status='sending' OR EXISTS (
          SELECT 1 FROM "AliceAutoSchedule" b WHERE b."conversationId"=t."conversationId"
            AND b."replyMessageId"=t."sourceMessageId" AND b.state='sending'
        ))
    ) AS "inFlight"`;
  return proof.inFlight ? undefined : 0;
}
