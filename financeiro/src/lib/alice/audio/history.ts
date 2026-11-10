import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ALICE_AUTONOMY_INSTANCE_ID } from "@/lib/ai-assistant/autonomy/policy";
import { isEmptySecretEncryptedEnvelope } from "@/lib/whatsapp/message-content";

export type AliceAudioTranscript = { status: string; text: string | null; durationMs: number | null };
type Message = { id: string; conversationId?: string; body: string; type: string; fromMe: boolean; status: string };
export type AliceAudioInput = { audioTranscribed?: boolean };
export const isAliceTextInput = (message: { type: string } & AliceAudioInput) => message.type === "text" || message.audioTranscribed === true;

/** Uma única leitura em lote, sempre após autorização da conversa na rota/contexto. */
export async function aliceAudioTranscripts(conversationId: string, instanceId: string, ids: string[], database: Pick<typeof prisma, "$queryRaw"> = prisma) {
  if (instanceId !== ALICE_AUTONOMY_INSTANCE_ID || !ids.length) return new Map<string, AliceAudioTranscript>();
  const rows = await database.$queryRaw<(AliceAudioTranscript & { messageId: string })[]>(Prisma.sql`
    SELECT a."messageId",a.status,a.text,a."durationMs" FROM "AliceAudioTranscript" a
    JOIN "WhatsAppMessage" p ON p.id=a."messageId" AND p."conversationId"=a."conversationId"
    JOIN "WhatsAppConversation" c ON c.id=p."conversationId" AND c."instanceId"=a."instanceId"
    JOIN "WhatsAppInstance" i ON i.id=c."instanceId"
    WHERE c.id=${conversationId} AND c."instanceId"=${instanceId} AND i.unit='SBC'
      AND p."fromMe"=FALSE AND p.type IN ('audio','ptt') AND p.status<>'deleted'
      AND a."messageId" IN (${Prisma.join(ids)})`);
  return new Map(rows.map((row) => [row.messageId, row]));
}

export async function projectAliceAudioHistory<T extends Message>(messages: T[], conversationId: string,
  instanceId: string, database: Pick<typeof prisma, "$queryRaw"> = prisma): Promise<(T & AliceAudioInput)[]> {
  const visibleMessages = messages.filter((message) => !isEmptySecretEncryptedEnvelope(message.type, message.body));
  const ids = visibleMessages.filter((message) => !message.fromMe && ["audio", "ptt"].includes(message.type)).map((message) => message.id);
  const transcripts = await aliceAudioTranscripts(conversationId, instanceId, ids, database);
  return visibleMessages.map((message) => {
    const transcript = transcripts.get(message.id);
    return transcript?.status === "ready" && transcript.text ? { ...message, body: transcript.text, audioTranscribed: true } : message;
  });
}
