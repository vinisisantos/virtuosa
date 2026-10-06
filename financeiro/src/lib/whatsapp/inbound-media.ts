export function evolutionMediaDataUrl(payload: unknown, fallbackMimeType?: string | null) {
  if (!payload || typeof payload !== "object") return null;
  const data = payload as Record<string, unknown>;
  const base64 = typeof data.base64 === "string" ? data.base64.trim() : "";
  if (!base64) return null;
  if (base64.startsWith("data:")) return base64;
  const mimeType = typeof data.mimetype === "string" ? data.mimetype :
    typeof data.mimeType === "string" ? data.mimeType : fallbackMimeType;
  return `data:${mimeType?.split(";")[0].trim() || "application/octet-stream"};base64,${base64}`;
}

export function findEvolutionMessageById(
  payload: unknown,
  messageId: string,
  accept: (record: Record<string, unknown>) => boolean = () => true,
  depth = 0,
): Record<string, unknown> | null {
  if (depth > 5 || !payload || typeof payload !== "object") return null;
  if (Array.isArray(payload)) {
    for (const item of payload.slice(0, 20)) {
      const found = findEvolutionMessageById(item, messageId, accept, depth + 1);
      if (found) return found;
    }
    return null;
  }
  const record = payload as Record<string, unknown>;
  const key = record.key as Record<string, unknown> | undefined;
  if (key?.id === messageId && record.message && typeof record.message === "object" && accept(record)) return record;
  for (const field of ["records", "messages", "data", "results"]) {
    const found = findEvolutionMessageById(record[field], messageId, accept, depth + 1);
    if (found) return found;
  }
  return null;
}

export function evolutionMessageMatchesConversation(params: {
  record: Record<string, unknown>;
  fromMe: boolean;
  lastKnownJid?: string | null;
  contactPhone: string;
}) {
  const key = params.record.key as Record<string, unknown> | undefined;
  if (!key || key.fromMe !== params.fromMe) return false;
  const jids = [key.remoteJid, key.remoteJidAlt].filter((jid): jid is string => typeof jid === "string");
  const knownJid = params.lastKnownJid?.toLowerCase();
  if (knownJid && jids.some((jid) => jid.toLowerCase() === knownJid)) return true;
  const contactDigits = params.contactPhone.replace(/\D/g, "").slice(-10);
  return contactDigits.length === 10 && jids.some((jid) => {
    if (!/@(?:s\.whatsapp\.net|c\.us)$/i.test(jid)) return false;
    return jid.split("@")[0].replace(/\D/g, "").endsWith(contactDigits);
  });
}

export async function downloadEvolutionMediaDataUrl(params: {
  instanceName: string;
  message: unknown;
  fallbackMimeType?: string | null;
}) {
  const baseUrl = (process.env.EVOLUTION_API_URL || "http://localhost:8080").replace(/\/+$/, "");
  const response = await fetch(
    `${baseUrl}/chat/getBase64FromMediaMessage/${encodeURIComponent(params.instanceName)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: process.env.EVOLUTION_API_KEY || "",
      },
      body: JSON.stringify({ message: params.message }),
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!response.ok) throw new Error(`Evolution não entregou a mídia (${response.status}).`);
  const dataUrl = evolutionMediaDataUrl(await response.json(), params.fallbackMimeType);
  if (!dataUrl) throw new Error("Evolution retornou mídia vazia.");
  return dataUrl;
}
