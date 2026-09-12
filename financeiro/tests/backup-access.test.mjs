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

globalThis.prisma = {
  financialBackup: {
    findFirst: async args => {
      calls.push(['findFirst', args]);
      return {
        id: 'backup-1',
        unit: 'Osasco',
        logs: '[]',
        goals: '{}',
        fixed: '[]',
        bills: '[]',
        isAuto: true,
        updatedAt: new Date('2026-09-12T12:00:00.000Z'),
      };
    },
    update: async args => {
      calls.push(['update', args]);
      return { id: args.where.id, updatedAt: new Date('2026-09-12T12:01:00.000Z') };
    },
    create: async args => {
      calls.push(['create', args]);
      return { id: 'backup-new', updatedAt: new Date('2026-09-12T12:01:00.000Z') };
    },
  },
};

const { NextRequest } = await import('next/server.js');
const { GET, POST } = await import('../src/app/api/backup/route.ts');

function request(method, permissions, authenticated = true) {
  return new NextRequest('http://localhost/api/backup', {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(authenticated ? {
        'x-user-id': 'user-1',
        'x-user-name': 'Usuário teste',
        'x-user-role': 'GERENTE',
        'x-user-unit': 'Osasco',
        'x-user-permissions': JSON.stringify(permissions),
      } : {}),
    },
    ...(method === 'POST' ? {
      body: JSON.stringify({ logs: [], goals: {}, fixed: [], bills: [], isAuto: true }),
    } : {}),
  });
}

beforeEach(() => { calls = []; });

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

test('Custos pode atualizar apenas o snapshot resolvido para a própria unidade', async () => {
  const response = await POST(request('POST', { finCustos: true }));
  assert.equal(response.status, 200);
  assert.equal(calls[0][0], 'findFirst');
  assert.deepEqual(calls[0][1].where, { isAuto: true, unit: 'Osasco' });
  assert.equal(calls[1][0], 'update');
});
