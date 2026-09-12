import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import {
  buildPayrollRevision,
  matchesExpectedUpdatedAt,
  nextPayrollUpdatedAt,
  parseOptionalExpectedUpdatedAt,
} from '../src/lib/payroll-sync.ts';

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
let orders;

globalThis.prisma = {
  payrollImport: {
    findMany: async args => {
      calls.push(['findMany', args]);
      return imports;
    },
  },
  order: {
    findMany: async args => {
      calls.push(['order.findMany', args]);
      return orders;
    },
  },
};

const { NextRequest } = await import('next/server.js');
const { GET } = await import('../src/app/api/payroll/revision/route.ts');

function request(query = '', {
  unit = 'Osasco',
  role = 'GERENTE',
  permissions = { financeiro: true },
} = {}) {
  return new NextRequest(`http://localhost/api/payroll/revision?month=8&year=2026${query}`, {
    headers: {
      'x-user-id': 'user-1',
      'x-user-name': 'Usuário teste',
      'x-user-role': role,
      'x-user-unit': unit,
      'x-user-permissions': JSON.stringify(permissions),
    },
  });
}

beforeEach(() => {
  calls = [];
  imports = [{
    id: 'import-osasco',
    unit: 'Osasco',
    updatedAt: new Date('2026-09-12T12:00:00.000Z'),
  }];
  orders = [];
});

test('revisão global é estável por ordem e muda mesmo quando o maior timestamp não muda', () => {
  const first = buildPayrollRevision([
    { id: 'sbc', unit: 'SBC', updatedAt: '2026-09-12T11:00:00.000Z' },
    { id: 'osasco', unit: 'Osasco', updatedAt: '2026-09-12T12:00:00.000Z' },
  ]);
  const reordered = buildPayrollRevision([
    { id: 'osasco', unit: 'Osasco', updatedAt: '2026-09-12T12:00:00.000Z' },
    { id: 'sbc', unit: 'SBC', updatedAt: '2026-09-12T11:00:00.000Z' },
  ]);
  const changedOlderUnit = buildPayrollRevision([
    { id: 'osasco', unit: 'Osasco', updatedAt: '2026-09-12T12:00:00.000Z' },
    { id: 'sbc', unit: 'SBC', updatedAt: '2026-09-12T11:30:00.000Z' },
  ]);

  assert.deepEqual(first, reordered);
  assert.equal(first.lastModifiedAt, '2026-09-12T12:00:00.000Z');
  assert.equal(changedOlderUnit.lastModifiedAt, first.lastModifiedAt);
  assert.notEqual(changedOlderUnit.revision, first.revision);
  assert.deepEqual(buildPayrollRevision([]), { revision: 'empty', lastModifiedAt: null });
});

test('parser de versão aceita ausência por compatibilidade e compara timestamps exatos', () => {
  assert.equal(parseOptionalExpectedUpdatedAt(undefined), undefined);
  assert.equal(parseOptionalExpectedUpdatedAt(''), null);
  assert.equal(parseOptionalExpectedUpdatedAt('data inválida'), null);

  const parsed = parseOptionalExpectedUpdatedAt('2026-09-12T12:00:00.000Z');
  assert.ok(parsed instanceof Date);
  assert.equal(matchesExpectedUpdatedAt(new Date('2026-09-12T12:00:00.000Z'), parsed), true);
  assert.equal(matchesExpectedUpdatedAt(new Date('2026-09-12T12:00:01.000Z'), parsed), false);
  assert.equal(matchesExpectedUpdatedAt(new Date(), undefined), true);
  assert.equal(
    nextPayrollUpdatedAt(
      '2026-09-12T12:00:00.000Z',
      new Date('2026-09-12T12:00:00.000Z'),
    ).toISOString(),
    '2026-09-12T12:00:00.001Z',
  );
});

test('endpoint leve consulta somente revisão da unidade e desabilita cache', async () => {
  const response = await GET(request('&unit=Osasco'));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store, max-age=0');
  assert.equal(body.unit, 'Osasco');
  assert.equal(body.lastModifiedAt, '2026-09-12T12:00:00.000Z');
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0][1].select, { id: true, unit: true, updatedAt: true });
  assert.deepEqual(calls[0][1].where, {
    competenceMonth: 8,
    competenceYear: 2026,
    unit: 'Osasco',
  });
});

test('endpoint leve permite leitura de Custos e não aceita unidade desconhecida', async () => {
  const costsResponse = await GET(request('&unit=Osasco', { permissions: { finCustos: true } }));
  assert.equal(costsResponse.status, 200);

  calls = [];
  const invalidUnitResponse = await GET(request('&unit=Barueri'));
  assert.equal(invalidUnitResponse.status, 400);
  assert.equal(calls.length, 0);
});

test('revisão opcional do DRE inclui pedidos reconhecidos do mês de custo', async () => {
  orders = [{
    id: 'order-1',
    unit: 'Osasco',
    updatedAt: new Date('2026-09-12T12:10:00.000Z'),
  }];

  const response = await GET(request('&unit=Osasco&costMonth=9&costYear=2026'));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.match(body.revision, /payroll:import-osasco/);
  assert.match(body.revision, /order:order-1/);
  assert.equal(body.lastModifiedAt, '2026-09-12T12:10:00.000Z');
  const orderCall = calls.find(([operation]) => operation === 'order.findMany')[1];
  assert.equal(orderCall.where.unit, 'Osasco');
  assert.deepEqual(orderCall.where.costRecognizedAt, {
    gte: new Date('2026-09-01T00:00:00.000Z'),
    lt: new Date('2026-10-01T00:00:00.000Z'),
  });
});

test('permissão admin sem cargo administrador mantém a visão global', async () => {
  imports = [
    { id: 'import-osasco', unit: 'Osasco', updatedAt: new Date('2026-09-12T12:00:00.000Z') },
    { id: 'import-sbc', unit: 'SBC', updatedAt: new Date('2026-09-12T12:01:00.000Z') },
  ];

  const response = await GET(request('&unit=all', {
    unit: 'Todas',
    role: 'GERENTE',
    permissions: { admin: true },
  }));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.unit, 'all');
  assert.deepEqual(calls[0][1].where, {
    competenceMonth: 8,
    competenceYear: 2026,
  });
});
