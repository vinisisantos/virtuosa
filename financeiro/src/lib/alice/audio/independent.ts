import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ALICE_AUTONOMY_INSTANCE_ID } from "@/lib/ai-assistant/autonomy/policy";
import { routeAliceHandoff } from "@/lib/ai-assistant/handoff";
import { enqueueInboundPostProcessJob, type InboundPostProcessPayload } from "@/lib/whatsapp/inbound-postprocess-queue";
import { audioDependencies, transcribeStoredAliceAudio, type AudioDependencies } from "./transcribe";
import type { AliceAudioMedia } from "./media";

type Params = { conversationId: string; instanceId: string; providerMessageId: string };
type Dependencies = AudioDependencies & { notify: typeof routeAliceHandoff };

/** Não altera aiMode, fila da Alice ou mensagens. Manual também conserva o histórico por voz. */
export async function prepareIndependentAliceAudio(params: Params, database = prisma, now = new Date(),
  dependencies: Dependencies = { ...audioDependencies, notify: routeAliceHandoff }) {
  if (params.instanceId !== ALICE_AUTONOMY_INSTANCE_ID) return "ignored" as const;
  const rows = await database.$queryRaw<AliceAudioMedia[]>(Prisma.sql`
    SELECT p.id,p."conversationId",p."mediaUrl",p."mediaSizeBytes",p."fromMe"
    FROM "WhatsAppMessage" p JOIN "WhatsAppConversation" c ON c.id=p."conversationId"
    JOIN "WhatsAppInstance" i ON i.id=c."instanceId" JOIN "AppSetting" s ON s.key='alice_audio_sbc_v1'
    WHERE p."conversationId"=${params.conversationId} AND p."messageId"=${params.providerMessageId}
      AND i.id=${params.instanceId} AND i.unit='SBC' AND p.type IN ('audio','ptt') AND p.status<>'deleted'
      AND s.value::jsonb->>'enabled'='true'
      AND NULLIF(s.value::jsonb->>'allDirectionsActivatedAt','')::timestamp<=p.timestamp
      AND NULLIF(s.value::jsonb->>'allDirectionsActivatedAt','')::timestamp<=p."createdAt"`);
  if (!rows[0]) return "ignored" as const;
  const result = await transcribeStoredAliceAudio(rows[0], params.instanceId, database, now, dependencies);
  if (result === "pending") throw new Error("audio_transcription_in_progress");
  if (result === "review") await dependencies.notify({ conversationId: params.conversationId,
    instanceId: params.instanceId, sourceMessageId: rows[0].id, unit: "SBC", reason: "model_requested", notificationOnly: true });
  return result;
}

/** Envio do CRM não passa pela hidratação do webhook; usa a mesma fila durável, deduplicada por instância/ID. */
export async function enqueueSentAliceAudio(params: Params & { type: string }, database: typeof prisma | Prisma.TransactionClient = prisma) {
  if (params.instanceId !== ALICE_AUTONOMY_INSTANCE_ID || !["audio", "ptt"].includes(params.type)) return;
  const payload: InboundPostProcessPayload = { message: {}, webhook: { event: null, type: null, dataType: null },
    conversationWasCreated: false, receivedAt: new Date().toISOString(), audioTranscriptOnly: true };
  await enqueueInboundPostProcessJob({ instanceId: params.instanceId, conversationId: params.conversationId,
    messageId: params.providerMessageId, payload }, database);
}
