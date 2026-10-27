import assert from 'node:assert/strict';
import test from 'node:test';
import { appendGroupedBill, detachExpense, expenseGroupId, groupingCandidates, groupExpenseRows, manualCostMonth, toggleExpenseGrouping } from '../src/lib/cost-expense-groups.ts';
import { previousCompetence } from '../src/lib/automatic-costs.ts';

const fixed = { id: 1, name: 'Marketing mensal', value: 5000, category: 'Marketing', unit: 'Osasco', date: '2026-10-01', recurrence: 'monthly' };
const bill = { id: 2, name: 'Anúncio terça-feira', value: 150.12, category: 'Marketing', unit: 'Osasco', type: 'variavel', dueDateManual: '2026-11-03', refMonth: '2026-10', payments: { '2026-11-03': true } };
const target = { source: 'fixed', id: 1 };
const state = () => ({ fixed: [structuredClone(fixed)], bills: [] });

test('somente folha desloca a competência; contas manuais usam referência selecionada', () => {
  assert.deepEqual(previousCompetence({ month: 1, year: 2027 }), { month: 12, year: 2026 });
  assert.equal(manualCostMonth('2026-10', '2026-11-03'), '2026-10');
  assert.equal(manualCostMonth('outubro', '2026-11-03'), '2026-10');
  assert.equal(manualCostMonth('', '2027-01-03'), '2027-01');
  assert.equal(manualCostMonth('12/2026', '2027-01-03'), '2026-12');
  assert.equal(manualCostMonth('', null), '');
});

test('agrupa em um snapshot preservando referência, data, valores, pagamentos e recorrência', () => {
  const initial = state();
  const result = appendGroupedBill(initial, bill, target, 'grupo-1');
  assert.equal(expenseGroupId(result.fixed[0], '2026-10'), 'grupo-1');
  assert.equal(expenseGroupId(result.bills[0], '2026-10'), 'grupo-1');
  assert.deepEqual(initial, state(), 'não altera o estado anterior');
  assert.deepEqual(result.bills[0], { ...bill, expenseGroups: { '2026-10': 'grupo-1' } });
  assert.deepEqual(result.fixed[0], { ...fixed, expenseGroups: { '2026-10': 'grupo-1' } });
  assert.equal(expenseGroupId(result.fixed[0], '2026-11'), undefined);
});

test('novo lançamento entra no mesmo grupo sem criar recorrência ou duplicar a âncora', () => {
  const first = appendGroupedBill(state(), bill, target, 'grupo-1');
  const second = appendGroupedBill(first, { ...bill, id: 3, value: 10.1 }, target, 'ignorado');
  assert.equal(second.fixed.length, 1);
  assert.equal(second.bills.length, 2);
  assert.equal(expenseGroupId(second.bills[1], '2026-10'), 'grupo-1');
  assert.equal(groupingCandidates(second, '2026-10', 'Osasco', 'Marketing').length, 1);
  const rows = [...second.fixed.map(raw => ({ id: raw.id, source: 'fixed', category: raw.category, periodTotal: raw.value, raw })), ...second.bills.map(raw => ({ id: raw.id, source: 'bill', category: raw.category, periodTotal: raw.value, raw }))];
  const groups = groupExpenseRows(rows, '2026-10');
  assert.equal(groups.length, 1);
  assert.equal(groups[0].total, 5160.22);
  assert.equal(groups[0].rows.length, 3);
  assert.equal(groupExpenseRows(rows.slice(0, 1), '2026-11')[0].grouped, false);
});

for (const [label, overrides] of [
  ['outra unidade', { unit: 'SBC' }],
  ['unidade indefinida', { unit: undefined }],
  ['outra categoria', { category: 'Aluguel' }],
  ['produtos', { category: 'Produtos' }],
  ['recorrência legada', { type: 'fixo' }],
  ['sem referência nem data', { refMonth: '', dueDateManual: null }],
]) test(`rejeita agrupamento incompatível: ${label}`, () => {
  assert.throws(() => appendGroupedBill(state(), { ...bill, ...overrides }, target, 'grupo-1'));
});

test('não agrupa conta de outro mês, âncora excluída nem versão histórica', () => {
  const oneOff = { ...bill, id: 4, refMonth: '2026-09' };
  assert.throws(() => appendGroupedBill({ fixed: [], bills: [oneOff] }, bill, { source: 'bill', id: 4 }, 'grupo-1'));
  assert.throws(() => appendGroupedBill(state(), bill, { source: 'bill', id: 999 }, 'grupo-1'));
  assert.throws(() => appendGroupedBill({ fixed: [{ ...fixed, effectiveTo: '2026-09-30' }], bills: [] }, bill, target, 'grupo-1'));
});

test('desagrupar mantém dinheiro e histórico; remove apenas a associação do mês escolhido', () => {
  const initial = appendGroupedBill(state(), bill, target, 'grupo-1');
  initial.fixed[0].expenseGroups['2026-11'] = 'outro-grupo';
  const result = detachExpense(initial, target, '2026-10');
  assert.deepEqual(result.fixed[0].expenseGroups, { '2026-11': 'outro-grupo' });
  assert.equal(result.fixed[0].value, fixed.value);
  assert.deepEqual(result.bills, initial.bills);
});

test('metadados idênticos nunca misturam unidades, categorias, meses ou ids de fontes diferentes', () => {
  const raw = { ...fixed, expenseGroups: { '2026-10': 'grupo-1' } };
  const rows = [raw, { ...raw, unit: 'SBC' }, { ...raw, category: 'Luz' }].map(raw => ({ id: 1, source: 'fixed', category: raw.category, periodTotal: raw.value, raw }));
  assert.equal(groupExpenseRows(rows, '2026-10').length, 3);
  assert.equal(groupExpenseRows([{ ...rows[0], raw: fixed }, { ...rows[0], source: 'bill', raw: fixed }], '2026-10').length, 2);
});

const display = (entries, source = 'bill') => entries.map(raw => ({ id: raw.id, source, category: raw.category, periodTotal: raw.value, raw }));
test('SBC reúne automaticamente dias diferentes da mesma categoria sem depender de vínculo manual', () => {
  const entries = [
    { ...bill, id: 11, unit: 'SBC', value: 200, dueDateManual: '2026-10-26', refMonth: '' },
    { ...bill, id: 12, unit: 'SBC', value: 500, dueDateManual: '2026-10-27', refMonth: '' },
    { ...bill, id: 13, unit: 'SBC', value: 0.1, expenseGroups: { '2026-10': 'antigo-1' } },
    { ...bill, id: 14, unit: 'SBC', value: 0.2, expenseGroups: { '2026-10': 'antigo-2' } },
  ];
  const before = structuredClone(entries);
  const groups = groupExpenseRows(display(entries), '2026-10');
  assert.equal(groups.length, 1); assert.equal(groups[0].total, 700.3);
  assert.equal(groups[0].rows.length, 4); assert.equal(groups[0].grouped, true);
  assert.deepEqual(entries, before, 'agrupamento não altera dinheiro, datas, pagamento ou ids');
  assert.equal(groupingCandidates({ fixed: [], bills: entries }, '2026-10', 'SBC', 'Marketing').length, 1);
});
test('automático vale para todas as categorias manuais de SBC, não para outras unidades, Produtos ou unidade ausente', () => {
  for (const category of ['Marketing', 'Internet', 'Aluguel', 'Serviços']) {
    const entries = [{ ...bill, unit: 'SBC', category }, { ...bill, id: 9, unit: 'SBC', category: category.toLowerCase() }];
    assert.equal(groupExpenseRows(display(entries), '2026-10').length, 1);
  }
  for (const unit of ['Osasco', 'SCS', undefined]) {
    const entries = [{ ...bill, unit }, { ...bill, id: 9, unit }];
    assert.equal(groupExpenseRows(display(entries), '2026-10').length, 2);
  }
  assert.equal(groupExpenseRows(display([{ ...bill, unit: 'SBC', category: 'Produtos' }, { ...bill, id: 9, unit: 'SBC', category: 'Produtos' }]), '2026-10').length, 2);
});
test('SBC mantém separação explícita após novos gastos, sem apagar dados ou separações de outros meses', () => {
  const entries = [{ ...bill, unit: 'SBC' }, { ...bill, unit: 'SBC', id: 9 }];
  const result = detachExpense({ fixed: [], bills: entries }, { source: 'bill', id: 2 }, '2026-10');
  const rows = display([...result.bills, { ...bill, unit: 'SBC', id: 10 }]);
  const groups = groupExpenseRows(rows, '2026-10');
  assert.equal(groups.length, 2); assert.equal(groups.find(g => !g.grouped).rows[0].id, 2);
  assert.equal(groups.find(g => g.grouped).rows.length, 2);
  assert.deepEqual(result.bills[0].expenseGroupExclusions, ['2026-10']);
  assert.deepEqual(result.bills[0].payments, bill.payments);
  assert.equal(groupExpenseRows(display(result.bills), '2026-11').length, 1);
  const restored = toggleExpenseGrouping(result, { source: 'bill', id: 2 }, '2026-10');
  assert.equal(groupExpenseRows(display(restored.bills), '2026-10').length, 1);
  assert.equal(restored.bills[0].expenseGroupExclusions, undefined);
});
test('SBC agrupa fixo e pontual sem mudar recorrência, respeita categorias, referências e filtros', () => {
  const monthly = { ...fixed, unit: 'SBC' };
  const single = { ...bill, unit: 'SBC' };
  const rows = [...display([monthly], 'fixed'), ...display([single])];
  const groups = groupExpenseRows(rows, '2026-10');
  assert.equal(groups.length, 1); assert.equal(groups[0].total, 5150.12);
  assert.equal(monthly.recurrence, 'monthly'); assert.equal(single.type, 'variavel');
  assert.equal(manualCostMonth(single.refMonth, single.dueDateManual), '2026-10');
  assert.equal(groupExpenseRows(rows.slice(1), '2026-10')[0].total, 150.12);
});

test('aceita categoria canônica, mantém conta semanal e não altera os totais de origem', () => {
  const result = appendGroupedBill({ fixed: [{ ...fixed, recurrence: 'weekly', category: 'Serviços' }], bills: [] }, { ...bill, category: 'servicos' }, target, 'grupo-1');
  assert.equal(result.fixed[0].recurrence, 'weekly');
  assert.equal(result.fixed[0].value + result.bills[0].value, fixed.value + bill.value);
});
