export interface Contact {
  id: string;
  phone: string;
  name?: string | null;
  profilePic?: string | null;
  tags?: unknown;
  unit?: string | null;
}

export interface Conversation {
  id: string;
  instanceId?: string;
  status: string;
  unreadCount: number;
  lastMessage?: string | null;
  lastMessageAt?: string | null;
  updatedAt?: string | null;
  contact: Contact;
  assignedTo?: string | null;
  assignedToName?: string | null;
  resolution?: string | null;
  closedAt?: string | null;
  closedByName?: string | null;
  satisfactionScore?: number | null;
  campaignName?: string | null;
  campaignUrl?: string | null;
  campaignAccountOrigin?: "secondary" | null;
}

export interface Message {
  id: string;
  conversationId?: string;
  messageId?: string;
  body: string;
  type: string;
  mediaUrl?: string | null;
  mediaFileName?: string | null;
  mediaMimeType?: string | null;
  mediaSizeBytes?: number | null;
  quotedMessageId?: string | null;
  quotedMessageBody?: string | null;
  quotedMessageType?: string | null;
  quotedMessageFromMe?: boolean | null;
  fromMe: boolean;
  status: string;
  timestamp: string;
  createdAt?: string;
  respondedBy?: string | null;
  respondedByName?: string | null;
  readOnly?: boolean;
  historySource?: string;
}

// Cada campanha vira uma etiqueta colorida e consistente. Classes Tailwind
// estáticas para o JIT enxergar.
const CAMPAIGN_TAG_STYLES = [
  "bg-rose-500/15 text-rose-600 ring-rose-500/30",
  "bg-amber-500/15 text-amber-700 ring-amber-500/30",
  "bg-emerald-500/15 text-emerald-600 ring-emerald-500/30",
  "bg-sky-500/15 text-sky-600 ring-sky-500/30",
  "bg-violet-500/15 text-violet-600 ring-violet-500/30",
  "bg-fuchsia-500/15 text-fuchsia-600 ring-fuchsia-500/30",
  "bg-teal-500/15 text-teal-600 ring-teal-500/30",
  "bg-orange-500/15 text-orange-600 ring-orange-500/30",
];

export const INBOX_POLL_INTERVAL_MS = 30000;
export const INBOX_INCREMENTAL_FULL_REFRESH_EVERY = 4;
export const INBOX_INITIAL_CONVERSATION_LIMIT = 40;
export const INBOX_FULL_CONVERSATION_LIMIT = 120;

const CONVERSATION_LIST_CACHE_TTL_MS = 5 * 60 * 1000;
const CONVERSATION_LIST_CACHE_LIMIT = 400;
const conversationListMemoryCache = new Map<string, { value: Conversation[]; expiresAt: number }>();

export function readConversationListMemoryCache(key: string) {
  const cached = conversationListMemoryCache.get(key);
  if (!cached) return null;

  if (cached.expiresAt <= Date.now()) {
    conversationListMemoryCache.delete(key);
    return null;
  }

  return cached.value;
}

export function writeConversationListMemoryCache(key: string, value: Conversation[]) {
  conversationListMemoryCache.set(key, {
    value: value.slice(0, CONVERSATION_LIST_CACHE_LIMIT),
    expiresAt: Date.now() + CONVERSATION_LIST_CACHE_TTL_MS,
  });
}

const PROFILE_PIC_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const PROFILE_PIC_NEGATIVE_CACHE_TTL_MS = 15 * 60 * 1000;
const profilePicMemoryCache = new Map<string, { value: string | null; expiresAt: number }>();
const profilePicRequestCache = new Map<string, Promise<string | null>>();

export function normalizeProfilePicCacheKey(url: string) {
  if (typeof window === "undefined") return url;

  try {
    const parsed = new URL(url, window.location.origin);
    parsed.searchParams.delete("refresh");
    return `${parsed.pathname}?${parsed.searchParams.toString()}`;
  } catch {
    return url;
  }
}

export function readProfilePicMemoryCache(key: string) {
  const cached = profilePicMemoryCache.get(key);
  if (!cached) return undefined;

  if (cached.expiresAt <= Date.now()) {
    profilePicMemoryCache.delete(key);
    return undefined;
  }

  return cached.value;
}

export function writeProfilePicMemoryCache(key: string, value: string | null) {
  profilePicMemoryCache.set(key, {
    value,
    expiresAt: Date.now() + (value ? PROFILE_PIC_CACHE_TTL_MS : PROFILE_PIC_NEGATIVE_CACHE_TTL_MS),
  });
}

export function fetchProfilePicCached(url: string, forceRefresh = false) {
  const key = normalizeProfilePicCacheKey(url);

  if (!forceRefresh) {
    const cached = readProfilePicMemoryCache(key);
    if (cached !== undefined) return Promise.resolve(cached);

    const pending = profilePicRequestCache.get(key);
    if (pending) return pending;
  }

  const request = fetch(url, { cache: forceRefresh ? "no-store" : "default" })
    .then((r) => r.json())
    .then((data) => {
      const value = typeof data.profilePicUrl === "string" && data.profilePicUrl
        ? data.profilePicUrl
        : null;
      writeProfilePicMemoryCache(key, value);
      return value;
    })
    .catch(() => {
      writeProfilePicMemoryCache(key, null);
      return null;
    })
    .finally(() => {
      profilePicRequestCache.delete(key);
    });

  profilePicRequestCache.set(key, request);
  return request;
}

function getConversationActivityTime(conversation: Conversation) {
  return Date.parse(conversation.lastMessageAt || conversation.updatedAt || "") || 0;
}

export function sortConversationsByActivity(items: Conversation[]) {
  return [...items].sort((a, b) => getConversationActivityTime(b) - getConversationActivityTime(a));
}

export function mergeConversation(previous: Conversation | undefined, incoming: Conversation) {
  if (!previous) return incoming;

  return {
    ...previous,
    ...incoming,
    contact: {
      ...previous.contact,
      ...incoming.contact,
    },
  };
}

function normalizeConversationSearchText(value?: string | null) {
  return (value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function normalizeConversationSearchDigits(value?: string | null) {
  return (value || "").replace(/\D/g, "");
}

export function conversationMatchesSearch(conversation: Conversation, search: string) {
  const textQuery = normalizeConversationSearchText(search);
  const digitQuery = normalizeConversationSearchDigits(search);
  if (!textQuery && !digitQuery) return true;

  const contactName = normalizeConversationSearchText(conversation.contact?.name);
  const contactPhone = normalizeConversationSearchDigits(conversation.contact?.phone);

  return (
    (!!textQuery && contactName.includes(textQuery)) ||
    (!!digitQuery && contactPhone.includes(digitQuery))
  );
}

export function normalizePipelineStageName(name?: string | null): string {
  return (name || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, "_");
}

export function isScheduledPipelineStageName(name?: string | null): boolean {
  return normalizePipelineStageName(name) === "agendado";
}

export function buildLocalDateTime(date: string, time: string) {
  if (!date || !time) return null;
  const value = new Date(`${date}T${time}:00`);
  return Number.isNaN(value.getTime()) ? null : value.toISOString();
}

export function campaignTagStyle(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return CAMPAIGN_TAG_STYLES[h % CAMPAIGN_TAG_STYLES.length];
}

export function mimeTypeFromDataUrl(value?: string | null) {
  const match = (value || "").match(/^data:([^;,]+)[;,]/);
  return match?.[1] || null;
}

function sizeBytesFromDataUrl(value?: string | null) {
  const base64 = (value || "").split(",")[1];
  if (!base64) return null;
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  const size = Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
  return Number.isFinite(size) ? size : null;
}

function formatFileSize(bytes?: number | null) {
  if (!Number.isFinite(bytes || NaN) || !bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

export function extensionFromMimeType(mimeType?: string | null) {
  const normalized = (mimeType || "").toLowerCase();
  if (normalized.includes("pdf")) return "pdf";
  if (normalized.includes("wordprocessingml") || normalized.includes("msword")) return "doc";
  if (normalized.includes("spreadsheetml") || normalized.includes("excel")) return "xls";
  return normalized.split("/").pop()?.split(";")[0] || "arquivo";
}

export function documentMessageMeta(msg: Message) {
  const mimeType = msg.mediaMimeType || mimeTypeFromDataUrl(msg.mediaUrl) || "application/octet-stream";
  const sizeBytes = msg.mediaSizeBytes ?? sizeBytesFromDataUrl(msg.mediaUrl);
  const extension = extensionFromMimeType(mimeType);
  const fileName = msg.mediaFileName || (extension === "pdf" ? "Documento.pdf" : "Documento");
  return {
    fileName,
    mimeType,
    sizeBytes,
    sizeLabel: formatFileSize(sizeBytes),
    extension: extension.toUpperCase(),
    isPdf: mimeType.toLowerCase().includes("pdf") || fileName.toLowerCase().endsWith(".pdf"),
  };
}
