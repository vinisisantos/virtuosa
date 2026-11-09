import { saoPauloDateKey } from "#lib/date-filter";
import { normalizeWhatsAppMessageStatus } from "#lib/whatsapp/message-status";
import { chooseOfferedEvaluationSlot } from "#lib/ai-assistant/evaluation-choice-parser";

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
  return chooseOfferedEvaluationSlot(offer.body, reply.body, buildSbcEvaluationOptions(now));
}
