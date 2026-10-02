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
let existingBills;
let requestBills;
let linkedPeriods;
let payrollImports;

globalThis.prisma = {
  $transaction: async callback => callback(globalThis.prisma),
  $executeRaw: async (...args) => { calls.push(['executeRaw', args]); return 1; },
  payrollVacation: {
    findMany: async args => { calls.push(['vacation.findMany', args]); return linkedPeriods; },
  },
  payrollImport: {
    findMany: async args => { calls.push(['payrollImport.findMany', args]); return payrollImports; },
  },
  financialBackup: {
    findFirst: async args => {
      calls.push(['findFirst', args]);
      return {
        id: 'backup-1',
        unit: 'Osasco',
        logs: '[]',
        goals: '{}',
        fixed: '[]',
        bills: existingBills,
        isAuto: true,
        updatedAt: new Date('2026-09-12T12:00:00.000Z'),
      };
    },
    updateMany: async args => {
      calls.push(['updateMany', args]);
      return {
        count: args.where.updatedAt.getTime() === new Date('2026-09-12T12:00:00.000Z').getTime()
          ? 1
          : 0,
      };
    },
    create: async args => {
      calls.push(['create', args]);
      return { id: 'backup-new', updatedAt: new Date('2026-09-12T12:01:00.000Z') };
    },
  },
};

const { NextRequest } = await import('next/server.js');
const { GET, POST } = await import('../src/app/api/backup/route.ts');

function request(
  method,
  permissions,
  authenticated = true,
  expectedUpdatedAt = '2026-09-12T12:00:00.000Z',
  { role = 'GERENTE', unit = 'Osasco' } = {},
) {
  return new NextRequest('http://localhost/api/backup', {
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
    ...(method === 'POST' ? {
      body: JSON.stringify({
        logs: [], goals: {}, fixed: [], bills: requestBills, isAuto: true, expectedUpdatedAt,
      }),
    } : {}),
  });
}

beforeEach(() => {
  calls = [];
  existingBills = '[]';
  requestBills = [];
  linkedPeriods = [];
  payrollImports = [];
});

test('backup exige autenticação e permissão financeira antes de consultar', async () => {
  assert.equal((await GET(request('GET', {}, false))).status, 401);
  assert.equal((await GET(request('GET', {}))).status, 403);
  assert.equal(calls.length, 0);
});

test('Análise pode ler o snapshot sem poder sobrescrevê-lo', async () => {
  const getResponse = await GET(request('GET', { finAnalise: true }));
  assert.equal(getResponse.status, 200);
  assert.equal(getResponse.headers.get('cache-control'), 'private, no-store, max-age=0');

  calls = [];
  const postResponse = await POST(request('POST', { finAnalise: true }));
  assert.equal(postResponse.status, 403);
  assert.equal(calls.length, 0);
});

test('administrador global lê o mesmo snapshot canônico usado na gravação', async () => {
  const response = await GET(request(
    'GET',
    { admin: true },
    true,
    '2026-09-12T12:00:00.000Z',
    { role: 'ADMINISTRADOR', unit: 'Todas' },
  ));

  assert.equal(response.status, 200);
  assert.deepEqual(calls[0][1].where, { unit: 'SCS' });
});

test('Custos pode atualizar apenas o snapshot resolvido para a própria unidade', async () => {
  const response = await POST(request('POST', { finCustos: true }));
  assert.equal(response.status, 200);
  assert.equal(calls[0][0], 'findFirst');
  assert.deepEqual(calls[0][1].where, { isAuto: true, unit: 'Osasco' });
  assert.equal(calls[1][0], 'updateMany');
  assert.equal(calls[1][1].where.id, 'backup-1');
  assert.equal(calls[1][1].where.updatedAt.toISOString(), '2026-09-12T12:00:00.000Z');
});

test('backup antigo não sobrescreve atualização de outro dispositivo', async () => {
  const response = await POST(request(
    'POST',
    { finCustos: true },
    true,
    '2026-09-12T11:59:00.000Z',
  ));
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.equal(body.code, 'FINANCIAL_BACKUP_VERSION_CONFLICT');
  assert.equal(body.reloadRequired, true);
  assert.equal(calls[1][0], 'updateMany');
});

test('backup existente exige a versão que originou a edição', async () => {
  const response = await POST(request('POST', { finCustos: true }, true, null));
  const body = await response.json();

  assert.equal(response.status, 428);
  assert.equal(body.code, 'FINANCIAL_BACKUP_VERSION_REQUIRED');
  assert.equal(calls.some(([operation]) => operation === 'updateMany'), false);
});

test('pagar um custo manual de férias invalida a revisão da folha vinculada', async () => {
  const bill = {
    id: 10, name: 'Férias – adiantamento Ana Teste', value: 775.5,
    type: 'variavel', unit: 'Osasco', dueDateManual: '2026-08-18', payments: {},
  };
  existingBills = JSON.stringify([bill]);
  requestBills = [{ ...bill, payments: { '2026-08-18': true } }];
  linkedPeriods = [{
    id: 'vacation-1', unit: 'Osasco', employeeKey: 'ana teste', employeeName: 'Ana Teste',
    startDate: new Date('2026-08-20T00:00:00.000Z'), endDate: new Date('2026-09-08T00:00:00.000Z'),
    advanceAmount: 0, advancePaidAt: null, advanceCostMode: 'manual',
    linkedBackupId: 'backup-1', linkedBillId: 10,
  }];
  payrollImports = [
    { id: 'import-august', competenceMonth: 8, competenceYear: 2026, entries: [{ employeeName: 'Ana Teste', paymentStatus: 'unpaid' }] },
    { id: 'import-september', competenceMonth: 9, competenceYear: 2026, entries: [{ employeeName: 'Ana Teste', paymentStatus: 'unpaid' }] },
  ];

  const response = await POST(request('POST', { finCustos: true }));
  assert.equal(response.status, 200);
  assert.equal(calls.some(([operation]) => operation === 'vacation.findMany'), true);
  assert.equal(calls.some(([operation]) => operation === 'payrollImport.findMany'), true);
  assert.equal(calls.some(([operation]) => operation === 'executeRaw'), true);
});

test('não recalcula folha paga ao tentar alterar pagamento manual de férias em Custos', async () => {
  const bill = {
    id: 10, name: 'Férias – adiantamento Ana Teste', value: 775.5,
    type: 'variavel', unit: 'Osasco', dueDateManual: '2026-08-18', payments: {},
  };
  existingBills = JSON.stringify([bill]);
  requestBills = [{ ...bill, payments: { '2026-08-18': true } }];
  linkedPeriods = [{
    id: 'vacation-1', unit: 'Osasco', employeeKey: 'ana teste', employeeName: 'Ana Teste',
    startDate: new Date('2026-08-20T00:00:00.000Z'), endDate: new Date('2026-09-08T00:00:00.000Z'),
    advanceAmount: 0, advancePaidAt: null, advanceCostMode: 'manual',
    linkedBackupId: 'backup-1', linkedBillId: 10,
  }];
  payrollImports = [{
    id: 'import-august', competenceMonth: 8, competenceYear: 2026,
    entries: [{ employeeName: 'Ana Teste', paymentStatus: 'paid' }],
  }];

  const response = await POST(request('POST', { finCustos: true }));
  const body = await response.json();
  assert.equal(response.status, 409);
  assert.equal(body.code, 'VACATION_PAYROLL_ALREADY_PAID');
  assert.equal(calls.some(([operation]) => operation === 'updateMany'), false);
});
