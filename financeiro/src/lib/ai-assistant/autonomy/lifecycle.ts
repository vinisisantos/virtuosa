import { Prisma, type AliceAutonomousTurn } from "@prisma/client";
import { prisma } from "@/lib/db";
import { routeAliceHandoff } from "@/lib/ai-assistant/handoff";
import { ALICE_AUTONOMY_INSTANCE_ID } from "@/lib/ai-assistant/autonomy/policy";

export async function finishAliceAutonomousTurn(params: {
  turn: AliceAutonomousTurn; token: string; status: "skipped" | "needs_human" | "uncertain" | "failed";
  reason: string; database?: typeof prisma; now?: Date;
}) {
  const database = params.database || prisma;
  const now = params.now || new Date();
  return database.$transaction(async (tx) => {
    const updated = await tx.aliceAutonomousTurn.updateMany({
      where: { id: params.turn.id, instanceId: ALICE_AUTONOMY_INSTANCE_ID, claimToken: params.token, status: { in: ["processing", "sending"] } },
      data: { status: params.status, completedAt: now, messagesJson: params.status === "uncertain" ? undefined : Prisma.JsonNull, claimToken: null, error: params.reason },
    });
    const recoverableScheduleOffer = params.reason === "schedule_option_expired_or_invalid";
    if (updated.count && params.status !== "skipped" && !recoverableScheduleOffer) {
      await tx.whatsAppConversation.updateMany({
        where: { id: params.turn.conversationId, instanceId: ALICE_AUTONOMY_INSTANCE_ID, aiMode: "agent" },
        data: { aiMode: "manual", aiModeUpdatedAt: now, aiModeUpdatedBy: "alice-handoff" },
      });
      await tx.aliceAutonomousTurn.updateMany({
        where: { conversationId: params.turn.conversationId, id: { not: params.turn.id }, status: "queued" },
        data: { status: "skipped", completedAt: now, messagesJson: Prisma.JsonNull, error: "conversation_requires_human" },
      });
    }
    return updated.count > 0;
  });
}

export async function notifyAliceAutonomousHandoff(
  turn: AliceAutonomousTurn, reason: "clinical_safety" | "unsupported_procedure" | "model_requested", handoff = routeAliceHandoff,
) {
  // A falha da notificação nunca autoriza retomar ou repetir o envio externo.
  try {
    await handoff({ conversationId: turn.conversationId, instanceId: turn.instanceId, sourceMessageId: turn.sourceMessageId, unit: "SBC", reason });
  } catch { console.error("[AliceAutonomy] internal handoff unavailable"); }
}
