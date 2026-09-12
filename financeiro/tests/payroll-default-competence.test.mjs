import assert from 'node:assert/strict';
import test from 'node:test';

import { getInitialPayrollCompetence } from '../src/lib/payroll-competence.ts';

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
