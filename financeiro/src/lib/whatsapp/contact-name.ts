import { isValidLeadName } from "./lead-name";

type ContactNameMessage = {
  pushName?: unknown;
  senderName?: unknown;
};

function normalizeContactName(value: unknown) {
  const text = typeof value === "string"
    ? value.trim().replace(/\s+/g, " ")
    : "";

  return isValidLeadName(text) ? text : null;
}

export function isGenericWhatsAppContactName(value?: string | null) {
  const normalized = (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

  return (
    normalized === "virtuosa estetica" ||
    normalized.startsWith("clinica virtuosa") ||
    normalized.startsWith("virtuosa sao caetano")
  );
}

export function resolveContactNameFromMessage(
  message: ContactNameMessage,
  phone: string,
  isFromMe: boolean,
) {
  if (isFromMe) return phone;

  return normalizeContactName(message.pushName) ||
    normalizeContactName(message.senderName) ||
    phone;
}

export function shouldUpdateContactName(
  currentName?: string | null,
  nextName?: string | null,
  phone?: string | null,
) {
  const cleanNext = nextName?.trim();
  if (!cleanNext || cleanNext === phone || isGenericWhatsAppContactName(cleanNext)) return false;

  const currentIsPhonePlaceholder = /^\(\d{2}\)\s\d{4,5}-\d{4}$/.test((currentName || "").trim());
  return !currentName ||
    currentName === phone ||
    isGenericWhatsAppContactName(currentName) ||
    currentIsPhonePlaceholder;
}
