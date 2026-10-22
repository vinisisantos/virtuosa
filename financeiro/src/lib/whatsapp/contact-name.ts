import { isValidLeadName } from "@/lib/whatsapp/lead-name";

type ContactNameMessage = {
  pushName?: unknown;
  senderName?: unknown;
};

function normalizeContactName(value: unknown) {
  // Perfis permitem emoji; remover só a decoração antes de validar o nome
  // preserva a rejeição de telefones, URLs e frases de atendimento.
  const text = typeof value === "string"
    ? value
        .replace(/[\p{Extended_Pictographic}\p{Regional_Indicator}\p{Emoji_Modifier}\u200D\uFE0E\uFE0F\u{E0020}-\u{E007F}]+/gu, " ")
        .trim()
        .replace(/^~+\s*/, "")
        .replace(/\s+/g, " ")
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
