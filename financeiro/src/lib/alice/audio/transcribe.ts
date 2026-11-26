import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { readAlicePrivateAudio, inspectAliceAudio, type AliceAudioMedia } from "./media";
import { transcribeAliceAudio } from "./provider";

export type AudioDependencies = { readAudio: typeof readAlicePrivateAudio; transcribe: typeof transcribeAliceAudio };
export const audioDependencies: AudioDependencies = { readAudio: readAlicePrivateAudio, transcribe: transcribeAliceAudio };

/** A mesma chave interna protege o pós-processamento e o turno autônomo contra dupla cobrança. */
export async function transcribeStoredAliceAudio(audio: AliceAudioMedia, instanceId: string, database = prisma,
  now = new Date(), dependencies = audioDependencies): Promise<"ready" | "prepared" | "pending" | "review"> {
  const claimed = await database.$queryRaw<{ messageId: string }[]>(Prisma.sql`
    INSERT INTO "AliceAudioTranscript" ("messageId","conversationId","instanceId")
    VALUES (${audio.id},${audio.conversationId},${instanceId}) ON CONFLICT ("messageId") DO NOTHING RETURNING "messageId"`);
  if (!claimed.length) {
    const rows = await database.$queryRaw<{ status: string }[]>(Prisma.sql`
      SELECT status FROM "AliceAudioTranscript" WHERE "messageId"=${audio.id}
        AND "conversationId"=${audio.conversationId} AND "instanceId"=${instanceId}`);
    if (rows[0]?.status === "ready") return "ready";
    if (rows[0]?.status !== "processing") return "review";
    // Uma interrupção após POST é incerta: nunca repetir a inferência paga automaticamente.
    const stale = await database.$queryRaw<{ messageId: string }[]>(Prisma.sql`
      UPDATE "AliceAudioTranscript" SET status='failed',error='audio_processing_interrupted',"completedAt"=${now}
      WHERE "messageId"=${audio.id} AND status='processing' AND "createdAt"<${new Date(now.getTime() - 120_000)}
      RETURNING "messageId"`);
    return stale.length ? "review" : "pending";
  }
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
      "costMicroUsd"=${Math.ceil(durationMs * 4500 / 60000)},"completedAt"=${now}
      WHERE "messageId"=${audio.id} AND status='processing' RETURNING "messageId"`);
    return "prepared";
  } catch (error) {
    const code = error instanceof Error && /^audio_[a-z_\d]+$/.test(error.message) ? error.message : "audio_processing_failed";
    await database.$queryRaw(Prisma.sql`UPDATE "AliceAudioTranscript" SET status='failed',error=${code},"completedAt"=${now},
      "durationMs"=${measuredDuration},"costMicroUsd"=${providerStarted && measuredDuration ? Math.ceil(measuredDuration * 4500 / 60000) : null}
      WHERE "messageId"=${audio.id} AND status='processing' RETURNING "messageId"`);
    return "review";
  }
}
