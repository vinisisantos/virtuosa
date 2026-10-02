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
  },
};

const { NextRequest } = await import('next/server.js');
const { POST, DELETE } = await import('../src/app/api/payroll/vacations/route.ts');

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
    id: 'entry-1', employeeName: 'Ana Teste', employmentType: 'CLT',
    updatedAt: new Date('2026-08-01T10:00:00.000Z'),
    payrollImport: { unit: 'Osasco', competenceMonth: 8, competenceYear: 2026 },
  };
  periods = [];
  imports = [
    { id: 'import-august', entries: [{ id: 'entry-1', employeeName: 'Ana Teste' }] },
    { id: 'import-september', entries: [{ id: 'entry-2', employeeName: 'Ana Teste' }] },
  ];
});

test('salvar férias CLT revisa os pagamentos e as revisões das duas competências', async () => {
  const response = await POST(request('POST', {
    payrollEntryId: 'entry-1', expectedEntryUpdatedAt: entry.updatedAt.toISOString(),
    startDate: '2026-08-20', endDate: '2026-09-08',
    advanceAmount: 0,
  }));
  assert.equal(response.status, 201);
  assert.equal(calls.find(([operation]) => operation === 'vacation.create')[1].data.employeeKey, 'ana teste');
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

test('adiantamento só pode ser abatido após confirmação do lançamento em Custos', async () => {
  const payload = {
    payrollEntryId: 'entry-1', expectedEntryUpdatedAt: entry.updatedAt.toISOString(),
    startDate: '2026-08-20', endDate: '2026-08-30',
    advanceAmount: 1200, advancePaidAt: '2026-08-18',
  };
  const missingCost = await POST(request('POST', payload));
  assert.equal(missingCost.status, 400);
  assert.equal(calls.some(([operation]) => operation === 'vacation.create'), false);
  const recordedCost = await POST(request('POST', { ...payload, advanceRegisteredInCosts: true }));
  assert.equal(recordedCost.status, 201);
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
