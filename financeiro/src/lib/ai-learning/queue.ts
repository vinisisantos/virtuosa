import { prisma } from "@/lib/db";
import {
  AI_LEARNING_CONFIG_KEY,
  AI_LEARNING_UNIT,
  aiLearningDigest,
  plainLearningText,
} from "@/lib/ai-learning/policy";

const AUTOMATED_SENDERS = new Set([
  "automação",
  "automação meta",
  "assistente virtual",
  "ia",
  "sistema",
]);

type LearningMessage = {
  id: string;
  conversationId: string;
  body: string;
  type: string;
  fromMe: boolean;
  status: string;
  respondedBy: string | null;
  respondedByName: string | null;
};

export function isEligibleHumanLearningMessage(message: LearningMessage) {
  return message.fromMe
    && message.type === "text"
    && plainLearningText(message.body).length >= 2
    && Boolean(message.respondedBy)
    && !["failed", "error", "deleted"].includes(message.status)
    && !AUTOMATED_SENDERS.has(plainLearningText(message.respondedByName || "").toLocaleLowerCase("pt-BR"));
}

export async function enqueueAiLearningObservation(
  message: LearningMessage,
  instance: { id: string; unit: string | null },
) {
  if (instance.unit !== AI_LEARNING_UNIT || !isEligibleHumanLearningMessage(message)) return;
  try {
    const eventKey = aiLearningDigest([message.id, message.body, message.status]);
    await prisma.$executeRaw`INSERT INTO "AiLearningObservation" ("conversationId", "lastEventKey", "dueAt")
      SELECT ${message.conversationId}, ${eventKey}, NOW() + INTERVAL '15 minutes'
      FROM "AppSetting" s
      WHERE s.key = ${AI_LEARNING_CONFIG_KEY}
        AND s.value::jsonb->>'enabled' = 'true'
        AND s.value::jsonb->>'unit' = ${AI_LEARNING_UNIT}
      ON CONFLICT ("conversationId") DO UPDATE SET
        revision = "AiLearningObservation".revision + 1,
        "lastEventKey" = EXCLUDED."lastEventKey",
        "updatedAt" = NOW(),
        "dueAt" = EXCLUDED."dueAt",
        attempts = 0,
        error = NULL
      WHERE "AiLearningObservation"."lastEventKey" <> EXCLUDED."lastEventKey"`;
  } catch {
    console.error("[AI Learning] Não foi possível colocar a conversa na fila");
  }
}
