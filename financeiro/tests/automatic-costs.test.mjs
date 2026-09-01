import assert from 'node:assert/strict';
import test from 'node:test';
import {
  automaticPayrollPaymentTotals,
  canAccessAutomaticCosts,
  canAccessOrders,
  canApproveOrderChanges,
  canDeleteOrderHistory,
  canManageAutomaticCosts,
  canManageOrderCostRecognition,
  canViewOrderHistory,
  costRecognitionDateKey,
  parseCostRecognitionDate,
  parseCostsPeriod,
  previousCompetence,
  utcMonthRange,
  validateCostRecognitionTarget,
  validateRecognizedOrderMutation,
} from '../src/lib/automatic-costs.ts';

test('classifica salário e FGTS juntos como pagos ou pendentes', () => {
  assert.deepEqual(
    automaticPayrollPaymentTotals({ salary: 2500, fgts: 200, paymentStatus: 'paid' }),
    {
      paidTotal: 2700,
      pendingTotal: 0,
      paidSalaryTotal: 2500,
      pendingSalaryTotal: 0,
      paidFgtsTotal: 200,
      pendingFgtsTotal: 0,
    },
  );
  assert.deepEqual(
    automaticPayrollPaymentTotals({ salary: 2500, fgts: 200, paymentStatus: 'unpaid' }),
    {
      paidTotal: 0,
      pendingTotal: 2700,
      paidSalaryTotal: 0,
      pendingSalaryTotal: 2500,
      paidFgtsTotal: 0,
      pendingFgtsTotal: 200,
    },
  );
});

test('libera somente administrador ou permissões financeiras previstas', () => {
  assert.equal(canAccessAutomaticCosts({ isAdmin: true }), true);
  assert.equal(canAccessAutomaticCosts({ isAdmin: false, permissions: { admin: true } }), true);
  assert.equal(canAccessAutomaticCosts({ isAdmin: false, permissions: { financeiro: true } }), true);
  assert.equal(canAccessAutomaticCosts({ isAdmin: false, permissions: { finCustos: true } }), true);
  assert.equal(canAccessAutomaticCosts({ isAdmin: false, permissions: { finAnalise: true } }), true);
  assert.equal(canAccessAutomaticCosts({ isAdmin: false, permissions: { pedidos: true } }), false);
  assert.equal(canManageAutomaticCosts({ isAdmin: true }), true);
  assert.equal(canManageAutomaticCosts({ isAdmin: false, permissions: { financeiro: true } }), true);
  assert.equal(canManageAutomaticCosts({ isAdmin: false, permissions: { finCustos: true } }), true);
  assert.equal(canManageAutomaticCosts({ isAdmin: false, permissions: { finAnalise: true } }), false);
  assert.equal(canManageOrderCostRecognition({ isAdmin: true }), true);
  assert.equal(canManageOrderCostRecognition({ isAdmin: false, permissions: { pedidos: true, finCustos: true } }), true);
  assert.equal(canManageOrderCostRecognition({ isAdmin: false, permissions: { pedidos: true, financeiro: true } }), true);
  assert.equal(canManageOrderCostRecognition({ isAdmin: false, permissions: { finCustos: true } }), false);
  assert.equal(canManageOrderCostRecognition({ isAdmin: false, permissions: { pedidos: true, finAnalise: true } }), false);
});

test('separa permissões de acesso, aprovação e histórico de pedidos', () => {
  assert.equal(canAccessOrders({ isAdmin: false, permissions: { pedidos: true } }), true);
  assert.equal(canAccessOrders({ isAdmin: false, permissions: { finCustos: true } }), false);
  assert.equal(canApproveOrderChanges({ isAdmin: false, permissions: { pedidosAprovar: true } }), true);
  assert.equal(canApproveOrderChanges({ isAdmin: false, permissions: { pedidos: true } }), false);
  assert.equal(canViewOrderHistory({ isAdmin: false, permissions: { pedidosHistorico: true } }), true);
  assert.equal(canDeleteOrderHistory({ isAdmin: false, permissions: { pedidosExcluirHistorico: true } }), true);
});

test('valida período e resolve dezembro no ano anterior para custos de janeiro', () => {
  assert.deepEqual(parseCostsPeriod('1', '2027'), { month: 1, year: 2027 });
  assert.equal(parseCostsPeriod('13', '2027'), null);
  assert.equal(parseCostsPeriod('1.5', '2027'), null);
  assert.deepEqual(previousCompetence({ month: 1, year: 2027 }), { month: 12, year: 2026 });
  assert.deepEqual(previousCompetence({ month: 9, year: 2026 }), { month: 8, year: 2026 });
});

test('gera intervalo mensal exclusivo no limite superior', () => {
  const september = utcMonthRange({ month: 9, year: 2026 });
  assert.equal(september.start.toISOString(), '2026-09-01T00:00:00.000Z');
  assert.equal(september.end.toISOString(), '2026-10-01T00:00:00.000Z');

  const december = utcMonthRange({ month: 12, year: 2026 });
  assert.equal(december.end.toISOString(), '2027-01-01T00:00:00.000Z');
});

test('normaliza data civil sem deslocá-la e aceita remoção explícita', () => {
  const parsed = parseCostRecognitionDate('2026-09-01');
  assert.equal(parsed.valid, true);
  assert.equal(parsed.value?.toISOString(), '2026-09-01T00:00:00.000Z');
  assert.deepEqual(parseCostRecognitionDate(null), { valid: true, value: null });
  assert.equal(parseCostRecognitionDate('2026-02-30').valid, false);
  assert.equal(parseCostRecognitionDate('2026-09-01T00:00:00-03:00').valid, false);
  assert.equal(parseCostRecognitionDate(undefined).valid, false);
  assert.equal(
    costRecognitionDateKey(new Date('2026-09-01T00:00:00.000Z')),
    costRecognitionDateKey(new Date('2026-09-01T12:00:00.000Z')),
  );
  assert.equal(costRecognitionDateKey(null), null);
});

test('permite remover custo mesmo após cancelamento ou perda do valor', () => {
  assert.equal(validateCostRecognitionTarget({ recognizing: false, totalPrice: null, status: 'Cancelado' }), null);
  assert.match(
    validateCostRecognitionTarget({ recognizing: true, totalPrice: null, status: 'Aguardando' }) || '',
    /valor total/i,
  );
  assert.match(
    validateCostRecognitionTarget({ recognizing: true, totalPrice: 100, status: 'Cancelado' }) || '',
    /cancelados/i,
  );
  assert.equal(validateCostRecognitionTarget({ recognizing: true, totalPrice: 100, status: 'Entregue' }), null);
});

test('preserva custo reconhecido até remoção explícita do vínculo', () => {
  assert.match(validateRecognizedOrderMutation({ isRecognized: true, nextStatus: 'Entregue', nextTotalPrice: 100, deleting: true }) || '', /remova/i);
  assert.match(validateRecognizedOrderMutation({ isRecognized: true, nextStatus: 'Cancelado', nextTotalPrice: 100 }) || '', /cancelá-lo/i);
  assert.match(validateRecognizedOrderMutation({ isRecognized: true, nextStatus: 'Entregue', nextTotalPrice: 0 }) || '', /zerar/i);
  assert.equal(validateRecognizedOrderMutation({ isRecognized: true, nextStatus: 'Entregue', nextTotalPrice: 120 }), null);
  assert.equal(validateRecognizedOrderMutation({ isRecognized: false, nextStatus: 'Cancelado', nextTotalPrice: 0, deleting: true }), null);
});
