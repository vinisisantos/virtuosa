import { costEntryMatchesMonth, normalizeCostReferenceMonth } from '@/lib/cost-reference-month';
import { recurringCostOccurrencesInMonth, resolveRecurringCostsInMonth } from '@/lib/cost-recurrence';

export type ExpenseGroups = Record<string, string>;
export interface ManualCostReference { source: 'fixed' | 'bill'; id: number; }
interface Entry {
  id: number; name: string; value: number; category: string; unit?: string;
  expenseGroups?: ExpenseGroups;
  expenseGroupExclusions?: string[];
}
interface FixedEntry extends Entry {
  date?: string; recurrence?: 'monthly' | 'weekly'; effectiveFrom?: string;
  effectiveTo?: string; seriesId?: string;
}
interface BillEntry extends Entry {
  type: 'fixo' | 'variavel'; refMonth?: string; dueDateManual: string | null;
}
interface CostState<F extends FixedEntry, B extends BillEntry> { fixed: F[]; bills: B[]; }
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const categoryKey = (category: string) => category.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const validUnit = (unit?: string) => ['SBC', 'Osasco', 'SCS'].includes(unit || '');
const eligible = (entry: Entry, unit: string, category: string) => (
  validUnit(unit) && entry.unit === unit && categoryKey(entry.category) === categoryKey(category)
  && categoryKey(category) !== 'produtos'
);

// Only payroll shifts competence. Manual costs use their selected reference, then due date.
export function manualCostMonth(refMonth?: string, dueDate?: string | null): string {
  const month = normalizeCostReferenceMonth(refMonth, Number(dueDate?.slice(0, 4))) || dueDate?.slice(0, 7) || '';
  return MONTH.test(month) ? month : '';
}

export function expenseGroupId(entry: { expenseGroups?: ExpenseGroups }, month: string): string | undefined {
  const id = entry.expenseGroups?.[month];
  return MONTH.test(month) && typeof id === 'string' && id.length > 0 && id.length <= 100 ? id : undefined;
}

export function automaticExpenseGroupKey(unit: string | undefined, category: string, month: string): string | undefined {
  return unit === 'SBC' && MONTH.test(month) && categoryKey(category) && categoryKey(category) !== 'produtos'
    ? JSON.stringify(['category', unit, categoryKey(category), month]) : undefined;
}

export function expenseGroupKey(entry: Entry, month: string): string | undefined {
  const automatic = automaticExpenseGroupKey(entry.unit, entry.category, month);
  if (automatic) return entry.expenseGroupExclusions?.includes(month) ? undefined : automatic;
  const id = expenseGroupId(entry, month);
  return id && validUnit(entry.unit) ? JSON.stringify([entry.unit, categoryKey(entry.category), month, id]) : undefined;
}

function withGroup<T extends Entry>(entry: T, month: string, id?: string): T {
  const expenseGroups = { ...entry.expenseGroups };
  if (id) expenseGroups[month] = id;
  else delete expenseGroups[month];
  const exclusions = new Set(entry.expenseGroupExclusions || []);
  if (id) exclusions.delete(month);
  else if (automaticExpenseGroupKey(entry.unit, entry.category, month)) exclusions.add(month);
  return { ...entry, expenseGroups: Object.keys(expenseGroups).length ? expenseGroups : undefined,
    ...(exclusions.size || entry.expenseGroupExclusions ? { expenseGroupExclusions: exclusions.size ? [...exclusions] : undefined } : {}) };
}

export function groupingCandidates<F extends FixedEntry, B extends BillEntry>(
  state: CostState<F, B>, month: string, unit: string, category: string,
): { target: ManualCostReference; key: string; name: string; date: string; count: number; total: number }[] {
  if (!MONTH.test(month)) return [];
  const [year, monthNumber] = month.split('-').map(Number);
  const fixed = resolveRecurringCostsInMonth(state.fixed, year, monthNumber - 1);
  const entries = [
    ...fixed.map(entry => ({ entry, source: 'fixed' as const })),
    ...state.bills.filter(entry => entry.type === 'fixo' || costEntryMatchesMonth(entry.refMonth, entry.dueDateManual, year, monthNumber - 1))
      .map(entry => ({ entry, source: 'bill' as const })),
  ];
  const groups = new Map<string, ReturnType<typeof groupingCandidates>[number]>();
  for (const { entry, source } of entries) {
    if (!eligible(entry, unit, category)) continue;
    const dates = source === 'fixed' ? recurringCostOccurrencesInMonth(entry, year, monthNumber - 1) : [];
    const total = entry.value * (source === 'fixed' ? dates.length : 1);
    const date = source === 'fixed' ? dates[0] || '' : entry.dueDateManual || '';
    const key = expenseGroupKey(entry, month) || `${source}:${entry.id}`;
    const previous = groups.get(key);
    if (previous) { previous.count++; previous.total = (Math.round(previous.total * 100) + Math.round(total * 100)) / 100; }
    else groups.set(key, { target: { source, id: entry.id }, key, name: entry.name, date, count: 1, total });
  }
  return [...groups.values()];
}

export function appendGroupedBill<F extends FixedEntry, B extends BillEntry>(
  state: CostState<F, B>, bill: B, target: ManualCostReference, newGroupId: string,
): CostState<F, B> {
  const month = manualCostMonth(bill.refMonth, bill.dueDateManual);
  if (bill.type !== 'variavel' || !month) throw new Error('Escolha uma referência válida para agrupar o lançamento único.');
  const candidates = groupingCandidates(state, month, bill.unit || '', bill.category);
  const candidate = candidates.find(item => item.target.source === target.source && item.target.id === target.id);
  const anchor = (target.source === 'fixed' ? state.fixed : state.bills).find(entry => entry.id === target.id);
  if (!anchor || !candidate) {
    throw new Error('A despesa escolhida não está mais disponível nesta categoria, unidade e referência. Selecione novamente.');
  }
  const id = expenseGroupId(anchor, month) || newGroupId;
  if (!id || id.length > 100) throw new Error('Identificação do grupo inválida.');
  return {
    fixed: state.fixed.map(entry => target.source === 'fixed' && entry.id === target.id ? withGroup(entry, month, id) : entry),
    bills: [...state.bills.map(entry => target.source === 'bill' && entry.id === target.id ? withGroup(entry, month, id) : entry), withGroup(bill, month, id)],
  };
}

export function detachExpense<F extends FixedEntry, B extends BillEntry>(
  state: CostState<F, B>, target: ManualCostReference, month: string,
): CostState<F, B> {
  if (!MONTH.test(month)) return state;
  return {
    fixed: state.fixed.map(entry => target.source === 'fixed' && entry.id === target.id ? withGroup(entry, month) : entry),
    bills: state.bills.map(entry => target.source === 'bill' && entry.id === target.id ? withGroup(entry, month) : entry),
  };
}

export function toggleExpenseGrouping<F extends FixedEntry, B extends BillEntry>(
  state: CostState<F, B>, target: ManualCostReference, month: string,
): CostState<F, B> {
  const entry = (target.source === 'fixed' ? state.fixed : state.bills).find(item => item.id === target.id);
  if (!entry || !automaticExpenseGroupKey(entry.unit, entry.category, month) || !entry.expenseGroupExclusions?.includes(month)) {
    return detachExpense(state, target, month);
  }
  const restore = <T extends Entry>(item: T): T => {
    const exclusions = item.expenseGroupExclusions?.filter(value => value !== month);
    return { ...item, expenseGroupExclusions: exclusions?.length ? exclusions : undefined };
  };
  return {
    fixed: state.fixed.map(item => target.source === 'fixed' && item.id === target.id ? restore(item) : item),
    bills: state.bills.map(item => target.source === 'bill' && item.id === target.id ? restore(item) : item),
  };
}

interface DisplayRow {
  id: string | number; source: string; category: string; periodTotal: number;
  raw: Entry;
}
export function groupExpenseRows<T extends DisplayRow>(rows: T[], month: string) {
  const groups = new Map<string, { key: string; grouped: boolean; rows: T[]; total: number }>();
  for (const row of rows) {
    const groupKey = expenseGroupKey(row.raw, month);
    const key = groupKey || `${row.source}:${row.id}`;
    const group = groups.get(key) || { key, grouped: Boolean(groupKey), rows: [], total: 0 };
    group.rows.push(row);
    group.total = (Math.round(group.total * 100) + Math.round(row.periodTotal * 100)) / 100;
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => b.total - a.total);
}
