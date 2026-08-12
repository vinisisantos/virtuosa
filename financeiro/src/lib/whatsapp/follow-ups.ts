export const WHATSAPP_FOLLOW_UP_STATUS_SCHEDULED = "scheduled";
export const WHATSAPP_FOLLOW_UP_STATUS_COMPLETED = "completed";
export const WHATSAPP_FOLLOW_UP_STATUS_CANCELLED = "cancelled";
export const WHATSAPP_FOLLOW_UP_TIME_ZONE = "America/Sao_Paulo";

const SAO_PAULO_OFFSET = "-03:00";
const MAX_FOLLOW_UP_NOTE_LENGTH = 500;
const MAX_FOLLOW_UP_DISTANCE_MS = 366 * 24 * 60 * 60 * 1000;

export type WhatsAppFollowUpShortcut =
  | "one_hour"
  | "three_hours"
  | "tomorrow_morning"
  | "tomorrow_afternoon"
  | "next_monday";

export function normalizeWhatsAppFollowUpNote(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\r\n/g, "\n").slice(0, MAX_FOLLOW_UP_NOTE_LENGTH);
}

export function parseWhatsAppFollowUpDateTime(date: unknown, time: unknown) {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (typeof time !== "string" || !/^\d{2}:\d{2}$/.test(time)) return null;

  const parsed = new Date(`${date}T${time}:00${SAO_PAULO_OFFSET}`);
  if (Number.isNaN(parsed.getTime())) return null;
  const normalized = saoPauloParts(parsed);
  return normalized.date === date && normalized.time === time ? parsed : null;
}

export function validateWhatsAppFollowUpSchedule(params: {
  date: unknown;
  time: unknown;
  note: unknown;
  now?: Date;
}) {
  const scheduledAt = parseWhatsAppFollowUpDateTime(params.date, params.time);
  const note = normalizeWhatsAppFollowUpNote(params.note);
  const now = params.now || new Date();

  if (!scheduledAt) return { error: "Informe uma data e um horário válidos" } as const;
  if (scheduledAt.getTime() <= now.getTime()) {
    return { error: "O retorno precisa ser agendado para um horário futuro" } as const;
  }
  if (scheduledAt.getTime() - now.getTime() > MAX_FOLLOW_UP_DISTANCE_MS) {
    return { error: "O retorno pode ser agendado com até um ano de antecedência" } as const;
  }
  if (note.length < 3) {
    return { error: "Informe uma observação breve sobre o motivo do retorno" } as const;
  }

  return { scheduledAt, note } as const;
}

function saoPauloParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: WHATSAPP_FOLLOW_UP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour === "24" ? "00" : values.hour}:${values.minute}`,
  };
}

function addCalendarDays(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

export function whatsAppFollowUpShortcutInput(
  shortcut: WhatsAppFollowUpShortcut,
  now = new Date(),
) {
  if (shortcut === "one_hour" || shortcut === "three_hours") {
    return saoPauloParts(new Date(now.getTime() + (shortcut === "one_hour" ? 1 : 3) * 60 * 60 * 1000));
  }

  const today = saoPauloParts(now).date;
  if (shortcut === "tomorrow_morning") return { date: addCalendarDays(today, 1), time: "09:00" };
  if (shortcut === "tomorrow_afternoon") return { date: addCalendarDays(today, 1), time: "14:00" };

  const todayAtNoon = new Date(`${today}T12:00:00${SAO_PAULO_OFFSET}`);
  const daysUntilNextMonday = ((8 - todayAtNoon.getDay()) % 7) || 7;
  return { date: addCalendarDays(today, daysUntilNextMonday), time: "09:00" };
}

export function whatsAppFollowUpInputFromDate(value: Date) {
  return saoPauloParts(value);
}

export function isWhatsAppFollowUpDue(
  followUp?: { status?: string | null; scheduledAt?: Date | string | null } | null,
  now = new Date(),
) {
  if (!followUp || followUp.status !== WHATSAPP_FOLLOW_UP_STATUS_SCHEDULED || !followUp.scheduledAt) return false;
  return new Date(followUp.scheduledAt).getTime() <= now.getTime();
}
