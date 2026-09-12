import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import {
  isPayrollPaymentStatus,
  resolvePayrollPaymentMutation,
} from '../src/lib/payroll-payment.ts';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && context.parentURL && existsSync(new URL(`${specifier}.ts`, context.parentURL))) {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier === 'next/server' ? 'next/server.js' : specifier, context);
  },
});

let calls;
let currentEntry;
let batchEntries;

function scalarEntry(entry) {
  if (!entry) return null;
  const scalar = { ...entry };
  delete scalar.payrollImport;
  return scalar;
}

globalThis.prisma = {
  $transaction: async callback => callback(globalThis.prisma),
  payrollEntry: {
    findFirst: async args => {
      calls.push(['findFirst', args]);
      const expectedUnit = args.where.payrollImport?.unit;
      if (expectedUnit && currentEntry?.payrollImport.unit !== expectedUnit) return null;
      return currentEntry;
    },
    findMany: async args => {
      calls.push(['findMany', args]);
      return batchEntries;
    },
    updateMany: async args => {
      calls.push(['updateMany', args]);
      if (currentEntry && typeof args.where.id === 'string') Object.assign(currentEntry, args.data);
      return { count: Array.isArray(args.where.id?.in) ? args.where.id.in.length : 1 };
    },
    findUnique: async args => {
      calls.push(['findUnique', args]);
      return scalarEntry(currentEntry);
    },
  },
  activityLog: {
    create: async args => {
      calls.push(['activityLog', args]);
      return { id: 'log-1', ...args.data };
    },
  },
};

const { NextRequest } = await import('next/server.js');
const { PATCH, POST } = await import('../src/app/api/payroll/payment/route.ts');

function request(method, body, {
  unit = 'Osasco',
  role = 'GERENTE',
  permissions = { financeiro: true },
  authenticated = true,
} = {}) {
  return new NextRequest('http://localhost/api/payroll/payment', {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(authenticated ? {
        'x-user-id': 'user-1',
        'x-user-name': 'Usuário teste',
        'x-user-role': role,
        'x-user-unit': unit,
        'x-user-permissions': JSON.stringify(permissions),
      } : {}),
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  calls = [];
  currentEntry = {
    id: 'entry-1',
    payrollImportId: 'import-1',
    employeeName: 'Colaborador teste',
    netSalary: 1000,
    paymentStatus: 'unpaid',
    paymentDate: null,
    payrollImport: {
      id: 'import-1',
      unit: 'Osasco',
      competenceMonth: 8,
      competenceYear: 2026,
    },
  };
  batchEntries = [];
});

test('aceita apenas os status de pagamento da folha', () => {
  assert.equal(isPayrollPaymentStatus('paid'), true);
  assert.equal(isPayrollPaymentStatus('unpaid'), true);
  assert.equal(isPayrollPaymentStatus('review'), true);
  assert.equal(isPayrollPaymentStatus('pending'), false);
  assert.equal(isPayrollPaymentStatus(null), false);
});

test('confirmar pagamento define a data da primeira confirmação', () => {
  const now = new Date('2026-09-12T12:00:00.000Z');
  const mutation = resolvePayrollPaymentMutation({
    currentStatus: 'unpaid',
    currentPaymentDate: null,
    requestedStatus: 'paid',
    now,
  });

  assert.equal(mutation.changed, true);
  assert.equal(mutation.data.paymentStatus, 'paid');
  assert.equal(mutation.data.paymentDate, now);
});

test('repetir confirmação preserva a data original e não gera alteração', () => {
  const originalDate = new Date('2026-09-10T10:00:00.000Z');
  const mutation = resolvePayrollPaymentMutation({
    currentStatus: 'paid',
    currentPaymentDate: originalDate,
    requestedStatus: 'paid',
    now: new Date('2026-09-12T12:00:00.000Z'),
  });

  assert.equal(mutation.changed, false);
  assert.equal(mutation.data.paymentDate, originalDate);
});

test('desfazer pagamento limpa a data e também é idempotente', () => {
  const firstMutation = resolvePayrollPaymentMutation({
    currentStatus: 'paid',
    currentPaymentDate: new Date('2026-09-10T10:00:00.000Z'),
    requestedStatus: 'unpaid',
    now: new Date('2026-09-12T12:00:00.000Z'),
  });
  const repeatedMutation = resolvePayrollPaymentMutation({
    currentStatus: 'unpaid',
    currentPaymentDate: null,
    requestedStatus: 'unpaid',
    now: new Date('2026-09-12T12:00:00.000Z'),
  });

  assert.equal(firstMutation.changed, true);
  assert.equal(firstMutation.data.paymentDate, null);
  assert.equal(repeatedMutation.changed, false);
});

test('corrige status pago sem data sem trocar uma data já válida', () => {
  const now = new Date('2026-09-12T12:00:00.000Z');
  const mutation = resolvePayrollPaymentMutation({
    currentStatus: 'paid',
    currentPaymentDate: null,
    requestedStatus: 'paid',
    now,
  });

  assert.equal(mutation.changed, true);
  assert.equal(mutation.data.paymentDate, now);
});

test('confirmação individual aceita Financeiro e Custos, mas não Análise', async () => {
  const financeResponse = await PATCH(request('PATCH', {
    id: 'entry-1', paymentStatus: 'paid', unit: 'Osasco',
  }));
  assert.equal(financeResponse.status, 200);
  assert.equal(calls.filter(([operation]) => operation === 'updateMany').length, 1);
  assert.equal(calls.filter(([operation]) => operation === 'activityLog').length, 1);

  calls = [];
  currentEntry.paymentStatus = 'unpaid';
  currentEntry.paymentDate = null;
  const costsResponse = await PATCH(request('PATCH', {
    id: 'entry-1', paymentStatus: 'paid', unit: 'Osasco',
  }, { permissions: { finCustos: true } }));
  assert.equal(costsResponse.status, 200);

  calls = [];
  const analysisResponse = await PATCH(request('PATCH', {
    id: 'entry-1', paymentStatus: 'paid', unit: 'Osasco',
  }, { permissions: { finAnalise: true } }));
  assert.equal(analysisResponse.status, 403);
  assert.equal(calls.length, 0);
});

test('confirmação individual filtra e grava pela unidade da relação', async () => {
  const response = await PATCH(request('PATCH', {
    id: 'entry-1', paymentStatus: 'paid', unit: 'Osasco',
  }));

  assert.equal(response.status, 200);
  const read = calls.find(([operation]) => operation === 'findFirst')[1];
  const write = calls.find(([operation]) => operation === 'updateMany')[1];
  assert.equal(read.where.payrollImport.unit, 'Osasco');
  assert.equal(write.where.payrollImport.unit, 'Osasco');
});

test('bloqueia ID de folha pertencente a outra unidade antes de escrever', async () => {
  currentEntry.payrollImport.unit = 'SBC';
  const response = await PATCH(request('PATCH', {
    id: 'entry-1', paymentStatus: 'paid',
  }));

  assert.equal(response.status, 403);
  assert.equal(calls.filter(([operation]) => operation === 'updateMany').length, 0);
  assert.equal(calls.filter(([operation]) => operation === 'activityLog').length, 0);
});

test('repetir o mesmo estado não redata nem duplica auditoria', async () => {
  const originalDate = new Date('2026-09-10T10:00:00.000Z');
  currentEntry.paymentStatus = 'paid';
  currentEntry.paymentDate = originalDate;

  const response = await PATCH(request('PATCH', {
    id: 'entry-1', paymentStatus: 'paid', unit: 'Osasco',
  }));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.changed, false);
  assert.equal(body.paymentDate, originalDate.toISOString());
  assert.equal(calls.filter(([operation]) => operation === 'updateMany').length, 0);
  assert.equal(calls.filter(([operation]) => operation === 'activityLog').length, 0);
});

test('lote misto é abortado se contiver folha de unidade não permitida', async () => {
  batchEntries = [
    {
      id: 'osasco-entry', paymentStatus: 'unpaid', paymentDate: null,
      payrollImport: { id: 'osasco-import', unit: 'Osasco', competenceMonth: 8, competenceYear: 2026 },
    },
    {
      id: 'sbc-entry', paymentStatus: 'unpaid', paymentDate: null,
      payrollImport: { id: 'sbc-import', unit: 'SBC', competenceMonth: 8, competenceYear: 2026 },
    },
  ];

  const response = await POST(request('POST', { ids: ['osasco-entry', 'sbc-entry'] }));

  assert.equal(response.status, 403);
  assert.equal(calls.filter(([operation]) => operation === 'updateMany').length, 0);
  assert.equal(calls.filter(([operation]) => operation === 'activityLog').length, 0);
});
