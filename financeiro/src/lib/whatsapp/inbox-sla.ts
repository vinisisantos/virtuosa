const MINUTE_MS = 60_000;

export const INBOX_SLA_ATTENTION_AFTER_MINUTES = 5;
export const INBOX_SLA_OVERDUE_AFTER_MINUTES = 15;

export type InboxSlaState = "not_waiting" | "waiting";
export type InboxSlaLevel = "green" | "attention" | "overdue";

export type InboxSlaSnapshot = {
  state: InboxSlaState;
  label: string;
  minutes: number | null;
  level: InboxSlaLevel | null;
};

type InboxSlaInput = {
  lastInboundAt?: Date | string | null;
  lastOutboundAt?: Date | string | null;
  now?: Date;
};

function timestampFrom(value?: Date | string | null) {
  if (!value) return null;
  const timestamp = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function waitingLabel(minutes: number) {
  if (minutes < 1) return "Aguardando agora";
  if (minutes < 60) return `Aguardando há ${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  const hoursLabel = `${hours}h`;
  return remainingMinutes > 0
    ? `Aguardando há ${hoursLabel} ${remainingMinutes} min`
    : `Aguardando há ${hoursLabel}`;
}

export function inboxSlaSnapshot({
  lastInboundAt,
  lastOutboundAt,
  now = new Date(),
}: InboxSlaInput): InboxSlaSnapshot {
  const inboundTimestamp = timestampFrom(lastInboundAt);
  const outboundTimestamp = timestampFrom(lastOutboundAt);

  if (inboundTimestamp === null || (outboundTimestamp !== null && outboundTimestamp >= inboundTimestamp)) {
    return {
      state: "not_waiting",
      label: "Sem espera",
      minutes: null,
      level: null,
    };
  }

  const elapsedMilliseconds = Math.max(0, now.getTime() - inboundTimestamp);
  const minutes = Math.floor(elapsedMilliseconds / MINUTE_MS);
  const level: InboxSlaLevel = elapsedMilliseconds <= INBOX_SLA_ATTENTION_AFTER_MINUTES * MINUTE_MS
    ? "green"
    : elapsedMilliseconds <= INBOX_SLA_OVERDUE_AFTER_MINUTES * MINUTE_MS
      ? "attention"
      : "overdue";

  return {
    state: "waiting",
    label: waitingLabel(minutes),
    minutes,
    level,
  };
}
