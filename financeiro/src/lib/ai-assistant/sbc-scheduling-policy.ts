import { saoPauloDateKey } from "#lib/date-filter";
import { normalizeWhatsAppMessageStatus } from "#lib/whatsapp/message-status";

type Message = { body: string; fromMe: boolean; status: string };

function dateAtNoon(key: string) {
  return new Date(`${key}T12:00:00-03:00`);
}

function addDays(key: string, days: number) {
  const date = dateAtNoon(key);
  date.setUTCDate(date.getUTCDate() + days);
  return saoPauloDateKey(date);
}

export function buildSbcEvaluationOptions(now: Date, days = 7): string[] {
  const first = saoPauloDateKey(now);
  const count = Math.min(7, Math.max(1, Math.floor(days)));
  const slots: string[] = [];
  for (let day = 0; day < count; day += 1) {
    const key = addDays(first, day);
    const weekday = dateAtNoon(key).getUTCDay();
    if (weekday === 0) continue;
    const firstMinute = weekday === 6 ? 8 * 60 : 10 * 60;
    const lastMinute = weekday === 6 ? 13 * 60 : 20 * 60;
    for (let minute = firstMinute; minute <= lastMinute; minute += 30) {
      const time = `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
      if (new Date(`${key}T${time}:00-03:00`).getTime() > now.getTime()) slots.push(`${key}T${time}`);
    }
  }
  return slots;
}

export function schedulingSuggestionExpiry(texts: string[], now = new Date()): string | null {
  const mentionsSlot = texts.some((text) => /\b\d{1,2}\/\d{1,2}(?:\/\d{4})?\b/u.test(text) && /\b\d{1,2}(?:h|:\d{2})/iu.test(text));
  if (!mentionsSlot) return null;
  const interval = 30 * 60_000;
  return new Date((Math.floor(now.getTime() / interval) + 1) * interval).toISOString();
}

export function isSchedulingSuggestionExpired(usage: unknown, now = new Date()) {
  if (!usage || typeof usage !== "object" || Array.isArray(usage)) return false;
  const value = (usage as Record<string, unknown>).schedulingValidUntil;
  if (typeof value !== "string") return false;
  const expires = Date.parse(value);
  return !Number.isFinite(expires) || expires <= now.getTime();
}

export function validateSbcEvaluationChoice(params: {
  offer: Message;
  reply: Message;
  date: string;
  time: string;
  now: Date;
}) {
  return deriveSbcEvaluationChoice(params) === `${params.date}T${params.time}`;
}

export function deriveSbcEvaluationChoice(params: { offer: Message; reply: Message; now: Date }): string | null {
  const { offer, reply, now } = params;
  const sentStatus = normalizeWhatsAppMessageStatus(offer.status);
  if (!offer.fromMe || reply.fromMe || !sentStatus || !["sent", "delivered", "read", "played"].includes(sentStatus)) return null;
  const normalizedOffer = offer.body.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  if (!/\b(agend\w*|avaliac\w*|horari\w*|vagas?|marcar|prefere|pode ser|tenho)\b/u.test(normalizedOffer)
    || /\b(nao|indisponivel|indisponiveis|cancelad\w*|fechad\w*)\b/u.test(normalizedOffer)) return null;
  if (/\b(?:das|entre)\s+\d/i.test(offer.body)) return null;

  // Uma aceitação genérica só é suficiente quando a oferta tem exatamente uma data e um horário explícitos.
  const dates = [...offer.body.matchAll(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\b/g)];
  const times = [...offer.body.matchAll(/\b(\d{1,2})(?:h(?:(\d{2}))?|:(\d{2}))(?!\d)/gi)];
  if (dates.length !== 1 || !times.length || times.length > 6) return null;
  const [, day, month, year] = dates[0];
  const permitted = buildSbcEvaluationOptions(now);
  const datesInWindow = [...new Set(permitted.map((slot) => slot.slice(0, 10)))].filter((key) => {
    const [candidateYear, candidateMonth, candidateDay] = key.split("-");
    return candidateMonth === month.padStart(2, "0") && candidateDay === day.padStart(2, "0") && (!year || year === candidateYear);
  });
  if (datesInWindow.length !== 1) return null;
  const offeredTimes = times.map(([, hour, minutesH, minutesColon]) => `${hour.padStart(2, "0")}:${minutesH || minutesColon || "00"}`);
  const normalizedReply = reply.body.trim().normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  if (/[?]/u.test(normalizedReply)) return null;
  const replyTimes = [...normalizedReply.matchAll(/\b(\d{1,2})(?:h(?:(\d{2}))?|:(\d{2}))(?!\d)/gi)];
  if (replyTimes.length > 1) return null;
  const replyWithoutTime = normalizedReply.replace(/\b\d{1,2}(?:h(?:\d{2})?|:\d{2})(?!\d)/gi, "").replace(/\bas\b/gu, "").replace(/[,.!\s]+/gu, " ").trim();
  const affirmative = /^(sim|pode|pode ser|pode sim|sim pode|sim pode ser|ok|certo|combinado|confirmo|fechado|ta bom|esta bom)$/u.test(replyWithoutTime);
  if (!affirmative && !(replyTimes.length === 1 && !replyWithoutTime)) return null;
  if (times.length > 1 && replyTimes.length !== 1) return null;
  const [, hour, minutesH, minutesColon] = replyTimes[0] || times[0];
  const chosenTime = `${hour.padStart(2, "0")}:${minutesH || minutesColon || "00"}`;
  const result = `${datesInWindow[0]}T${chosenTime}`;
  return offeredTimes.includes(chosenTime) && permitted.includes(result) ? result : null;
}
