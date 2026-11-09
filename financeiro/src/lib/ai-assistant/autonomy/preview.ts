import { createHmac, timingSafeEqual } from "node:crypto";
import { AiAssistantError } from "@/lib/ai-assistant/policy";
import type { AliceBacklogRow } from "@/lib/ai-assistant/autonomy/admin-queries";

type Preview = { conversationId: string; sourceMessageId: string; timestamp: string; cutoff: string; expiresAt: number };
function secret() {
  const value = process.env.JWT_SECRET?.trim();
  if (!value) throw new AiAssistantError("A assinatura da prévia não está configurada no servidor.", 503);
  return value;
}
export function createAliceBacklogPreview(row: AliceBacklogRow, cutoff: Date) {
  const value = Buffer.from(JSON.stringify({ conversationId: row.conversationId, sourceMessageId: row.sourceMessageId,
    timestamp: row.lastInboundAt.toISOString(), cutoff: cutoff.toISOString(), expiresAt: cutoff.getTime() + 10 * 60_000 })).toString("base64url");
  return `${value}.${createHmac("sha256", secret()).update(value).digest("base64url")}`;
}
export function verifyAliceBacklogPreview(token: unknown, conversationId: string, now = new Date()): Preview {
  const invalid = () => new AiAssistantError("Atualize o acompanhamento e selecione novamente a conversa inicial; a prévia expirou ou mudou.", 409);
  if (typeof token !== "string" || token.length > 2_000) throw invalid();
  const [value, signature, extra] = token.split(".");
  if (!value || !signature || extra) throw invalid();
  const expected = createHmac("sha256", secret()).update(value).digest();
  const received = Buffer.from(signature, "base64url");
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) throw invalid();
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Preview;
    if (parsed.conversationId !== conversationId || !parsed.sourceMessageId || !Number.isFinite(Date.parse(parsed.timestamp))
      || !Number.isFinite(Date.parse(parsed.cutoff)) || !Number.isFinite(parsed.expiresAt) || parsed.expiresAt <= now.getTime()
      || Date.parse(parsed.cutoff) > now.getTime()) throw invalid();
    return parsed;
  } catch { throw invalid(); }
}
