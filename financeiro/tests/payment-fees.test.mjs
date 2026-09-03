import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculatePaymentFee,
  normalizeInstallmentRates,
  splitAmountIntoInstallments,
} from '../src/lib/payment-fees.ts';

test('divide parcelas em centavos sem perder o total', () => {
  assert.deepEqual(splitAmountIntoInstallments(1000, 3), [333.34, 333.33, 333.33]);
});

test('desconta a taxa do líquido quando a clínica absorve', () => {
  assert.deepEqual(calculatePaymentFee({
    baseAmount: 1000,
    installments: 2,
    fixedFee: 1,
    fixedRate: 0.5,
    installmentRate: 4.5,
    feePayer: 'clinic',
  }), {
    baseAmount: 1000,
    chargedAmount: 1000,
    feeAmount: 51,
    netAmount: 949,
    totalRate: 5,
    installmentValues: [500, 500],
  });
});

test('faz gross-up quando a taxa é repassada ao paciente', () => {
  const result = calculatePaymentFee({
    baseAmount: 1000,
    installments: 3,
    fixedFee: 1,
    fixedRate: 0.5,
    installmentRate: 4.5,
    feePayer: 'client',
  });

  assert.equal(result.chargedAmount, 1053.68);
  assert.equal(result.feeAmount, 53.68);
  assert.equal(result.netAmount, 1000);
  assert.deepEqual(result.installmentValues, [351.23, 351.23, 351.22]);
});

test('normaliza apenas taxas válidas de 1x a 18x', () => {
  assert.deepEqual(normalizeInstallmentRates({ 1: '2.5', 12: 9.99999, 19: 4, 2: -1 }), {
    1: 2.5,
    12: 10,
  });
});

test('impede que uma taxa absorvida supere o valor da venda', () => {
  assert.throws(() => calculatePaymentFee({
    baseAmount: 10,
    installments: 1,
    fixedFee: 11,
    fixedRate: 0,
    installmentRate: 0,
    feePayer: 'clinic',
  }), /não pode superar/);
});
