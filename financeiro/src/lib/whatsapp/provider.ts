import { prisma } from "@/lib/db";

export type WhatsAppProvider = "evolution" | "waha";

export const DEFAULT_WHATSAPP_PROVIDER: WhatsAppProvider = "evolution";
export const WAHA_PILOT_USERS_SETTING_KEY = "whatsapp_waha_pilot_user_ids";

const WAHA_WEBHOOK_EVENTS = [
  "message.any",
  "message.ack",
  "message.waiting",
  "session.status",
];

export function getInstanceProvider(instance?: { provider?: string | null } | null): WhatsAppProvider {
  return instance?.provider === "waha" ? "waha" : DEFAULT_WHATSAPP_PROVIDER;
}

export function getWahaConfig() {
  return {
    url: (process.env.WAHA_API_URL || process.env.WHATSAPP_WAHA_API_URL || "").replace(/\/+$/, ""),
    apiKey: process.env.WAHA_API_KEY || process.env.WHATSAPP_WAHA_API_KEY || "",
  };
}

export function maskSecret(value?: string | null) {
  const clean = (value || "").trim();
  if (!clean) return "";
  if (clean.length <= 8) return `${clean.slice(0, 2)}...len${clean.length}`;
  return `${clean.slice(0, 4)}...${clean.slice(-4)} len${clean.length}`;
}

export async function readProviderPayload(res: Response) {
  const text = await res.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function summarizeProviderError(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value.slice(0, 180);
  if (Array.isArray(value)) {
    return value.map(summarizeProviderError).filter(Boolean).join("; ").slice(0, 180);
  }
  if (typeof value !== "object") return String(value).slice(0, 180);

  const data = value as Record<string, unknown>;
  for (const candidate of [data.message, data.error, data.details, data.response]) {
    const summary = summarizeProviderError(candidate);
    if (summary) return summary;
  }

  try {
    return JSON.stringify(data).slice(0, 180);
  } catch {
    return "";
  }
}

function parsePilotUserIds(raw?: string | null) {
  if (!raw) return new Set<string>();
  const clean = raw.trim();
  if (!clean) return new Set<string>();

  try {
    const parsed = JSON.parse(clean);
    if (Array.isArray(parsed)) {
      return new Set(parsed.map(String).map((value) => value.trim()).filter(Boolean));
    }
    if (parsed && typeof parsed === "object" && Array.isArray((parsed as any).userIds)) {
      return new Set((parsed as any).userIds.map(String).map((value: string) => value.trim()).filter(Boolean));
    }
  } catch {}

  return new Set(clean.split(/[,\s]+/).map((value) => value.trim()).filter(Boolean));
}

export async function resolveProviderForNewInstance(userId: string): Promise<WhatsAppProvider> {
  const envPilotUsers = parsePilotUserIds(process.env.WHATSAPP_WAHA_PILOT_USER_IDS || process.env.WAHA_PILOT_USER_IDS);
  if (envPilotUsers.has("*") || envPilotUsers.has(userId)) return "waha";

  const setting = await prisma.appSetting.findUnique({
    where: { key: WAHA_PILOT_USERS_SETTING_KEY },
    select: { value: true },
  });
  const dbPilotUsers = parsePilotUserIds(setting?.value);
  return dbPilotUsers.has("*") || dbPilotUsers.has(userId) ? "waha" : DEFAULT_WHATSAPP_PROVIDER;
}

function ensureWahaConfig() {
  const config = getWahaConfig();
  if (!config.url || !config.apiKey) {
    throw new Error("WAHA_API_URL/WAHA_API_KEY não configuradas");
  }
  return config;
}

function wahaHeaders(extra?: HeadersInit): HeadersInit {
  const { apiKey } = ensureWahaConfig();
  return {
    "X-Api-Key": apiKey,
    Accept: "application/json",
    ...extra,
  };
}

export function normalizeWahaStatus(status?: string | null) {
  const normalized = (status || "STOPPED").toUpperCase();
  if (normalized === "WORKING") return "connected";
  if (["STARTING", "SCAN_QR_CODE"].includes(normalized)) return "connecting";
  if (["STOPPED", "FAILED", "LOGGED_OUT"].includes(normalized)) return "disconnected";
  return "connecting";
}

export function normalizeWahaAckStatus(ackName?: string | null, ack?: number | null) {
  const normalized = (ackName || "").toUpperCase();
  if (normalized === "ERROR" || ack === -1) return "error";
  if (normalized === "PENDING" || ack === 0) return "pending";
  if (normalized === "SERVER" || ack === 1) return "sent";
  if (normalized === "DEVICE" || ack === 2) return "delivered";
  if (normalized === "READ" || ack === 3) return "read";
  if (normalized === "PLAYED" || ack === 4) return "played";
  return "sent";
}

export function toWahaChatId(value: string) {
  const raw = (value || "").trim();
  if (!raw) return raw;
  if (raw.includes("@c.us") || raw.includes("@g.us") || raw.includes("@lid") || raw.includes("@newsletter")) {
    return raw;
  }
  if (raw.includes("@s.whatsapp.net")) {
    return raw.replace(/@s\.whatsapp\.net$/i, "@c.us");
  }
  const digits = raw.replace(/\D/g, "");
  return digits ? `${digits}@c.us` : raw;
}

export function wahaChatIdToDigits(value?: string | null) {
  return (value || "")
    .replace(/@c\.us|@s\.whatsapp\.net|@broadcast|@call|@lid/gi, "")
    .replace(/\D/g, "");
}

export async function wahaRequest(path: string, init: RequestInit = {}) {
  const { url } = ensureWahaConfig();
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const headers = wahaHeaders(init.headers);
  return fetch(`${url}${normalizedPath}`, {
    ...init,
    headers,
    signal: init.signal || AbortSignal.timeout(30000),
  });
}

function buildWahaSessionBody(params: {
  sessionName: string;
  webhookUrl: string;
  userId: string;
  unit?: string | null;
}) {
  return {
    name: params.sessionName,
    config: {
      metadata: {
        "virtuosa.userId": params.userId,
        "virtuosa.unit": params.unit || "",
      },
      ignore: {
        status: true,
        groups: true,
        channels: true,
        broadcast: true,
      },
      webhooks: [
        {
          url: params.webhookUrl,
          events: WAHA_WEBHOOK_EVENTS,
          retries: {
            policy: "constant",
            delaySeconds: 2,
            attempts: 10,
          },
        },
      ],
    },
  };
}

export async function getWahaSession(sessionName: string) {
  const res = await wahaRequest(`/api/sessions/${encodeURIComponent(sessionName)}`, {
    method: "GET",
  });
  const data = await readProviderPayload(res);
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(summarizeProviderError(data) || `WAHA session status ${res.status}`);
  }
  return data && typeof data === "object" ? data as Record<string, any> : null;
}

export async function ensureWahaSession(params: {
  sessionName: string;
  webhookUrl: string;
  userId: string;
  unit?: string | null;
}) {
  const existing = await getWahaSession(params.sessionName).catch((error) => {
    if (String(error?.message || "").includes("404")) return null;
    throw error;
  });
  const body = buildWahaSessionBody(params);

  const res = await wahaRequest(existing ? `/api/sessions/${encodeURIComponent(params.sessionName)}` : "/api/sessions", {
    method: existing ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await readProviderPayload(res);
  if (!res.ok && res.status !== 409) {
    throw new Error(summarizeProviderError(data) || `WAHA create session ${res.status}`);
  }
  return data && typeof data === "object" ? data as Record<string, any> : existing || {};
}

export async function startWahaSession(sessionName: string) {
  const res = await wahaRequest(`/api/sessions/${encodeURIComponent(sessionName)}/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  const data = await readProviderPayload(res);
  if (!res.ok) {
    throw new Error(summarizeProviderError(data) || `WAHA start session ${res.status}`);
  }
  return data && typeof data === "object" ? data as Record<string, any> : {};
}

export async function restartWahaSession(sessionName: string) {
  const res = await wahaRequest(`/api/sessions/${encodeURIComponent(sessionName)}/restart`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  const data = await readProviderPayload(res);
  if (!res.ok) {
    throw new Error(summarizeProviderError(data) || `WAHA restart session ${res.status}`);
  }
  return data && typeof data === "object" ? data as Record<string, any> : {};
}

export async function logoutWahaSession(sessionName: string) {
  const res = await wahaRequest(`/api/sessions/${encodeURIComponent(sessionName)}/logout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  return readProviderPayload(res);
}

export async function deleteWahaSession(sessionName: string) {
  const res = await wahaRequest(`/api/sessions/${encodeURIComponent(sessionName)}`, {
    method: "DELETE",
  });
  return readProviderPayload(res);
}

export function extractWahaQrBase64(data: unknown) {
  if (!data) return null;
  if (typeof data === "string") return data.startsWith("data:") ? data : data;
  if (typeof data !== "object") return null;
  const value = data as Record<string, any>;
  const raw = value.data || value.base64 || value.qrcode || value.qr || value.image;
  if (typeof raw !== "string" || !raw) return null;
  if (raw.startsWith("data:")) return raw;
  const mimetype = value.mimetype || "image/png";
  return `data:${mimetype};base64,${raw}`;
}

export async function getWahaQr(sessionName: string) {
  const res = await wahaRequest(`/api/${encodeURIComponent(sessionName)}/auth/qr`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  const data = await readProviderPayload(res);
  if (!res.ok) {
    throw new Error(summarizeProviderError(data) || `WAHA QR ${res.status}`);
  }
  return extractWahaQrBase64(data);
}

function parseDataUri(value: string) {
  const match = value.match(/^data:([^;,]+)(?:;[^,]*)?;base64,(.*)$/);
  if (!match) return null;
  return { mimetype: match[1], data: match[2] };
}

export function buildWahaFile(file?: string | null, fallbackMime = "application/octet-stream", filename = "arquivo") {
  const raw = file || "";
  const parsed = parseDataUri(raw);
  if (parsed) {
    return { mimetype: parsed.mimetype, data: parsed.data, filename };
  }
  return { mimetype: fallbackMime, data: raw.includes(",") ? raw.split(",").pop() || "" : raw, filename };
}

export function extractWahaMessageId(data: unknown) {
  if (!data || typeof data !== "object") return null;
  const payload = data as Record<string, any>;
  return payload.id || payload.key?.id || payload.payload?.id || payload._data?.id?._serialized || null;
}

export async function sendWahaText(params: {
  sessionName: string;
  chatId: string;
  text: string;
  replyTo?: string | null;
}) {
  const body: Record<string, unknown> = {
    session: params.sessionName,
    chatId: toWahaChatId(params.chatId),
    text: params.text,
  };
  if (params.replyTo) body.reply_to = params.replyTo;

  const res = await wahaRequest("/api/sendText", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await readProviderPayload(res);
  return { res, data, body };
}

export async function sendWahaMedia(params: {
  sessionName: string;
  chatId: string;
  type: string;
  file?: string | null;
  caption?: string | null;
  fileName?: string | null;
}) {
  const type = params.type || "document";
  const endpoint =
    type === "image" ? "/api/sendImage" :
    type === "video" ? "/api/sendVideo" :
    type === "audio" || type === "ptt" ? "/api/sendVoice" :
    "/api/sendFile";
  const fallbackMime =
    type === "image" ? "image/jpeg" :
    type === "video" ? "video/mp4" :
    type === "audio" || type === "ptt" ? "audio/ogg" :
    "application/octet-stream";
  const body: Record<string, unknown> = {
    session: params.sessionName,
    chatId: toWahaChatId(params.chatId),
    file: buildWahaFile(params.file, fallbackMime, params.fileName || "arquivo"),
  };
  if (params.caption && endpoint !== "/api/sendVoice") body.caption = params.caption;

  const res = await wahaRequest(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await readProviderPayload(res);
  return { res, data, body, path: endpoint };
}
