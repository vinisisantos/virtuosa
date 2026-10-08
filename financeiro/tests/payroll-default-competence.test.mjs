import assert from 'node:assert/strict';
import test from 'node:test';

import { getInitialPayrollCompetence } from '../src/lib/payroll-competence.ts';
import { nextCompetence, previousCompetence } from '../src/lib/automatic-costs.ts';

test('abre a Folha na competência anterior durante o ano', () => {
  assert.deepEqual(
    getInitialPayrollCompetence(new Date(2026, 8, 12, 12)),
    { month: 8, year: 2026 },
  );
});

test('abre dezembro do ano anterior quando o pagamento ocorre em janeiro', () => {
  assert.deepEqual(
    getInitialPayrollCompetence(new Date(2026, 0, 5, 12)),
    { month: 12, year: 2025 },
  );
});

test('o mês exibido na Folha é o do pagamento, enquanto os dados vêm da competência anterior', () => {
  const octoberPayroll = getInitialPayrollCompetence(new Date(2026, 9, 7, 12));
  assert.deepEqual(octoberPayroll, { month: 9, year: 2026 });
  assert.deepEqual(nextCompetence(octoberPayroll), { month: 10, year: 2026 });
  assert.deepEqual(previousCompetence({ month: 10, year: 2026 }), octoberPayroll);
  assert.deepEqual(previousCompetence({ month: 1, year: 2027 }), { month: 12, year: 2026 });
});
