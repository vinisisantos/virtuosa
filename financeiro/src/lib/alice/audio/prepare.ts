import { Prisma, type AliceAutonomousTurn } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ALICE_AUTONOMY_INSTANCE_ID } from "@/lib/ai-assistant/autonomy/policy";
import { readAlicePrivateAudio, type AliceAudioMedia } from "./media";
import { transcribeAliceAudio } from "./provider";
import { transcribeStoredAliceAudio } from "./transcribe";

type PendingAudio = AliceAudioMedia & { status: string | null; eligible: boolean };
type Dependencies = { readAudio: typeof readAlicePrivateAudio; transcribe: typeof transcribeAliceAudio };
export type AliceAudioPreparation = "ready" | "prepared" | "waiting" | "review";

/** Prepara no máximo um áudio por invocação; a geração Sonnet ocorre na próxima passagem da fila existente. */
export async function prepareAliceAudioTurn(turn: AliceAutonomousTurn, database = prisma, now = new Date(),
  dependencies: Dependencies = { readAudio: readAlicePrivateAudio, transcribe: transcribeAliceAudio }): Promise<AliceAudioPreparation> {
  if (turn.instanceId !== ALICE_AUTONOMY_INSTANCE_ID || turn.nextMessageIndex > 0) return "ready";
  const rows = await database.$queryRaw<PendingAudio[]>(Prisma.sql`
    SELECT p.id,p."conversationId",p."mediaUrl",p."mediaSizeBytes",a.status,
      COALESCE(s.value::jsonb->>'enabled'='true' AND p."createdAt">(s.value::jsonb->>'activatedAt')::timestamp
        AND p.timestamp>(s.value::jsonb->>'activatedAt')::timestamp,FALSE) AS eligible
    FROM "WhatsAppMessage" p JOIN "WhatsAppConversation" c ON c.id=p."conversationId"
    JOIN "WhatsAppInstance" i ON i.id=c."instanceId"
    LEFT JOIN "AliceAudioTranscript" a ON a."messageId"=p.id AND a."conversationId"=c.id AND a."instanceId"=i.id
    LEFT JOIN "AppSetting" s ON s.key='alice_audio_sbc_v1'
    WHERE c.id=${turn.conversationId} AND i.id=${turn.instanceId} AND i.unit='SBC' AND c."aiMode"='agent'
      AND p."fromMe"=FALSE AND p.type IN ('audio','ptt') AND p.status<>'deleted'
      AND (p.timestamp,p.id) > COALESCE((SELECT ROW(q.timestamp,q.id) FROM "WhatsAppMessage" q
        WHERE q."conversationId"=c.id AND q."fromMe"=TRUE AND q.status IN ('sent','delivered','read','played')
        ORDER BY q.timestamp DESC,q.id DESC LIMIT 1),ROW('-infinity'::timestamp,''::text))
    ORDER BY p.timestamp,p.id LIMIT 9`);
  if (!rows.length) return "ready";
  if (rows.length > 8 || rows.some((row) => !row.eligible || row.status === "failed")) return "review";
  const audio = rows.find((row) => row.status !== "ready");
  if (!audio) return "ready";
  const result = await transcribeStoredAliceAudio(audio, turn.instanceId, database, now, dependencies);
  return result === "pending" ? "waiting" : result;
}
