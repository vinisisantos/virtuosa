import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateVacationPayroll, calculateVacationReceipt } from '../src/lib/payroll-vacation-calculation.ts';

const inss2026 = [
  { limit: 1621, rate: 0.075 },
  { limit: 2902.84, rate: 0.09 },
  { limit: 4354.27, rate: 0.12 },
  { limit: 8475.55, rate: 0.14 },
];

const irrf2026 = {
  simplifiedDeduction: 607.20,
  brackets: [
    { limit: 2428.80, rate: 0, deduction: 0 },
    { limit: 2826.65, rate: 0.075, deduction: 182.16 },
    { limit: 3751.05, rate: 0.15, deduction: 394.16 },
    { limit: 4664.68, rate: 0.225, deduction: 675.49 },
    { limit: null, rate: 0.275, deduction: 908.73 },
  ],
  reduction: {
    fullReliefUpTo: 5000,
    partialReliefUpTo: 7350,
    partialIntercept: 978.62,
    partialRate: 0.133145,
  },
};

const receipt = calculateVacationReceipt({
  startDate: '2026-09-16', endDate: '2026-10-05', baseSalary: 2291.73,
  inssBrackets: inss2026,
});

test('recibo usa os 20 dias completos e calcula a data-limite do adiantamento', () => {
  assert.deepEqual(receipt, {
    startDate: '2026-09-16', endDate: '2026-10-05', paymentDueDate: '2026-09-14',
    totalDays: 20, baseSalary: 2291.73, vacation: 1527.82,
    third: 509.27, inss: 159.02, net: 1878.07,
  });
});

test('folha de setembro aplica 15 dias, prêmio e IRRF simplificado sem somar INSS à dedução', () => {
  const payroll = calculateVacationPayroll({
    receipt, competenceMonth: 9, competenceYear: 2026, baseSalary: 2291.73,
    bonus: 26, transportEnabled: true, actualTransportCost: 68.75,
    advancePaid: true, inssBrackets: inss2026, irrfTable: irrf2026,
  });
  assert.equal(payroll.vacationDays, 15);
  assert.deepEqual(payroll.earnings, {
    salary: 1145.87, vacation: 1145.87, third: 381.95, bonus: 26, total: 2699.69,
  });
  assert.deepEqual(payroll.deductions, {
    transport: 68.75, inssSalary: 92.71, inssVacationRetained: 119.27,
    inssComplement: 4.34, vacationAdvance: 1408.55, irrf: 0, total: 1693.62,
  });
  assert.equal(payroll.inssBase, 2673.69);
  assert.equal(payroll.inssTotal, 216.32);
  assert.equal(payroll.irrfBase, 564.67);
  assert.equal(payroll.irrfDeduction, 'simplified');
  assert.equal(payroll.fgts, 213.90);
  assert.equal(payroll.net, 1006.07);
});

test('folha de outubro apropria 5 dias e fecha os centavos do recibo sem cobrar INSS duas vezes', () => {
  const september = calculateVacationPayroll({
    receipt, competenceMonth: 9, competenceYear: 2026, baseSalary: 2291.73,
    bonus: 26, transportEnabled: true, actualTransportCost: 68.75, advancePaid: true,
    inssBrackets: inss2026, irrfTable: irrf2026,
  });
  const october = calculateVacationPayroll({
    receipt, competenceMonth: 10, competenceYear: 2026, baseSalary: 2291.73,
    bonus: 0, transportEnabled: true, actualTransportCost: null, advancePaid: true,
    inssBrackets: inss2026, irrfTable: irrf2026,
  });
  assert.equal(october.vacationDays, 5);
  assert.equal(october.earnings.salary, 1909.78);
  assert.equal(october.earnings.vacation, 381.95);
  assert.equal(october.earnings.third, 127.32);
  assert.equal(october.deductions.inssVacationRetained, 39.75);
  assert.equal(october.inssTotal, 193.40);
  assert.equal(october.deductions.transport, 114.59);
  assert.equal(october.deductions.vacationAdvance, 469.52);
  assert.equal(october.fgts, 193.52);
  assert.equal(october.net, 1641.54);
  assert.equal(Math.round((september.earnings.vacation + october.earnings.vacation) * 100), Math.round(receipt.vacation * 100));
  assert.equal(Math.round((september.earnings.third + october.earnings.third) * 100), Math.round(receipt.third * 100));
  assert.equal(Math.round((september.deductions.inssVacationRetained
    + october.deductions.inssVacationRetained) * 100), Math.round(receipt.inss * 100));
  assert.equal(Math.round((september.deductions.vacationAdvance
    + october.deductions.vacationAdvance) * 100), Math.round(receipt.net * 100));
  assert.equal(Math.round((october.deductions.inssSalary + october.deductions.inssComplement
    + october.deductions.inssVacationRetained) * 100), Math.round(october.inssTotal * 100));
});

test('não abate férias sem adiantamento efetivamente pago', () => {
  const unpaid = calculateVacationPayroll({
    receipt, competenceMonth: 9, competenceYear: 2026, baseSalary: 2291.73,
    bonus: 26, transportEnabled: true, actualTransportCost: 68.75, advancePaid: false,
    inssBrackets: inss2026, irrfTable: irrf2026,
  });
  assert.equal(unpaid.deductions.vacationAdvance, 0);
  assert.equal(unpaid.deductions.inssVacationRetained, 0);
  assert.equal(unpaid.net, 2414.62);
});

test('tabelas tributárias são entradas da função, sem taxas fixas por ano ou pessoa', () => {
  const alternative = calculateVacationReceipt({
    startDate: '2026-09-16', endDate: '2026-10-05', baseSalary: 2291.73,
    inssBrackets: [{ limit: 10000, rate: 0.10 }],
  });
  assert.equal(alternative.inss, 203.71);
  assert.equal(alternative.net, 1833.38);
  const legalDeductions = calculateVacationPayroll({
    receipt, competenceMonth: 9, competenceYear: 2026, baseSalary: 2291.73,
    bonus: 26, transportEnabled: true, actualTransportCost: null, advancePaid: true, inssBrackets: inss2026,
    irrfTable: irrf2026, otherLegalDeductions: 1000,
  });
  assert.equal(legalDeductions.irrfDeduction, 'legal');
});

test('fecha os centavos mesmo quando o período atravessa três competências', () => {
  const threeMonths = calculateVacationReceipt({
    startDate: '2026-01-31', endDate: '2026-03-01', baseSalary: 1000,
    inssBrackets: inss2026,
  });
  const months = [1, 2, 3].map(month => calculateVacationPayroll({
    receipt: threeMonths, competenceMonth: month, competenceYear: 2026,
    baseSalary: 1000, transportEnabled: false, actualTransportCost: null, advancePaid: true,
    inssBrackets: inss2026, irrfTable: irrf2026,
  }));
  assert.deepEqual(months.map(item => item.vacationDays), [1, 28, 1]);
  for (const [field, total] of [
    ['vacation', threeMonths.vacation], ['third', threeMonths.third],
  ]) {
    assert.equal(Math.round(months.reduce((sum, item) => sum + item.earnings[field], 0) * 100) / 100, total);
  }
  assert.equal(Math.round(months.reduce((sum, item) => sum + item.deductions.vacationAdvance, 0) * 100) / 100,
    threeMonths.net);
});

test('rejeita período impossível e competência fora das férias', () => {
  assert.throws(() => calculateVacationReceipt({
    startDate: '2026-02-30', endDate: '2026-03-05', baseSalary: 1000, inssBrackets: inss2026,
  }), /Data inválida/);
  assert.throws(() => calculateVacationPayroll({
    receipt, competenceMonth: 8, competenceYear: 2026, baseSalary: 2291.73,
    transportEnabled: false, actualTransportCost: null, advancePaid: true, inssBrackets: inss2026, irrfTable: irrf2026,
  }), /não possui dias/);
  assert.throws(() => calculateVacationPayroll({
    receipt: { ...receipt, net: receipt.net + 0.01 },
    competenceMonth: 9, competenceYear: 2026, baseSalary: 2291.73,
    transportEnabled: false, actualTransportCost: null, advancePaid: true, inssBrackets: inss2026, irrfTable: irrf2026,
  }), /Recibo de férias inconsistente/);
});
