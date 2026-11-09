import { prisma } from "@/lib/db";
import { validateAliceAutonomousTurn } from "@/lib/ai-assistant/autonomy/guard";

export type AliceBookingClaim = { turnId: string; claimToken: string; sourceMessageId: string };

// A rota do worker não possui sessão humana: usa a lease viva da fila,
// vinculada à conversa e à instância SBC, nunca um JWT fabricado.
export async function validateAliceBookingClaim(params: {
  claim: AliceBookingClaim; conversationId: string; instanceId: string;
}) {
  const turn = await prisma.aliceAutonomousTurn.findFirst({ where: {
    id: params.claim.turnId, conversationId: params.conversationId,
    instanceId: params.instanceId, sourceMessageId: params.claim.sourceMessageId,
    claimToken: params.claim.claimToken, status: "processing",
  } });
  return Boolean(turn && await validateAliceAutonomousTurn(turn, params.claim.claimToken, "processing"));
}
