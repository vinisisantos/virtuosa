import assert from 'node:assert/strict';
import test from 'node:test';
import { dueDateShortcuts, lastUsedDueDay } from '../src/lib/cost-due-date-shortcuts.ts';

const costs = [
  { category: 'Internet', dueDateManual: '2026-08-10' },
  { category: ' internet ', date: '2026-09-12' },
  { category: 'Luz', dueDateManual: '2026-10-25' },
  { category: 'Internet', dueDateManual: 'inválida' },
];

test('último dia usado vem da despesa mais recente da mesma categoria', () => {
  assert.equal(lastUsedDueDay(costs, 'Internet'), 12);
  assert.equal(lastUsedDueDay(costs, 'Aluguel'), null);
});

test('atalhos usam o mês visualizado e respeitam o último dia do mês', () => {
  assert.deepEqual(dueDateShortcuts(costs, 'Internet', 2026, 10, '2026-10-22'), [
    { label: 'Hoje', date: '2026-10-22' },
    { label: 'Dia 12 (último usado)', date: '2026-11-12' },
    { label: 'Fim do mês', date: '2026-11-30' },
  ]);
  const february = dueDateShortcuts([{ category: 'Luz', date: '2026-01-31' }], 'Luz', 2026, 1, '2026-02-10');
  assert.deepEqual(february.map(shortcut => shortcut.date), ['2026-02-10', '2026-02-28']);
});
