export interface DueDateShortcut {
  label: string;
  date: string;
}

interface DatedCost {
  category?: string;
  date?: string;
  dueDateManual?: string | null;
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

function dateKey(year: number, monthIndex: number, day: number) {
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
}

/** Most recent due day used by an existing cost of the same category, if any. */
export function lastUsedDueDay(costs: DatedCost[], category: string) {
  const normalized = category.trim().toLocaleLowerCase('pt-BR');
  const latest = costs
    .filter(cost => cost.category?.trim().toLocaleLowerCase('pt-BR') === normalized)
    .map(cost => cost.dueDateManual || cost.date || '')
    .filter(date => DATE_KEY.test(date))
    .sort()
    .at(-1);
  return latest ? Number(latest.slice(8, 10)) : null;
}

/** Quick picks for the due date: today, the category's last used day and the end of the viewed month. */
export function dueDateShortcuts(costs: DatedCost[], category: string, year: number, monthIndex: number, today: string): DueDateShortcut[] {
  const shortcuts: DueDateShortcut[] = [{ label: 'Hoje', date: today }];
  const lastDay = lastUsedDueDay(costs, category);
  if (lastDay) shortcuts.push({ label: `Dia ${lastDay} (último usado)`, date: dateKey(year, monthIndex, lastDay) });
  shortcuts.push({ label: 'Fim do mês', date: dateKey(year, monthIndex, 31) });
  return shortcuts.filter((shortcut, index) => shortcuts.findIndex(other => other.date === shortcut.date) === index);
}
