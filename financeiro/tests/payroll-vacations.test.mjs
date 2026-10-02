import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { calculateVacationImpact, vacationCompetences } from '../src/lib/payroll-vacations.ts';
import { AUTOMATIC_TRANSPORT_LABEL, calculatePayrollLegalFigures, calculatePayrollTotal } from '../src/lib/payroll-adjustments.ts';

function period(overrides = {}) {
  return {
    id: 'period-1', unit: 'SBC', employeeKey: 'ana', employeeName: 'Ana',
    startDate: new Date('2026-08-20T00:00:00.000Z'),
    endDate: new Date('2026-09-08T00:00:00.000Z'),
    advanceAmount: 2000, advancePaidAt: new Date('2026-08-18T00:00:00.000Z'),
    updatedAt: new Date('2026-08-10T00:00:00.000Z'),
    ...overrides,
  };
}

test('divide férias e adiantamento entre duas competências sem duplicar dias ou centavos', () => {
  const vacation = period();
  assert.deepEqual(vacationCompetences(vacation), [
    { month: 8, year: 2026 }, { month: 9, year: 2026 },
  ]);
  const august = calculateVacationImpact([vacation], 8, 2026, 3000);
  const september = calculateVacationImpact([vacation], 9, 2026, 3000);
  assert.equal(august.days, 12);
  assert.equal(september.days, 8);
  assert.equal(august.salaryPortion, 1200);
  assert.equal(september.salaryPortion, 800);
  assert.equal(august.third, 400);
  assert.equal(september.third, 266.67);
  assert.equal(august.advanceDeduction + september.advanceDeduction, 2000);
});

test('férias CLT acrescentam 1/3 às bases de INSS/FGTS e abatem o adiantamento no líquido', () => {
  const vacation = calculateVacationImpact([period({
    startDate: new Date('2026-08-15T00:00:00.000Z'),
    endDate: new Date('2026-08-24T00:00:00.000Z'),
    advanceAmount: 100,
  })], 8, 2026, 1000);
  const entry = { netSalary: 1000, baseSalary: 1000, employmentType: 'CLT', hasFgts: true, vacation };
  const legal = calculatePayrollLegalFigures(entry);
  assert.equal(legal.vacationDays, 10);
  assert.equal(legal.vacationSalary, 333.33);
  assert.equal(legal.workedSalary, 666.67);
  assert.equal(legal.vacationThird, 111.11);
  assert.equal(legal.grossSalary, 1111.11);
  assert.equal(legal.inss, 83.33);
  assert.equal(legal.vacationAdvanceDeduction, 100);
  assert.equal(calculatePayrollTotal(entry), 927.78);

  const pj = { ...entry, employmentType: 'PJ' };
  assert.equal(calculatePayrollTotal(pj), 1000);
  assert.equal(calculatePayrollLegalFigures(pj).fgts, 0);
});

test('férias fora da competência não alteram a folha', () => {
  const impact = calculateVacationImpact([period()], 10, 2026, 3000);
  assert.deepEqual(impact, {
    days: 0, salaryPortion: 0, workedSalary: 3000, third: 0, advanceDeduction: 0,
  });
});

test('vale-transporte automático cai com os dias de férias; desconto manual permanece integral', () => {
  const vacation = calculateVacationImpact([period({
    startDate: new Date('2026-08-01T00:00:00.000Z'),
    endDate: new Date('2026-08-10T00:00:00.000Z'),
    advanceAmount: 0,
  })], 8, 2026, 3000);
  const base = { netSalary: 3000, baseSalary: 3000, employmentType: 'CLT', vacation };
  const automatic = { kind: 'transport', direction: 'debit', label: AUTOMATIC_TRANSPORT_LABEL, amount: 180, quantity: null };
  const manual = { kind: 'transport', direction: 'debit', label: 'Vale transporte extra', amount: 180, quantity: null };
  assert.equal(calculatePayrollTotal({ ...base, adjustments: [automatic] }), calculatePayrollTotal(base) - 120);
  assert.equal(calculatePayrollTotal({ ...base, adjustments: [manual] }), calculatePayrollTotal(base) - 180);
});

test('migração de férias cria a tabela sem duplicar no segundo deploy', async () => {
  const database = new PGlite();
  try {
    const sql = readFileSync(new URL('../prisma/migrations/20261002120000_payroll_vacations/migration.sql', import.meta.url), 'utf8');
    await database.exec(sql);
    await database.exec(sql);
    const result = await database.query('SELECT COUNT(*)::int AS total FROM "PayrollVacation"');
    assert.equal(result.rows[0].total, 0);
  } finally {
    await database.close();
  }
});
