export const WHATSAPP_CALLBACK_DEFAULT_INTERVAL_MS = 12 * 60 * 60 * 1000;
export const WHATSAPP_CALLBACK_OSASCO_INTERVAL_MS = 24 * 60 * 60 * 1000;

function normalizeUnit(value?: string | null) {
  return (value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("pt-BR");
}

export function whatsAppCallbackIntervalMsForUnit(unit?: string | null) {
  return normalizeUnit(unit) === "osasco"
    ? WHATSAPP_CALLBACK_OSASCO_INTERVAL_MS
    : WHATSAPP_CALLBACK_DEFAULT_INTERVAL_MS;
}

export function whatsAppCallbackIntervalHoursForUnit(unit?: string | null) {
  return whatsAppCallbackIntervalMsForUnit(unit) / (60 * 60 * 1000);
}

export function nextWhatsAppCallbackDueAtForUnit(sentAt: Date, unit?: string | null) {
  return new Date(sentAt.getTime() + whatsAppCallbackIntervalMsForUnit(unit));
}
