import { createHmac } from "node:crypto";

export const INBOX_REALTIME_EVENT = "changed";

type InboxRealtimeChangeKind = "message" | "reaction" | "status";

type InboxRealtimeChange = {
  instanceId: string;
  conversationId: string;
  messageId?: string | null;
  kind: InboxRealtimeChangeKind;
};

type InboxRealtimeFetch = typeof fetch;

function realtimeTopicSecret() {
  return process.env.WHATSAPP_REALTIME_TOPIC_SECRET?.trim()
    || process.env.JWT_SECRET?.trim()
    || "";
}

export function inboxRealtimeTopic(instanceId: string) {
  const secret = realtimeTopicSecret();
  const normalizedInstanceId = instanceId.trim();
  if (!secret || !normalizedInstanceId) return null;

  const digest = createHmac("sha256", secret)
    .update(`whatsapp-inbox:${normalizedInstanceId}`)
    .digest("hex");
  return `whatsapp-inbox:${digest}`;
}

export function inboxRealtimePublicConfig() {
  const url = process.env.SUPABASE_URL?.trim() || "";
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY?.trim()
    || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
    || "";

  if (!url || !publishableKey) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return null;
  } catch {
    return null;
  }

  return { url: url.replace(/\/$/, ""), publishableKey };
}

export function inboxRealtimePayload(change: Omit<InboxRealtimeChange, "instanceId">) {
  return {
    conversationId: change.conversationId,
    ...(change.messageId ? { messageId: change.messageId } : {}),
    kind: change.kind,
    occurredAt: new Date().toISOString(),
  };
}

/**
 * Publica somente identificadores opacos. O cliente autorizado busca os dados
 * completos pelas APIs normais do Inbox, que continuam aplicando o escopo.
 * Falha de Realtime nunca pode interromper o webhook nem o envio ao WhatsApp.
 */
export async function broadcastInboxRealtimeChange(
  change: InboxRealtimeChange,
  request: InboxRealtimeFetch = fetch,
) {
  const topic = inboxRealtimeTopic(change.instanceId);
  const config = inboxRealtimePublicConfig();
  if (!topic || !config) return false;

  try {
    const payload = inboxRealtimePayload(change);
    const response = await request(
      `${config.url}/realtime/v1/api/broadcast/${encodeURIComponent(topic)}/events/${encodeURIComponent(INBOX_REALTIME_EVENT)}`,
      {
        method: "POST",
        headers: {
          apikey: config.publishableKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(1500),
      },
    );
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return true;
  } catch (error) {
    console.warn("[WhatsApp Realtime] Broadcast indisponível; polling permanece ativo.", {
      instanceId: change.instanceId,
      conversationId: change.conversationId,
      kind: change.kind,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}
