export type CostRecurrence = 'monthly' | 'weekly' | 'once';

export interface RecurringCost {
  value: number;
  date?: string;
  recurrence?: Exclude<CostRecurrence, 'once'>;
  effectiveFrom?: string;
  effectiveTo?: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function parseDateKey(value?: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function todayDateKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function previousDateKey(value: string) {
  const date = parseDateKey(value);
  if (!date) return value;
  date.setUTCDate(date.getUTCDate() - 1);
  return toDateKey(date);
}

function clampDay(year: number, month: number, day: number) {
  return Math.min(day, new Date(Date.UTC(year, month + 1, 0)).getUTCDate());
}

function isWithinVersion(date: Date, cost: RecurringCost) {
  const effectiveFrom = parseDateKey(cost.effectiveFrom);
  const effectiveTo = parseDateKey(cost.effectiveTo);
  return (!effectiveFrom || date >= effectiveFrom) && (!effectiveTo || date <= effectiveTo);
}

export function recurringCostOccurrencesInMonth(cost: RecurringCost, year: number, month: number) {
  const monthStart = new Date(Date.UTC(year, month, 1));
  const monthEnd = new Date(Date.UTC(year, month + 1, 0));
  const anchor = parseDateKey(cost.date) || monthStart;
  const recurrence = cost.recurrence || 'monthly';
  const occurrences: string[] = [];

  if (recurrence === 'monthly') {
    if (anchor > monthEnd) return occurrences;
    const occurrence = new Date(Date.UTC(year, month, clampDay(year, month, anchor.getUTCDate())));
    if (occurrence >= anchor && isWithinVersion(occurrence, cost)) occurrences.push(toDateKey(occurrence));
    return occurrences;
  }

  let occurrence = new Date(anchor);
  if (occurrence < monthStart) {
    const jumps = Math.ceil((monthStart.getTime() - occurrence.getTime()) / (7 * DAY_MS));
    occurrence = new Date(occurrence.getTime() + jumps * 7 * DAY_MS);
  }
  while (occurrence <= monthEnd) {
    if (isWithinVersion(occurrence, cost)) occurrences.push(toDateKey(occurrence));
    occurrence = new Date(occurrence.getTime() + 7 * DAY_MS);
  }
  return occurrences;
}

export function recurringCostTotalInMonth(cost: RecurringCost, year: number, month: number) {
  return recurringCostOccurrencesInMonth(cost, year, month).length * cost.value;
}

export function recurringCostsTotalInMonth(costs: RecurringCost[], year: number, month: number) {
  return costs.reduce((total, cost) => total + recurringCostTotalInMonth(cost, year, month), 0);
}

export function recurringCostsTotalInRange(costs: RecurringCost[], startKey: string, endKey: string) {
  const start = parseDateKey(startKey);
  const end = parseDateKey(endKey);
  if (!start || !end || start > end) return 0;

  let total = 0;
  let year = start.getUTCFullYear();
  let month = start.getUTCMonth();
  while (year < end.getUTCFullYear() || (year === end.getUTCFullYear() && month <= end.getUTCMonth())) {
    costs.forEach(cost => {
      const count = recurringCostOccurrencesInMonth(cost, year, month)
        .filter(dateKey => dateKey >= startKey && dateKey <= endKey).length;
      total += count * cost.value;
    });
    month += 1;
    if (month === 12) { month = 0; year += 1; }
  }
  return total;
}
