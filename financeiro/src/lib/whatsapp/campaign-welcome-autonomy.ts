import { enqueueAliceAutonomousTurn, isAliceAutonomyActive } from "@/lib/ai-assistant/autonomy/queue";
import { ALICE_AUTONOMY_INSTANCE_ID } from "@/lib/ai-assistant/autonomy/policy";

type InboundReception = {
  conversationId: string; instanceId: string; sourceMessageId: string;
  timestamp: Date; receivedAt: Date; fromMe: boolean; sendable: boolean;
  payload: unknown;
};

export function isFreshAliceInboundEvent(input: InboundReception, now = new Date()) {
  if (input.instanceId !== ALICE_AUTONOMY_INSTANCE_ID || input.fromMe || !input.sendable || !input.sourceMessageId) return false;
  const payload = input.payload as { event?: unknown; type?: unknown; data?: { type?: unknown } } | null;
  const event = [payload?.event, payload?.type, payload?.data?.type].join(" ");
  if (/history|append|import|messages[._]set|messages[._]update|ack|reaction/i.test(event)) return false;
  const transportAge = input.receivedAt.getTime() - input.timestamp.getTime();
  const processingAge = now.getTime() - input.receivedAt.getTime();
  return Number.isFinite(transportAge) && transportAge >= -30_000 && transportAge <= 120_000
    && Number.isFinite(processingAge) && processingAge >= -30_000 && processingAge <= 120_000;
}

// A classificação de campanha e a persistência antecedem esta decisão no webhook.
// Uma falha de consulta deve interromper o job, nunca liberar a saudação por engano.
export async function handleAliceInboundReception(input: InboundReception, deps = {
  enqueue: enqueueAliceAutonomousTurn, isActive: isAliceAutonomyActive,
}, now = new Date()) {
  if (input.instanceId !== ALICE_AUTONOMY_INSTANCE_ID || input.fromMe || !input.sendable) return false;
  if (isFreshAliceInboundEvent(input, now)) await deps.enqueue({
    conversationId: input.conversationId, instanceId: input.instanceId,
    sourceMessageId: input.sourceMessageId, timestamp: input.timestamp, origin: "inbound",
  });
  return deps.isActive({ conversationId: input.conversationId, instanceId: input.instanceId });
}

export async function ensureLegacyReceptionAvailable(input: { conversationId: string; instanceId: string }) {
  if (await isAliceAutonomyActive(input)) throw new Error("alice_autonomy_active");
}
