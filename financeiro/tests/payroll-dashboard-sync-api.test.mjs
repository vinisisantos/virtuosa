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
let imports;

globalThis.prisma = {
  payrollImport: {
    findMany: async args => {
      calls.push(args);
      return imports;
    },
  },
};

const { NextRequest } = await import('next/server.js');
const { GET } = await import('../src/app/api/payroll/dashboard-sync/route.ts');

function request({
  query = '',
  userUnit = 'Osasco',
  role = 'GERENTE',
  permissions = { financeiro: true },
  authenticated = true,
} = {}) {
  return new NextRequest(`http://localhost/api/payroll/dashboard-sync${query}`, {
    headers: authenticated ? {
      'x-user-id': 'user-1',
      'x-user-name': 'Usuário teste',
      'x-user-role': role,
      'x-user-unit': userUnit,
      'x-user-permissions': JSON.stringify(permissions),
    } : {},
  });
}

beforeEach(() => {
  calls = [];
  imports = [{
    id: 'import-osasco',
    competenceMonth: 8,
    competenceYear: 2026,
    unit: 'Osasco',
    entries: [{
      netSalary: 1500,
      baseSalary: 1500,
      employmentType: 'PJ',
      hasFgts: false,
      adjustments: [],
    }],
  }];
});

test('filtra no banco pela unidade autenticada do usuário comum', async () => {
  const response = await GET(request());
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(calls[0].where, { unit: 'Osasco' });
  assert.equal(body.data.length, 1);
  assert.equal(body.data[0].unit, 'Osasco');
});

test('não honra visão global para usuário comum', async () => {
  const response = await GET(request({ query: '?unit=all' }));

  assert.equal(response.status, 200);
  assert.deepEqual(calls[0].where, { unit: 'Osasco' });
});

test('nega outra unidade sem consultar o banco', async () => {
  const response = await GET(request({ query: '?unit=SBC' }));

  assert.equal(response.status, 403);
  assert.deepEqual(calls, []);
});

test('permite unidade adicional explicitamente concedida e filtra no banco', async () => {
  imports = [];
  const response = await GET(request({
    query: '?unit=SCS',
    permissions: { financeiro: true, unitSCS: true },
  }));

  assert.equal(response.status, 200);
  assert.deepEqual(calls[0].where, { unit: 'SCS' });
});

test('admin pode consultar todas ou uma unidade específica', async () => {
  const allResponse = await GET(request({
    query: '?unit=all',
    role: 'ADMINISTRADOR',
    permissions: {},
  }));
  assert.equal(allResponse.status, 200);
  assert.equal(calls[0].where, undefined);

  calls = [];
  const unitResponse = await GET(request({
    query: '?unit=SBC',
    role: 'GERENTE',
    permissions: { admin: true },
  }));
  assert.equal(unitResponse.status, 200);
  assert.deepEqual(calls[0].where, { unit: 'SBC' });
});

test('nega usuário sem permissão financeira antes de consultar o banco', async () => {
  const response = await GET(request({ permissions: { finAnalise: true } }));

  assert.equal(response.status, 403);
  assert.deepEqual(calls, []);
});

test('não transforma unidade ausente ou inativa no token em consulta ampla', async () => {
  const missingUnit = await GET(request({ userUnit: '' }));
  assert.equal(missingUnit.status, 403);

  const inactiveUnit = await GET(request({ userUnit: 'Barueri' }));
  assert.equal(inactiveUnit.status, 403);

  assert.deepEqual(calls, []);
});

test('rejeita unidade inválida antes de consultar o banco', async () => {
  const response = await GET(request({ query: '?unit=Barueri' }));

  assert.equal(response.status, 400);
  assert.deepEqual(calls, []);
});

test('mantém autenticação obrigatória', async () => {
  const response = await GET(request({ authenticated: false }));

  assert.equal(response.status, 401);
  assert.deepEqual(calls, []);
});
