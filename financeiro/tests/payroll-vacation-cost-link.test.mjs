import assert from 'node:assert/strict';
import test from 'node:test';
import { findManualVacationCostMatches } from '../src/lib/payroll-vacation-cost-link.ts';

test('vincula somente despesa manual de férias da pessoa, unidade, mês e valor exatos', () => {
  const bills = [
    { id: 1, name: 'Férias – adiantamento Letícia', value: 1878.07, type: 'variavel', unit: 'SBC', dueDateManual: '2026-09-14', payments: { '2026-09-14': true } },
    { id: 2, name: 'Férias – adiantamento Letícia', value: 1878.07, type: 'variavel', unit: 'Osasco', dueDateManual: '2026-09-14' },
    { id: 3, name: 'Férias – adiantamento Letícia', value: 1800, type: 'variavel', unit: 'SBC', dueDateManual: '2026-09-14' },
    { id: 4, name: 'Férias – adiantamento Ana', value: 1878.07, type: 'variavel', unit: 'SBC', dueDateManual: '2026-09-14' },
  ];
  assert.deepEqual(findManualVacationCostMatches([{ id: 'backup-1', bills: JSON.stringify(bills) }], {
    unit: 'SBC', employeeName: 'Letícia Máximo', netAmount: 1878.07, paymentMonth: '2026-09',
  }), [{ backupId: 'backup-1', billId: 1, name: 'Férias – adiantamento Letícia', date: '2026-09-14', paid: true }]);
});

test('dados de custo inválidos não autorizam abatimento ou vínculo', () => {
  assert.deepEqual(findManualVacationCostMatches([{ id: 'broken', bills: 'não é JSON' }], {
    unit: 'SBC', employeeName: 'Letícia', netAmount: 1878.07, paymentMonth: '2026-09',
  }), []);
});
