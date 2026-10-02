import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && context.parentURL && existsSync(new URL(`${specifier}.ts`, context.parentURL))) {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier === 'next/server' ? 'next/server.js' : specifier, context);
  },
});

let calls;
let entry;
let periods;
let imports;
let backupSnapshot;

globalThis.prisma = {
  $transaction: async callback => callback(globalThis.prisma),
  $queryRaw: async (...args) => { calls.push(['queryRaw', args]); return []; },
  $executeRaw: async (...args) => { calls.push(['executeRaw', args]); return 1; },
  payrollEntry: {
    findUnique: async args => { calls.push(['entry.findUnique', args]); return entry; },
  },
  payrollImport: {
    findMany: async args => { calls.push(['import.findMany', args]); return imports; },
  },
  payrollVacation: {
    findFirst: async args => { calls.push(['vacation.findFirst', args]); return null; },
    create: async args => {
      calls.push(['vacation.create', args]);
      return { id: 'vacation-1', updatedAt: new Date('2026-08-01T00:00:00.000Z'), ...args.data };
    },
    findUnique: async args => { calls.push(['vacation.findUnique', args]); return periods[0] || null; },
    deleteMany: async args => { calls.push(['vacation.deleteMany', args]); return { count: 1 }; },
    updateMany: async args => { calls.push(['vacation.updateMany', args]); return { count: 1 }; },
  },
  payrollTaxTable: {
    findUnique: async () => ({
      inssBrackets: [{ limit: 1621, rate: 0.075 }, { limit: 2902.84, rate: 0.09 }, { limit: 4354.27, rate: 0.12 }, { limit: 8475.55, rate: 0.14 }],
      irrfTable: { brackets: [{ limit: 2428.8, rate: 0, deduction: 0 }, { limit: null, rate: 0.275, deduction: 908.73 }], simplifiedDeduction: 607.2 },
    }),
  },
  financialBackup: { findFirst: async () => backupSnapshot },
};

const { NextRequest } = await import('next/server.js');
const { POST, PATCH, DELETE } = await import('../src/app/api/payroll/vacations/route.ts');

function request(method, body, query = '', unit = 'Osasco') {
  return new NextRequest(`http://localhost/api/payroll/vacations${query}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': 'user-1',
      'x-user-name': 'Usuário teste',
      'x-user-role': 'GERENTE',
      'x-user-unit': unit,
      'x-user-permissions': JSON.stringify({ financeiro: true }),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

beforeEach(() => {
  calls = [];
  entry = {
    id: 'entry-1', employeeName: 'Ana Teste', employmentType: 'CLT', netSalary: 2291.73, baseSalary: 2291.73,
    hazardPayRate: 0, hazardPayBase: null,
    updatedAt: new Date('2026-08-01T10:00:00.000Z'),
    payrollImport: { unit: 'Osasco', competenceMonth: 8, competenceYear: 2026 },
  };
  periods = [];
  backupSnapshot = null;
  imports = [
    { id: 'import-august', entries: [{ id: 'entry-1', employeeName: 'Ana Teste', paymentStatus: 'unpaid' }] },
    { id: 'import-september', entries: [{ id: 'entry-2', employeeName: 'Ana Teste', paymentStatus: 'unpaid' }] },
  ];
});

test('salvar férias CLT revisa os pagamentos e as revisões das duas competências', async () => {
  const response = await POST(request('POST', {
    payrollEntryId: 'entry-1', expectedEntryUpdatedAt: entry.updatedAt.toISOString(),
    startDate: '2026-08-20', endDate: '2026-09-08',
    confirmCost: true,
  }));
  assert.equal(response.status, 201);
  assert.equal(calls.find(([operation]) => operation === 'vacation.create')[1].data.employeeKey, 'ana teste');
  assert.equal(calls.find(([operation]) => operation === 'vacation.create')[1].data.receipt.totalDays, 20);
  assert.equal(calls.find(([operation]) => operation === 'vacation.create')[1].data.advanceCostMode, 'automatic');
  const importCall = calls.find(([operation]) => operation === 'import.findMany')[1];
  assert.equal(importCall.where.unit, 'Osasco');
  assert.deepEqual(importCall.where.OR, [
    { competenceMonth: 8, competenceYear: 2026 },
    { competenceMonth: 9, competenceYear: 2026 },
  ]);
  assert.equal(calls.filter(([operation]) => operation === 'executeRaw').length, 2);
});

test('não permite férias PJ nem de outra unidade', async () => {
  entry.employmentType = 'PJ';
  const payload = {
    payrollEntryId: 'entry-1', expectedEntryUpdatedAt: entry.updatedAt.toISOString(),
    startDate: '2026-08-20', endDate: '2026-08-30',
  };
  const pj = await POST(request('POST', payload));
  assert.equal(pj.status, 400);
  assert.equal(calls.some(([operation]) => operation === 'vacation.create'), false);
  entry.employmentType = 'CLT';
  const wrongUnit = await POST(request('POST', payload, '', 'SBC'));
  assert.equal(wrongUnit.status, 403);
  assert.equal(calls.some(([operation]) => operation === 'vacation.create'), false);
});

test('recibo e custo exigem confirmação e não aceitam valor manual', async () => {
  const payload = {
    payrollEntryId: 'entry-1', expectedEntryUpdatedAt: entry.updatedAt.toISOString(),
    startDate: '2026-08-20', endDate: '2026-08-30',
  };
  const preview = await POST(request('POST', payload));
  assert.equal(preview.status, 428);
  const previewBody = await preview.json();
  assert.equal(previewBody.receipt.totalDays, 11);
  assert.equal(previewBody.confirmationRequired, true);
  assert.equal(calls.some(([operation]) => operation === 'vacation.create'), false);
  const saved = await POST(request('POST', { ...payload, confirmCost: true }));
  assert.equal(saved.status, 201);
  const manual = await POST(request('POST', { ...payload, advanceAmount: 1200, confirmCost: true }));
  assert.equal(manual.status, 400);
});

test('adiantamento informado como pago no cadastro é salvo para abatimento da folha', async () => {
  const payload = {
    payrollEntryId: 'entry-1', expectedEntryUpdatedAt: entry.updatedAt.toISOString(),
    startDate: '2026-08-20', endDate: '2026-08-30', advanceAlreadyPaid: true,
  };
  const preview = await POST(request('POST', payload));
  const receipt = (await preview.json()).receipt;
  const saved = await POST(request('POST', { ...payload, confirmCost: true }));
  assert.equal(saved.status, 201);
  const period = calls.find(([operation]) => operation === 'vacation.create')[1].data;
  assert.equal(period.advanceAmount, receipt.net);
  assert.equal(period.advancePaidAt.toISOString().slice(0, 10), '2026-08-18');
});

test('despesa manual de férias existente é vinculada sem criar custo automático duplicado', async () => {
  const payload = {
    payrollEntryId: 'entry-1', expectedEntryUpdatedAt: entry.updatedAt.toISOString(),
    startDate: '2026-08-20', endDate: '2026-08-30',
  };
  const preview = await POST(request('POST', payload));
  const receiptNet = (await preview.json()).receipt.net;
  backupSnapshot = {
    id: 'backup-1',
    bills: JSON.stringify([{
      id: 10, name: 'Férias – adiantamento Ana Teste', value: receiptNet,
      type: 'variavel', unit: 'Osasco', dueDateManual: '2026-08-18',
      payments: { '2026-08-18': true },
    }]),
  };
  const response = await POST(request('POST', { ...payload, confirmCost: true }));
  assert.equal(response.status, 201);
  const saved = calls.find(([operation]) => operation === 'vacation.create')[1].data;
  assert.equal(saved.advanceCostMode, 'manual');
  assert.equal(saved.linkedBackupId, 'backup-1');
  assert.equal(saved.linkedBillId, 10);
  assert.equal(saved.advanceAmount, receiptNet);
});

test('folha já paga bloqueia mudança retroativa nas férias', async () => {
  imports[0].entries[0].paymentStatus = 'paid';
  const response = await POST(request('POST', {
    payrollEntryId: 'entry-1', expectedEntryUpdatedAt: entry.updatedAt.toISOString(),
    startDate: '2026-08-20', endDate: '2026-08-30', confirmCost: true,
  }));
  assert.equal(response.status, 409);
  assert.equal(calls.some(([operation]) => operation === 'vacation.create'), false);
});

test('baixa do adiantamento usa o líquido do recibo, nunca valor digitado', async () => {
  periods = [{
    id: 'vacation-1', unit: 'Osasco', employeeKey: 'ana teste', employeeName: 'Ana Teste',
    startDate: new Date('2026-08-20T00:00:00.000Z'),
    endDate: new Date('2026-08-30T00:00:00.000Z'),
    updatedAt: new Date('2026-08-01T11:00:00.000Z'),
    receipt: { net: 775.5 }, advanceAmount: 0, advancePaidAt: null, advanceCostMode: 'automatic',
  }];
  globalThis.prisma.payrollVacation.findUniqueOrThrow = async () => periods[0];
  const response = await PATCH(request('PATCH', {
    id: 'vacation-1', expectedUpdatedAt: periods[0].updatedAt.toISOString(),
    paymentStatus: 'paid', paymentDate: '2026-08-18',
  }));
  assert.equal(response.status, 200);
  const update = calls.find(([operation]) => operation === 'vacation.updateMany')[1];
  assert.equal(update.data.advanceAmount, 775.5);
  assert.equal(update.data.advancePaidAt.toISOString().slice(0, 10), '2026-08-18');
});

test('remoção exige versão da própria férias e recalcula os meses afetados', async () => {
  periods = [{
    id: 'vacation-1', unit: 'Osasco', employeeKey: 'ana teste',
    startDate: new Date('2026-08-20T00:00:00.000Z'),
    endDate: new Date('2026-09-08T00:00:00.000Z'),
    updatedAt: new Date('2026-08-01T11:00:00.000Z'),
  }];
  const response = await DELETE(request(
    'DELETE', null,
    '?id=vacation-1&expectedUpdatedAt=2026-08-01T11%3A00%3A00.000Z',
  ));
  assert.equal(response.status, 200);
  assert.equal(calls.some(([operation]) => operation === 'vacation.deleteMany'), true);
  assert.equal(calls.filter(([operation]) => operation === 'executeRaw').length, 2);
});

test('não remove custo automático de adiantamento já pago', async () => {
  periods = [{
    id: 'vacation-1', unit: 'Osasco', employeeKey: 'ana teste',
    startDate: new Date('2026-08-20T00:00:00.000Z'),
    endDate: new Date('2026-09-08T00:00:00.000Z'),
    updatedAt: new Date('2026-08-01T11:00:00.000Z'),
    advanceCostMode: 'automatic', advancePaidAt: new Date('2026-08-18T00:00:00.000Z'),
  }];
  const response = await DELETE(request(
    'DELETE', null,
    '?id=vacation-1&expectedUpdatedAt=2026-08-01T11%3A00%3A00.000Z',
  ));
  assert.equal(response.status, 409);
  assert.equal(calls.some(([operation]) => operation === 'vacation.deleteMany'), false);
});
