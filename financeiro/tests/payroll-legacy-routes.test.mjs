import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';

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

globalThis.prisma = {
  $transaction: async callback => callback(globalThis.prisma),
  $queryRaw: async (...args) => {
    calls.push(['queryRaw', args]);
    return currentEntry ? [{ id: currentEntry.id }] : [];
  },
  $executeRaw: async (...args) => {
    calls.push(['executeRaw', args]);
    return 1;
  },
  payrollEntry: {
    findUnique: async args => {
      calls.push(['findUnique', args]);
      return currentEntry;
    },
    updateMany: async args => {
      calls.push(['updateMany', args]);
      return { count: 1 };
    },
  },
};

const { NextRequest } = await import('next/server.js');
const { POST: toggleFgts } = await import('../src/app/api/payroll/toggle-fgts/route.ts');
const { PATCH: toggleAdvance } = await import('../src/app/api/payroll/toggle-adiantamento/route.ts');
const { PATCH: toggleRecurring } = await import('../src/app/api/payroll/toggle-recurring/route.ts');
const { PATCH: togglePenalty } = await import('../src/app/api/payroll/penalty/route.ts');

function request(path, method, body, {
  unit = 'Osasco',
  role = 'GERENTE',
  permissions = { financeiro: true },
  authenticated = true,
} = {}) {
  return new NextRequest(`http://localhost${path}`, {
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
    netSalary: 1800,
    hasFgts: true,
    hasAdiantamento: false,
    isRecurring: false,
    hasPenalty: false,
    updatedAt: new Date('2026-09-12T11:00:00.000Z'),
    payrollImport: { unit: 'Osasco' },
  };
});

const cases = [
  {
    name: 'FGTS',
    path: '/api/payroll/toggle-fgts',
    method: 'POST',
    handler: toggleFgts,
    field: 'hasFgts',
    value: false,
  },
  {
    name: 'adiantamento',
    path: '/api/payroll/toggle-adiantamento',
    method: 'PATCH',
    handler: toggleAdvance,
    field: 'hasAdiantamento',
    value: true,
  },
  {
    name: 'recorrência',
    path: '/api/payroll/toggle-recurring',
    method: 'PATCH',
    handler: toggleRecurring,
    field: 'isRecurring',
    value: true,
  },
  {
    name: 'multa',
    path: '/api/payroll/penalty',
    method: 'PATCH',
    handler: togglePenalty,
    field: 'hasPenalty',
    value: true,
  },
];

for (const routeCase of cases) {
  test(`${routeCase.name}: bloqueia gravação sem versão do lançamento`, async () => {
    const response = await routeCase.handler(request(
      routeCase.path,
      routeCase.method,
      { id: 'entry-1', [routeCase.field]: routeCase.value },
    ));
    const body = await response.json();

    assert.equal(response.status, 428);
    assert.equal(body.code, 'PAYROLL_VERSION_REQUIRED');
    assert.equal(calls.length, 0);
  });

  test(`${routeCase.name}: grava sob lock, valida unidade e toca a revisão`, async () => {
    const response = await routeCase.handler(request(
      routeCase.path,
      routeCase.method,
      {
        id: 'entry-1',
        [routeCase.field]: routeCase.value,
        expectedUpdatedAt: '2026-09-12T11:00:00.000Z',
      },
    ));
    const body = await response.json();

    assert.equal(response.status, 200);
    const operationNames = calls.map(([operation]) => operation);
    assert.ok(operationNames.indexOf('queryRaw') < operationNames.indexOf('findUnique'));
    assert.ok(operationNames.indexOf('findUnique') < operationNames.indexOf('updateMany'));
    assert.ok(operationNames.indexOf('updateMany') < operationNames.indexOf('executeRaw'));
    const update = calls.find(([operation]) => operation === 'updateMany')[1];
    assert.equal(update.where.payrollImport.unit, 'Osasco');
    assert.equal(update.where.updatedAt.toISOString(), '2026-09-12T11:00:00.000Z');
    assert.equal(update.data[routeCase.field], routeCase.value);
    assert.equal(body.entry?.[routeCase.field] ?? body[routeCase.field], routeCase.value);
  });
}

test('rotas legadas aceitam Financeiro e recusam permissão inexistente ou somente Custos', async () => {
  const payload = {
    id: 'entry-1',
    hasPenalty: true,
    expectedUpdatedAt: '2026-09-12T11:00:00.000Z',
  };

  const legacyResponse = await togglePenalty(request(
    '/api/payroll/penalty', 'PATCH', payload, { permissions: { finFolha: true } },
  ));
  assert.equal(legacyResponse.status, 403);
  assert.equal(calls.length, 0);

  const financeResponse = await togglePenalty(request(
    '/api/payroll/penalty', 'PATCH', payload, { permissions: { financeiro: true } },
  ));
  assert.equal(financeResponse.status, 200);

  calls = [];
  const costsResponse = await togglePenalty(request(
    '/api/payroll/penalty', 'PATCH', payload, { permissions: { finCustos: true } },
  ));
  assert.equal(costsResponse.status, 403);
  assert.equal(calls.length, 0);
});

test('rotas legadas autenticam antes de consultar a folha', async () => {
  const response = await togglePenalty(request(
    '/api/payroll/penalty',
    'PATCH',
    { id: 'entry-1', hasPenalty: true, expectedUpdatedAt: '2026-09-12T11:00:00.000Z' },
    { authenticated: false },
  ));

  assert.equal(response.status, 401);
  assert.equal(calls.length, 0);
});

test('rotas legadas recusam ID de outra unidade antes de escrever', async () => {
  currentEntry.payrollImport.unit = 'SBC';
  const response = await togglePenalty(request('/api/payroll/penalty', 'PATCH', {
    id: 'entry-1',
    hasPenalty: true,
    expectedUpdatedAt: '2026-09-12T11:00:00.000Z',
  }));

  assert.equal(response.status, 403);
  assert.equal(calls.filter(([operation]) => operation === 'updateMany').length, 0);
  assert.equal(calls.filter(([operation]) => operation === 'executeRaw').length, 0);
});

test('rotas legadas retornam 409 quando a fotografia ficou antiga', async () => {
  const response = await togglePenalty(request('/api/payroll/penalty', 'PATCH', {
    id: 'entry-1',
    hasPenalty: true,
    expectedUpdatedAt: '2026-09-12T10:59:59.000Z',
  }));
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.equal(body.code, 'PAYROLL_VERSION_CONFLICT');
  assert.equal(calls.filter(([operation]) => operation === 'updateMany').length, 0);
  assert.equal(calls.filter(([operation]) => operation === 'executeRaw').length, 0);
});

test('repetir o mesmo valor não redata a folha nem publica revisão falsa', async () => {
  const response = await togglePenalty(request('/api/payroll/penalty', 'PATCH', {
    id: 'entry-1',
    hasPenalty: false,
    expectedUpdatedAt: '2026-09-12T11:00:00.000Z',
  }));

  assert.equal(response.status, 200);
  assert.equal(calls.filter(([operation]) => operation === 'updateMany').length, 0);
  assert.equal(calls.filter(([operation]) => operation === 'executeRaw').length, 0);
});
