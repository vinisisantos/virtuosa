import assert from 'node:assert/strict';
import test from 'node:test';
import { previewVacationPayroll } from '../src/lib/payroll-vacation-preview.ts';
import { AUTOMATIC_TRANSPORT_LABEL } from '../src/lib/payroll-adjustments.ts';

const leticiaExample = {
  netSalary: 2291.73,
  baseSalary: 2291.73,
  bonus: 26,
  employmentType: 'CLT',
  hasFgts: true,
  hasPenalty: false,
  hazardPayRate: 0,
  hazardPayBase: null,
  adjustments: [{
    kind: 'transport', direction: 'debit', label: AUTOMATIC_TRANSPORT_LABEL,
    quantity: null, amount: 137.50,
  }],
  vacationPeriods: [],
};

test('prévia reproduz o líquido do recibo de setembro após 15 dias e adiantamento informado', () => {
  const preview = previewVacationPayroll(leticiaExample, 9, 2026, '2026-09-01', '2026-09-15', 1408.55);
  assert.ok(preview);
  assert.equal(preview.days, 15);
  assert.equal(preview.inss, 216.32);
  assert.equal(preview.transportDiscount, 68.75);
  assert.equal(preview.bonus, 26);
  assert.equal(preview.advanceDeduction, 1408.55);
  assert.equal(preview.net, 1006.07);
});

test('sem valor antecipado, o período não supõe que férias já foram pagas', () => {
  const preview = previewVacationPayroll(leticiaExample, 9, 2026, '2026-09-01', '2026-09-15', 0);
  assert.ok(preview);
  assert.equal(preview.advanceDeduction, 0);
  assert.equal(preview.net, 2414.62);
});

test('prévia recusa intervalo inválido, sobreposição e PJ', () => {
  assert.equal(previewVacationPayroll(leticiaExample, 9, 2026, '2026-09-31', '2026-10-01', 0), null);
  assert.equal(previewVacationPayroll(leticiaExample, 9, 2026, '2026-08-01', '2026-08-15', 0), null);
  assert.equal(previewVacationPayroll({ ...leticiaExample, employmentType: 'PJ' }, 9, 2026, '2026-09-01', '2026-09-15', 0), null);
  const withPeriod = { ...leticiaExample, vacationPeriods: [{ startDate: '2026-09-10', endDate: '2026-09-20', advanceAmount: 0 }] };
  assert.equal(previewVacationPayroll(withPeriod, 9, 2026, '2026-09-01', '2026-09-15', 0), null);
});
