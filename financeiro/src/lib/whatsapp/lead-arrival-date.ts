const SAO_PAULO_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export type LeadArrivalDates = {
  arrivedAt?: Date | string | null;
  createdAt: Date | string;
};

function validDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function leadArrivalMatchesEventDay(client: LeadArrivalDates, eventAt: Date | string) {
  const arrivalAt = validDate(client.arrivedAt) || validDate(client.createdAt);
  const eventDate = validDate(eventAt);
  if (!arrivalAt || !eventDate) return false;
  return SAO_PAULO_DAY.format(arrivalAt) === SAO_PAULO_DAY.format(eventDate);
}
