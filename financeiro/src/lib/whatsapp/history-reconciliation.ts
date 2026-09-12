export const WHATSAPP_WEB_HISTORY_SCHEMA_VERSION = 2 as const;
export const WHATSAPP_WEB_HISTORY_SOURCE = "whatsapp_web_chrome_scs" as const;
export const WHATSAPP_WEB_HISTORY_MAX_ROWS = 500;
export const WHATSAPP_WEB_HISTORY_MAX_WINDOW_MS = 48 * 60 * 60 * 1_000;
export const WHATSAPP_WEB_HISTORY_ORDERING =
  "timestamp asc; same chat and second uses chatOrderIndex desc because WhatsApp collection is newest-first" as const;

export const WHATSAPP_WEB_HISTORY_SUPPORTED_TYPES = [
  "chat",
  "automated_greeting_message",
  "ptt",
  "image",
  "video",
  "document",
  "audio",
  "sticker",
  "revoked",
] as const;

export type WhatsAppWebHistorySupportedType =
  (typeof WHATSAPP_WEB_HISTORY_SUPPORTED_TYPES)[number];

export type WhatsAppHistoryCrmMessageType =
  | "text"
  | "audio"
  | "image"
  | "video"
  | "document"
  | "sticker";

export type WhatsAppHistoryMessageStatus = "delivered" | "sent" | "deleted";

export type WhatsAppWebHistoryRow = {
  chatJid: string;
  phoneJid: string;
  title: string | null;
  contactName: string | null;
  unreadCount: number | null;
  chatOrderIndex: number | null;
  messageId: string;
  timestamp: number;
  fromMe: boolean;
  type: WhatsAppWebHistorySupportedType;
  subtype: string | null;
  body: string | null;
  caption: string | null;
  notifyName: string | null;
  ack: string | number | null;
  isNewMsg: boolean | null;
  duration: number | null;
  mimetype: string | null;
  fileName: string | null;
  size: number | null;
  externalAdReply: unknown | null;
  conversionSource: unknown | null;
  entryPointConversionSource: unknown | null;
};

export type WhatsAppWebHistorySnapshot = {
  schemaVersion: typeof WHATSAPP_WEB_HISTORY_SCHEMA_VERSION;
  source: typeof WHATSAPP_WEB_HISTORY_SOURCE;
  account: string;
  instanceId: string;
  windowFrom: string;
  windowToExclusive: string;
  extractedAt: string;
  ordering: string;
  rows: WhatsAppWebHistoryRow[];
};

export type WhatsAppWebHistorySnapshotExpectation = {
  instanceId: string;
  account?: string;
  source?: typeof WHATSAPP_WEB_HISTORY_SOURCE;
};

type UnknownRecord = Record<string, unknown>;

const SUPPORTED_TYPE_SET = new Set<string>(WHATSAPP_WEB_HISTORY_SUPPORTED_TYPES);
const DIRECT_PHONE_JID_PATTERN = /^\d{7,15}@(c\.us|s\.whatsapp\.net)$/i;
const VALID_CHAT_JID_PATTERN =
  /^\d+(?::\d+)?@(c\.us|s\.whatsapp\.net|lid|hosted\.lid)$/i;
const DIRECT_CHAT_JID_PATTERN = /^([0-9]+)(?::\d+)?@(c\.us|s\.whatsapp\.net)$/i;
const PREFIXED_MESSAGE_ID_PATTERN =
  /^(true|false)_([^_\s]+@(?:c\.us|s\.whatsapp\.net|lid|hosted\.lid|g\.us))_([^\s].*)$/i;
const ACCOUNT_JID_PATTERN = /^\d{7,15}@(c\.us|s\.whatsapp\.net)$/i;
const FORMATTED_ACCOUNT_PATTERN = /^\+?[\d()\s.-]{7,30}$/;

const PREVIEW_BY_TYPE: Record<WhatsAppHistoryCrmMessageType, string> = {
  text: "",
  audio: "🎤 Áudio",
  image: "📷 Imagem",
  video: "🎬 Vídeo",
  document: "📄 Documento",
  sticker: "🏷️ Sticker",
};

function asRecord(value: unknown, label: string): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} deve ser um objeto.`);
  }

  return value as UnknownRecord;
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} deve ser um texto não vazio.`);
  }

  return value.trim();
}

function optionalText(value: unknown, label: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") {
    throw new Error(`${label} deve ser texto ou nulo.`);
  }

  return value;
}

function optionalNonNegativeInteger(value: unknown, label: string): number | null {
  if (value === undefined || value === null) return null;
  const normalized =
    typeof value === "string" && /^\d+$/.test(value.trim())
      ? Number(value.trim())
      : value;
  if (
    typeof normalized !== "number" ||
    !Number.isSafeInteger(normalized) ||
    normalized < 0
  ) {
    throw new Error(`${label} deve ser um inteiro não negativo ou nulo.`);
  }

  return normalized;
}

function optionalBoolean(value: unknown, label: string): boolean | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "boolean") {
    throw new Error(`${label} deve ser booleano ou nulo.`);
  }

  return value;
}

function requiredDate(value: unknown, label: string): Date {
  const milliseconds = dateMilliseconds(value);
  if (milliseconds === null) {
    throw new Error(`${label} deve conter uma data válida.`);
  }

  return new Date(milliseconds);
}

function dateMilliseconds(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const milliseconds = value > 10_000_000_000 ? value : value * 1_000;
    return Number.isFinite(milliseconds) && milliseconds >= 0 ? milliseconds : null;
  }

  if (typeof value !== "string" || !value.trim()) return null;

  if (/^\d+(?:\.\d+)?$/.test(value.trim())) {
    return dateMilliseconds(Number(value));
  }

  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? milliseconds : null;
}

function normalizeTimestamp(value: unknown, label: string): number {
  const milliseconds = dateMilliseconds(value);
  if (milliseconds === null) {
    throw new Error(`${label} deve conter um timestamp válido.`);
  }

  return Math.floor(milliseconds / 1_000);
}

function normalizeJid(value: unknown, label: string): string {
  return requiredText(value, label).toLowerCase();
}

function phoneDigitsFromJid(jid: string): string | null {
  return DIRECT_CHAT_JID_PATTERN.exec(jid)?.[1] || null;
}

function accountComparisonKey(account: string): string {
  const trimmed = account.trim().toLowerCase();
  if (!ACCOUNT_JID_PATTERN.test(trimmed) && !FORMATTED_ACCOUNT_PATTERN.test(trimmed)) {
    throw new Error("Conta do snapshot deve ser um telefone ou JID telefônico válido.");
  }
  const jidDigits = phoneDigitsFromJid(trimmed);
  if (jidDigits) return jidDigits;

  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) {
    throw new Error("Conta do snapshot deve conter entre 7 e 15 dígitos.");
  }
  return digits;
}

function validateAccount(actual: string, expected?: string): void {
  if (!expected) return;

  const expectedText = requiredText(expected, "expected.account");
  if (accountComparisonKey(actual) !== accountComparisonKey(expectedText)) {
    throw new Error("Snapshot não pertence à conta esperada.");
  }
}

function normalizeSupportedType(
  value: unknown,
  label: string,
): WhatsAppWebHistorySupportedType {
  const normalized = requiredText(value, label).toLowerCase();
  if (!SUPPORTED_TYPE_SET.has(normalized)) {
    throw new Error(`${label} não é suportado: ${normalized}.`);
  }

  return normalized as WhatsAppWebHistorySupportedType;
}

function normalizeAck(value: unknown, label: string): string | number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" && typeof value !== "number") {
    throw new Error(`${label} deve ser texto, número ou nulo.`);
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error(`${label} deve ser finito.`);
  }

  return value;
}

function validateJids(chatJid: string, phoneJid: string, label: string): void {
  if (!VALID_CHAT_JID_PATTERN.test(chatJid)) {
    throw new Error(`${label}.chatJid não é uma conversa individual válida.`);
  }
  if (!DIRECT_PHONE_JID_PATTERN.test(phoneJid)) {
    throw new Error(`${label}.phoneJid não é um JID telefônico enviável.`);
  }

  const chatPhone = phoneDigitsFromJid(chatJid);
  const phone = phoneDigitsFromJid(phoneJid);
  if (chatPhone && phone && chatPhone !== phone) {
    throw new Error(`${label} associa chatJid e phoneJid de contatos diferentes.`);
  }
}

function validateMessageIdEnvelope(
  rawMessageId: string,
  chatJid: string,
  fromMe: boolean,
  label: string,
): string {
  const trimmed = rawMessageId.trim();
  const envelope = PREFIXED_MESSAGE_ID_PATTERN.exec(trimmed);
  if (!envelope) return trimmed;

  const envelopeFromMe = envelope[1].toLowerCase() === "true";
  const envelopeJid = envelope[2].toLowerCase();
  if (envelopeFromMe !== fromMe) {
    throw new Error(`${label}.messageId contradiz a direção da mensagem.`);
  }
  if (envelopeJid !== chatJid) {
    throw new Error(`${label}.messageId não pertence ao chatJid informado.`);
  }

  return envelope[3].trim();
}

function normalizeRow(
  value: unknown,
  index: number,
  windowFromMs: number,
  windowToExclusiveMs: number,
): WhatsAppWebHistoryRow {
  const label = `rows[${index}]`;
  const row = asRecord(value, label);
  const chatJid = normalizeJid(row.chatJid, `${label}.chatJid`);
  const phoneJid = normalizeJid(row.phoneJid, `${label}.phoneJid`);
  validateJids(chatJid, phoneJid, label);

  const timestamp = normalizeTimestamp(row.timestamp, `${label}.timestamp`);
  const timestampMs = timestamp * 1_000;
  if (timestampMs < windowFromMs || timestampMs >= windowToExclusiveMs) {
    throw new Error(`${label}.timestamp está fora da janela do snapshot.`);
  }

  if (typeof row.fromMe !== "boolean") {
    throw new Error(`${label}.fromMe deve ser booleano.`);
  }

  const rawMessageId = requiredText(row.messageId, `${label}.messageId`);
  const messageId = validateMessageIdEnvelope(
    rawMessageId,
    chatJid,
    row.fromMe,
    label,
  );
  if (!messageId) {
    throw new Error(`${label}.messageId ficou vazio após a canonicalização.`);
  }

  return {
    chatJid,
    phoneJid,
    title: optionalText(row.title, `${label}.title`),
    contactName: optionalText(row.contactName, `${label}.contactName`),
    unreadCount: optionalNonNegativeInteger(row.unreadCount, `${label}.unreadCount`),
    chatOrderIndex: optionalNonNegativeInteger(row.chatOrderIndex, `${label}.chatOrderIndex`),
    messageId,
    timestamp,
    fromMe: row.fromMe,
    type: normalizeSupportedType(row.type, `${label}.type`),
    subtype: optionalText(row.subtype, `${label}.subtype`),
    body: optionalText(row.body, `${label}.body`),
    caption: optionalText(row.caption, `${label}.caption`),
    notifyName: optionalText(row.notifyName, `${label}.notifyName`),
    ack: normalizeAck(row.ack, `${label}.ack`),
    isNewMsg: optionalBoolean(row.isNewMsg, `${label}.isNewMsg`),
    duration: optionalNonNegativeInteger(row.duration, `${label}.duration`),
    mimetype: optionalText(row.mimetype, `${label}.mimetype`),
    fileName: optionalText(row.fileName, `${label}.fileName`),
    size: optionalNonNegativeInteger(row.size, `${label}.size`),
    externalAdReply: row.externalAdReply ?? null,
    conversionSource: row.conversionSource ?? null,
    entryPointConversionSource: row.entryPointConversionSource ?? null,
  };
}

function rowsDescribeSameMessage(
  first: WhatsAppWebHistoryRow,
  second: WhatsAppWebHistoryRow,
): boolean {
  return first.phoneJid === second.phoneJid &&
    first.messageId === second.messageId &&
    first.timestamp === second.timestamp &&
    first.fromMe === second.fromMe &&
    first.type === second.type &&
    first.body === second.body &&
    first.caption === second.caption;
}

function sortRowsChronologically(rows: WhatsAppWebHistoryRow[]): WhatsAppWebHistoryRow[] {
  return [...rows].sort((first, second) => {
    if (first.timestamp !== second.timestamp) return first.timestamp - second.timestamp;
    if (first.phoneJid === second.phoneJid) {
      const firstOrder = first.chatOrderIndex ?? Number.MAX_SAFE_INTEGER;
      const secondOrder = second.chatOrderIndex ?? Number.MAX_SAFE_INTEGER;
      if (firstOrder !== secondOrder) return secondOrder - firstOrder;
    }
    return first.messageId.localeCompare(second.messageId);
  });
}

function deduplicateRows(rows: WhatsAppWebHistoryRow[]): WhatsAppWebHistoryRow[] {
  const uniqueRows = new Map<string, WhatsAppWebHistoryRow>();
  const phoneByChatJid = new Map<string, string>();

  for (const row of rows) {
    const mappedPhone = phoneByChatJid.get(row.chatJid);
    if (mappedPhone && mappedPhone !== row.phoneJid) {
      throw new Error("O mesmo chatJid foi associado a telefones diferentes.");
    }
    phoneByChatJid.set(row.chatJid, row.phoneJid);

    const key = `${row.phoneJid}\u0000${row.messageId}`;
    const existing = uniqueRows.get(key);

    if (!existing) {
      uniqueRows.set(key, row);
      continue;
    }
    if (row.type === "revoked" && existing.type !== "revoked") {
      uniqueRows.set(key, row);
      continue;
    }
    if (existing.type === "revoked" && row.type !== "revoked") continue;
    if (!rowsDescribeSameMessage(existing, row)) {
      throw new Error("Snapshot contém mensagens conflitantes para o mesmo telefone e ID.");
    }
  }

  return sortRowsChronologically([...uniqueRows.values()]);
}

export function canonicalHistoryMessageId(raw: string): string {
  const trimmed = raw.trim();
  return PREFIXED_MESSAGE_ID_PATTERN.exec(trimmed)?.[3]?.trim() || trimmed;
}

export function historyMessageType(
  type: WhatsAppWebHistorySupportedType | string,
): WhatsAppHistoryCrmMessageType {
  switch (type) {
    case "chat":
    case "automated_greeting_message":
    case "revoked":
      return "text";
    case "ptt":
    case "audio":
      return "audio";
    case "image":
    case "video":
    case "document":
    case "sticker":
      return type;
    default:
      throw new Error(`Tipo histórico do WhatsApp não suportado: ${type}.`);
  }
}

export function historyMessageBody(row: WhatsAppWebHistoryRow): string {
  if (row.type === "revoked") return "Mensagem apagada";

  const content = row.body?.trim() || row.caption?.trim() || "";
  if (content) return content;

  return row.type === "ptt" || row.type === "audio"
    ? "Áudio histórico não recuperado"
    : "";
}

export function historyMessageStatus(
  row: Pick<WhatsAppWebHistoryRow, "fromMe" | "type">,
): WhatsAppHistoryMessageStatus {
  if (row.type === "revoked") return "deleted";
  return row.fromMe ? "sent" : "delivered";
}

export function historyMessagePreview(row: WhatsAppWebHistoryRow): string {
  const body = historyMessageBody(row);
  if (body) return body;

  return PREVIEW_BY_TYPE[historyMessageType(row.type)];
}

export function historyContactName(
  row: Pick<WhatsAppWebHistoryRow, "title" | "contactName" | "notifyName">,
  phone: string,
): string {
  const normalizedPhone = phone.replace(/\D/g, "");

  for (const candidate of [row.contactName, row.title, row.notifyName]) {
    const cleanCandidate = candidate?.replace(/\s+/g, " ").trim();
    if (!cleanCandidate) continue;
    if (normalizedPhone && cleanCandidate.replace(/\D/g, "") === normalizedPhone) continue;
    return cleanCandidate;
  }

  return phone.trim();
}

export function parseWhatsAppWebHistorySnapshot(
  input: unknown,
  expected: WhatsAppWebHistorySnapshotExpectation,
): WhatsAppWebHistorySnapshot {
  const snapshot = asRecord(input, "snapshot");

  if (snapshot.schemaVersion !== WHATSAPP_WEB_HISTORY_SCHEMA_VERSION) {
    throw new Error(`Snapshot deve usar schemaVersion ${WHATSAPP_WEB_HISTORY_SCHEMA_VERSION}.`);
  }

  const expectedSource = expected.source || WHATSAPP_WEB_HISTORY_SOURCE;
  const source = requiredText(snapshot.source, "snapshot.source");
  if (source !== expectedSource || source !== WHATSAPP_WEB_HISTORY_SOURCE) {
    throw new Error(`Snapshot deve ter source ${WHATSAPP_WEB_HISTORY_SOURCE}.`);
  }

  const expectedInstanceId = requiredText(expected.instanceId, "expected.instanceId");
  const instanceId = requiredText(snapshot.instanceId, "snapshot.instanceId");
  if (instanceId !== expectedInstanceId) {
    throw new Error(`Snapshot pertence à instância ${instanceId}, não à instância esperada ${expectedInstanceId}.`);
  }

  const account = requiredText(snapshot.account, "snapshot.account");
  validateAccount(account, expected.account);

  const windowFrom = requiredDate(snapshot.windowFrom, "snapshot.windowFrom");
  const windowToExclusive = requiredDate(
    snapshot.windowToExclusive,
    "snapshot.windowToExclusive",
  );
  const windowDurationMs = windowToExclusive.getTime() - windowFrom.getTime();
  if (windowDurationMs <= 0) {
    throw new Error("A janela do snapshot deve ter início anterior ao fim.");
  }
  if (windowDurationMs > WHATSAPP_WEB_HISTORY_MAX_WINDOW_MS) {
    throw new Error("A janela do snapshot não pode ultrapassar 48 horas.");
  }

  const extractedAt = requiredDate(snapshot.extractedAt, "snapshot.extractedAt");
  const ordering = requiredText(snapshot.ordering, "snapshot.ordering");
  if (ordering !== WHATSAPP_WEB_HISTORY_ORDERING) {
    throw new Error("snapshot.ordering não corresponde à ordenação esperada.");
  }

  if (!Array.isArray(snapshot.rows)) {
    throw new Error("snapshot.rows deve ser uma lista.");
  }
  if (snapshot.rows.length > WHATSAPP_WEB_HISTORY_MAX_ROWS) {
    throw new Error(`snapshot.rows não pode ultrapassar ${WHATSAPP_WEB_HISTORY_MAX_ROWS} itens.`);
  }

  const rows = deduplicateRows(
    snapshot.rows.map((row, index) =>
      normalizeRow(row, index, windowFrom.getTime(), windowToExclusive.getTime()),
    ),
  );

  return {
    schemaVersion: WHATSAPP_WEB_HISTORY_SCHEMA_VERSION,
    source: WHATSAPP_WEB_HISTORY_SOURCE,
    account,
    instanceId,
    windowFrom: windowFrom.toISOString(),
    windowToExclusive: windowToExclusive.toISOString(),
    extractedAt: extractedAt.toISOString(),
    ordering,
    rows,
  };
}
