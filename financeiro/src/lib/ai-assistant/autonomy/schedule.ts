import type { AliceAutonomousTurn } from "@prisma/client";
import type { NextRequest } from "next/server";
import { tryAliceAutoSchedule } from "@/lib/ai-assistant/auto-schedule";
import type { AliceAutonomousContext } from "@/lib/ai-assistant/autonomy/context";

export async function scheduleAliceAutonomyAppointment(params: {
  req: NextRequest;
  turn: AliceAutonomousTurn;
  context: AliceAutonomousContext;
  claimToken: string;
}) {
  const claim = { turnId: params.turn.id, claimToken: params.claimToken, sourceMessageId: params.turn.sourceMessageId };
  return tryAliceAutoSchedule({
    req: params.req, unit: "SBC", conversationId: params.turn.conversationId,
    instanceId: params.turn.instanceId, instanceUnit: params.context.conversation.instance.unit,
    contactUnit: params.context.conversation.contact.unit,
    phone: params.context.conversation.contact.phone, targetMessageId: params.turn.sourceMessageId,
    messages: params.context.messages, safetyHold: Boolean(params.context.handoffReason), autonomyClaim: claim,
  });
}
