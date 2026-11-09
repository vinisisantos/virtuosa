import { Prisma, type AliceAutonomousTurn } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ALICE_AUTONOMY_INSTANCE_ID } from "@/lib/ai-assistant/autonomy/policy";
import { readAlicePrivateAudio, inspectAliceAudio, type AliceAudioMedia } from "./media";
import { transcribeAliceAudio } from "./provider";

type PendingAudio = AliceAudioMedia & { status: string | null; eligible: boolean };
type Dependencies = { readAudio: typeof readAlicePrivateAudio; transcribe: typeof transcribeAliceAudio };
export type AliceAudioPreparation = "ready" | "prepared" | "review";

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
  if (audio.status === "processing") return "review";
  const claimed = await database.$queryRaw<{ messageId: string }[]>(Prisma.sql`
    INSERT INTO "AliceAudioTranscript" ("messageId","conversationId","instanceId")
    VALUES (${audio.id},${turn.conversationId},${turn.instanceId}) ON CONFLICT ("messageId") DO NOTHING RETURNING "messageId"`);
  if (!claimed.length) return "review";
  let measuredDuration: number | null = null;
  let providerStarted = false;
  try {
    const bytes = await dependencies.readAudio(audio);
    const { durationMs, file } = await inspectAliceAudio(bytes);
    measuredDuration = durationMs;
    providerStarted = true;
    const result = await dependencies.transcribe(file);
    const text = result.text.trim();
    if (!text || Buffer.byteLength(text) > 16000 || !result.languages.some((item) => item.code === "pt")
      || !/[\p{L}\p{N}]/u.test(text) || /(?:inaud[ií]vel|inintelig[ií]vel|sem (?:fala|[aá]udio)|legendas? (?:pela|por)|amara\.org)/iu.test(text)) throw new Error("audio_unclear");
    await database.$queryRaw(Prisma.sql`UPDATE "AliceAudioTranscript" SET status='ready',text=${text},"durationMs"=${durationMs},
      "costMicroUsd"=${Math.ceil(durationMs * 4500 / 60000)},"completedAt"=${now} WHERE "messageId"=${audio.id} AND status='processing' RETURNING "messageId"`);
    return "prepared";
  } catch (error) {
    // Guarda apenas códigos locais, nunca URL, corpo do provedor, segredo ou áudio.
    const code = error instanceof Error && /^audio_[a-z_\d]+$/.test(error.message) ? error.message : "audio_processing_failed";
    await database.$queryRaw(Prisma.sql`UPDATE "AliceAudioTranscript" SET status='failed',error=${code},"completedAt"=${now},
      "durationMs"=${measuredDuration},"costMicroUsd"=${providerStarted && measuredDuration ? Math.ceil(measuredDuration * 4500 / 60000) : null}
      WHERE "messageId"=${audio.id} AND status='processing' RETURNING "messageId"`);
    return "review";
  }
}
