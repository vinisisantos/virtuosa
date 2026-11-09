import { prisma } from "@/lib/db";
import { aliceStructuredOutputSchema, type AliceStructuredOutput } from "@/lib/alice/schema";
import { guardAliceReply, type AliceGuardEvent } from "@/lib/alice/guards";
import type { AliceMemoryRuntime } from "@/lib/alice/runtime-context";
import { validateAliceFearReply } from "@/lib/alice/fear-policy";

export type AliceTurnPayload = { version: 1; proposal: AliceStructuredOutput; persistMemory?: false };

export function legacyAliceTurnPayload(messages: string[]): AliceTurnPayload {
  return { version: 1, persistMemory: false, proposal: { resposta: messages,
    memoria: { resumo: "Sequência anterior à memória, sem atualização factual proposta." },
    seApresentouNestaResposta: false, escalarHumano: false, confidence: "medium", usedKnowledge: [] } };
}

export function readAliceTurnPayload(value: unknown): AliceTurnPayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (data.version !== 1) return null;
  const parsed = aliceStructuredOutputSchema.safeParse(data.proposal);
  return parsed.success ? { version: 1, proposal: parsed.data, ...(data.persistMemory === false ? { persistMemory: false } : {}) } : null;
}

export function guardAliceTurn(payload: AliceTurnPayload, runtime: AliceMemoryRuntime, nextIndex: number) {
  const original = payload.proposal;
  const fearViolation = validateAliceFearReply(original.resposta, runtime.guard.fear || null, runtime.guard.contactName);
  if (fearViolation) return { status: "handoff" as const, reason: fearViolation, events: [{ code: fearViolation }] as AliceGuardEvent[] };
  // Partes já aceitas não podem ser retiradas nem deslocar o índice do complemento.
  const tail = original.resposta.slice(nextIndex);
  const guarded = guardAliceReply({ ...original, resposta: tail }, { ...runtime.guard, fear: null });
  if (guarded.status !== "ready") return guarded;
  const proposal = { ...guarded.proposal, resposta: [...original.resposta.slice(0, nextIndex), ...guarded.proposal.resposta] };
  return { status: "ready" as const, payload: { ...payload, proposal }, events: guarded.events };
}

export async function auditAliceGuardEvents(turnId: string, events: readonly AliceGuardEvent[],
  database = prisma): Promise<void> {
  if (!events.length) return;
  await database.auditLog.create({ data: { userName: "Alice", action: "alice_output_guard", entity: "AliceAutonomousTurn",
    entityId: turnId, unit: "SBC", details: JSON.stringify({ version: 1, events }) } });
}
