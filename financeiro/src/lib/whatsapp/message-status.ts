export type WhatsAppMessageStatus = "error" | "pending" | "sent" | "delivered" | "read" | "played" | "deleted";

const STATUS_ALIASES: Record<string, WhatsAppMessageStatus> = {
  "0": "error", ERROR: "error", FAILED: "error", FAIL: "error",
  "1": "pending", PENDING: "pending", SENDING: "pending",
  "2": "sent", SENT: "sent", SERVER_ACK: "sent", SERVER: "sent",
  "3": "delivered", DELIVERED: "delivered", DELIVERY_ACK: "delivered", DEVICE: "delivered",
  "4": "read", READ: "read",
  "5": "played", PLAYED: "played",
  DELETED: "deleted",
};

const STATUS_RANK: Record<string, number> = { pending: 0, sent: 1, delivered: 2, read: 3, played: 4 };
const WAHA_ACK_STATUSES: Record<string, WhatsAppMessageStatus> = {
  "-1": "error", "0": "pending", "1": "sent", "2": "delivered", "3": "read", "4": "played",
};

/** Numeric values follow Evolution/Baileys; WAHA ACK numbers use a separate mapping. */
export function normalizeWhatsAppMessageStatus(value: unknown): WhatsAppMessageStatus | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  return STATUS_ALIASES[String(value).trim().toUpperCase()] || null;
}

export function normalizeWahaMessageAck(ackName: unknown, ack: unknown): WhatsAppMessageStatus | null {
  const named = typeof ackName === "string" ? normalizeWhatsAppMessageStatus(ackName) : null;
  if (named) return named;
  if (typeof ack !== "number" && typeof ack !== "string") return null;
  const value = String(ack).trim();
  if (!/^-?\d+$/.test(value)) return null;
  return WAHA_ACK_STATUSES[value] || null;
}

export function mergeWhatsAppMessageStatus(current: string, incoming: unknown): string {
  const previous = normalizeWhatsAppMessageStatus(current);
  const next = normalizeWhatsAppMessageStatus(incoming);
  if (!next || previous === "deleted") return previous || current;
  if (!previous || next === "deleted") return next;
  // An async failure can invalidate an unconfirmed send, never a delivery/read receipt.
  if (next === "error") return (STATUS_RANK[previous] ?? -1) >= 2 ? previous : next;
  if (previous === "error") return (STATUS_RANK[next] ?? -1) >= 2 ? next : previous;
  return STATUS_RANK[next] >= STATUS_RANK[previous] ? next : previous;
}

/** Applied in the UPDATE itself so simultaneous/late ACKs cannot downgrade a receipt. */
export function whatsAppStatusUpdateFilter(incoming: WhatsAppMessageStatus) {
  return {
    notIn: Object.keys(STATUS_ALIASES).filter((alias) => mergeWhatsAppMessageStatus(alias, incoming) !== incoming),
    mode: "insensitive" as const,
  };
}

export function extractEvolutionStatusUpdate(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const message = value as Record<string, any>;
  // Evolution's messageId is its internal database ID; keyId is the WhatsApp ID.
  const messageId = message.keyId || message.key?.id || message.messageid || message.id;
  const remoteJid = message.remoteJid || message.key?.remoteJid || message.chatid || message.sender;
  const status = normalizeWhatsAppMessageStatus(message.status ?? message.update?.status);
  if (typeof messageId !== "string" || !messageId.trim() || typeof remoteJid !== "string" || !remoteJid.trim() || !status) return null;
  if (remoteJid.includes("@g.us") || remoteJid === "status@broadcast") return null;
  if ((message.fromMe ?? message.key?.fromMe) === false) return null;
  return { messageId, remoteJid, status };
}
