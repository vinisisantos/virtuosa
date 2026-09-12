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
let currentEntry;
let currentAdjustment;

globalThis.prisma = {
  $transaction: async callback => callback(globalThis.prisma),
  $queryRaw: async (...args) => {
    calls.push(['queryRaw', args]);
    return [];
  },
  $executeRaw: async (...args) => {
    calls.push(['executeRaw', args]);
    return 1;
  },
  payrollEntry: {
    findUnique: async args => {
      calls.push(['entry.findUnique', args]);
      return currentEntry;
    },
    update: async args => {
      calls.push(['entry.update', args]);
      return { ...currentEntry, ...args.data };
    },
    updateMany: async args => {
      calls.push(['entry.updateMany', args]);
      return { count: 1 };
    },
  },
  payrollAdjustment: {
    create: async args => {
      calls.push(['adjustment.create', args]);
      return {
        id: 'adjustment-created',
        createdAt: new Date('2026-09-12T12:00:00.000Z'),
        updatedAt: new Date('2026-09-12T12:00:00.000Z'),
        ...args.data,
      };
    },
    findUnique: async args => {
      calls.push(['adjustment.findUnique', args]);
      return currentAdjustment;
    },
    updateMany: async args => {
      calls.push(['adjustment.updateMany', args]);
      return { count: 1 };
    },
    deleteMany: async args => {
      calls.push(['adjustment.deleteMany', args]);
      return { count: 1 };
    },
  },
};

const { NextRequest } = await import('next/server.js');
const { POST, PUT, DELETE } = await import('../src/app/api/payroll/adjustments/route.ts');

function request(method, body, query = '', {
  unit = 'Osasco',
  permissions = { financeiro: true },
} = {}) {
  return new NextRequest(`http://localhost/api/payroll/adjustments${query}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': 'user-1',
      'x-user-name': 'Usuário teste',
      'x-user-role': 'GERENTE',
      'x-user-unit': unit,
      'x-user-permissions': JSON.stringify(permissions),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

beforeEach(() => {
  calls = [];
  currentEntry = {
    id: 'entry-1',
    updatedAt: new Date('2026-09-12T11:00:00.000Z'),
    employmentType: 'CLT',
    payrollImportId: 'import-1',
    payrollImport: { unit: 'Osasco' },
  };
  currentAdjustment = {
    id: 'adjustment-1',
    payrollEntryId: 'entry-1',
    kind: 'addition',
    direction: 'credit',
    label: 'Extra',
    quantity: null,
    amount: 100,
    createdAt: new Date('2026-09-12T10:00:00.000Z'),
    updatedAt: new Date('2026-09-12T11:00:00.000Z'),
    payrollEntry: {
      employmentType: 'CLT',
      updatedAt: new Date('2026-09-12T11:00:00.000Z'),
      payrollImportId: 'import-1',
      payrollImport: { unit: 'Osasco' },
    },
  };
});

test('cria ajuste somente após validar entrada, unidade e versão, tocando a revisão', async () => {
  const response = await POST(request('POST', {
    payrollEntryId: 'entry-1',
    expectedEntryUpdatedAt: '2026-09-12T11:00:00.000Z',
    kind: 'absence',
    quantity: 2,
  }));
  const body = await response.json();

  assert.equal(response.status, 201);
  assert.equal(body.payrollEntryId, 'entry-1');
  assert.equal(body.kind, 'absence');
  assert.equal(calls.filter(([operation]) => operation === 'queryRaw').length, 1);
  assert.equal(calls.filter(([operation]) => operation === 'adjustment.create').length, 1);
  assert.equal(calls.filter(([operation]) => operation === 'entry.update').length, 1);
  assert.equal(calls.filter(([operation]) => operation === 'executeRaw').length, 1);
});

test('bloqueia criação de ajuste por ID de colaborador de outra unidade', async () => {
  currentEntry.payrollImport.unit = 'SBC';
  const response = await POST(request('POST', {
    payrollEntryId: 'entry-1',
    kind: 'addition',
    amount: 100,
  }));

  assert.equal(response.status, 403);
  assert.equal(calls.filter(([operation]) => operation === 'adjustment.create').length, 0);
  assert.equal(calls.filter(([operation]) => operation === 'executeRaw').length, 0);
});

test('versão antiga da entrada retorna 409 antes de criar ajuste', async () => {
  const response = await POST(request('POST', {
    payrollEntryId: 'entry-1',
    expectedEntryUpdatedAt: '2026-09-12T10:00:00.000Z',
    kind: 'addition',
    amount: 100,
  }));
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.equal(body.code, 'PAYROLL_VERSION_CONFLICT');
  assert.equal(calls.filter(([operation]) => operation === 'adjustment.create').length, 0);
});

test('criação de ajuste exige versão da entrada e rejeita versão inválida', async () => {
  const missingResponse = await POST(request('POST', {
    payrollEntryId: 'entry-1',
    kind: 'addition',
    amount: 100,
  }));
  const missingBody = await missingResponse.json();

  assert.equal(missingResponse.status, 428);
  assert.equal(missingBody.code, 'PAYROLL_VERSION_REQUIRED');
  assert.equal(missingBody.reloadRequired, true);
  assert.equal(calls.filter(([operation]) => operation === 'adjustment.create').length, 0);

  calls = [];
  const invalidResponse = await POST(request('POST', {
    payrollEntryId: 'entry-1',
    expectedEntryUpdatedAt: 'data-inválida',
    kind: 'addition',
    amount: 100,
  }));

  assert.equal(invalidResponse.status, 400);
  assert.equal(calls.filter(([operation]) => operation === 'adjustment.create').length, 0);
});

test('não permite atualizar ajuste usando o vínculo de outro colaborador', async () => {
  const response = await PUT(request('PUT', {
    id: 'adjustment-1',
    payrollEntryId: 'entry-2',
    kind: 'addition',
    amount: 150,
  }));

  assert.equal(response.status, 404);
  assert.equal(calls.filter(([operation]) => operation === 'adjustment.updateMany').length, 0);
  assert.equal(calls.filter(([operation]) => operation === 'entry.updateMany').length, 0);
  assert.equal(calls.filter(([operation]) => operation === 'executeRaw').length, 0);
});

test('atualização e exclusão válidas preservam o vínculo e tocam a revisão', async () => {
  const updateResponse = await PUT(request('PUT', {
    id: 'adjustment-1',
    payrollEntryId: 'entry-1',
    expectedUpdatedAt: '2026-09-12T11:00:00.000Z',
    kind: 'addition',
    amount: 150,
  }));
  assert.equal(updateResponse.status, 200);
  const write = calls.find(([operation]) => operation === 'adjustment.updateMany')[1];
  assert.equal(write.where.payrollEntryId, 'entry-1');
  assert.equal(write.where.updatedAt.toISOString(), '2026-09-12T11:00:00.000Z');
  assert.equal(calls.filter(([operation]) => operation === 'executeRaw').length, 1);
  assert.equal(calls.filter(([operation]) => operation === 'entry.updateMany').length, 1);
  assert.ok(
    calls.findIndex(([operation]) => operation === 'queryRaw')
      < calls.findIndex(([operation]) => operation === 'adjustment.updateMany'),
    'a entrada deve ser bloqueada antes do ajuste',
  );

  calls = [];
  const deleteResponse = await DELETE(request(
    'DELETE',
    undefined,
    '?id=adjustment-1&expectedUpdatedAt=2026-09-12T11%3A00%3A00.000Z',
  ));
  assert.equal(deleteResponse.status, 200);
  assert.equal(calls.filter(([operation]) => operation === 'adjustment.deleteMany').length, 1);
  assert.equal(calls.filter(([operation]) => operation === 'entry.updateMany').length, 1);
  assert.equal(calls.filter(([operation]) => operation === 'executeRaw').length, 1);
  assert.ok(
    calls.findIndex(([operation]) => operation === 'queryRaw')
      < calls.findIndex(([operation]) => operation === 'adjustment.deleteMany'),
    'a entrada deve ser bloqueada antes de remover o ajuste',
  );
});

test('versão antiga do ajuste retorna 409 sem atualizar ou remover', async () => {
  const updateResponse = await PUT(request('PUT', {
    id: 'adjustment-1',
    payrollEntryId: 'entry-1',
    expectedUpdatedAt: '2026-09-12T10:59:00.000Z',
    kind: 'addition',
    amount: 150,
  }));
  assert.equal(updateResponse.status, 409);
  assert.equal(calls.filter(([operation]) => operation === 'adjustment.updateMany').length, 0);

  calls = [];
  const deleteResponse = await DELETE(request(
    'DELETE',
    undefined,
    '?id=adjustment-1&expectedUpdatedAt=2026-09-12T10%3A59%3A00.000Z',
  ));
  assert.equal(deleteResponse.status, 409);
  assert.equal(calls.filter(([operation]) => operation === 'adjustment.deleteMany').length, 0);
  assert.equal(calls.filter(([operation]) => operation === 'executeRaw').length, 0);
});

test('edição de ajuste existente exige versão e preserva o vínculo', async () => {
  const missingResponse = await PUT(request('PUT', {
    id: 'adjustment-1',
    payrollEntryId: 'entry-1',
    kind: 'addition',
    amount: 150,
  }));
  const missingBody = await missingResponse.json();

  assert.equal(missingResponse.status, 428);
  assert.equal(missingBody.code, 'PAYROLL_VERSION_REQUIRED');
  assert.equal(calls.filter(([operation]) => operation === 'adjustment.updateMany').length, 0);
  assert.equal(calls.filter(([operation]) => operation === 'entry.updateMany').length, 0);

  calls = [];
  const invalidResponse = await PUT(request('PUT', {
    id: 'adjustment-1',
    payrollEntryId: 'entry-1',
    expectedUpdatedAt: 'data-inválida',
    kind: 'addition',
    amount: 150,
  }));

  assert.equal(invalidResponse.status, 400);
  assert.equal(calls.filter(([operation]) => operation === 'adjustment.updateMany').length, 0);
});

test('exclusão de ajuste existente exige versão e rejeita versão inválida', async () => {
  const missingResponse = await DELETE(request('DELETE', undefined, '?id=adjustment-1'));
  const missingBody = await missingResponse.json();

  assert.equal(missingResponse.status, 428);
  assert.equal(missingBody.code, 'PAYROLL_VERSION_REQUIRED');
  assert.equal(calls.filter(([operation]) => operation === 'adjustment.deleteMany').length, 0);
  assert.equal(calls.filter(([operation]) => operation === 'entry.updateMany').length, 0);

  calls = [];
  const invalidResponse = await DELETE(request(
    'DELETE',
    undefined,
    '?id=adjustment-1&expectedUpdatedAt=data-invalida',
  ));

  assert.equal(invalidResponse.status, 400);
  assert.equal(calls.filter(([operation]) => operation === 'adjustment.deleteMany').length, 0);
});

test('edição e exclusão preservam 404 e 403 antes de exigir versão', async () => {
  currentAdjustment = null;
  const missingUpdateResponse = await PUT(request('PUT', {
    id: 'adjustment-inexistente',
    payrollEntryId: 'entry-1',
    kind: 'addition',
    amount: 150,
  }));
  assert.equal(missingUpdateResponse.status, 404);

  calls = [];
  const missingDeleteResponse = await DELETE(request(
    'DELETE',
    undefined,
    '?id=adjustment-inexistente',
  ));
  assert.equal(missingDeleteResponse.status, 404);

  currentAdjustment = {
    id: 'adjustment-sbc',
    payrollEntryId: 'entry-sbc',
    kind: 'addition',
    direction: 'credit',
    label: 'Extra',
    quantity: null,
    amount: 100,
    createdAt: new Date('2026-09-12T10:00:00.000Z'),
    updatedAt: new Date('2026-09-12T11:00:00.000Z'),
    payrollEntry: {
      employmentType: 'CLT',
      updatedAt: new Date('2026-09-12T11:00:00.000Z'),
      payrollImportId: 'import-sbc',
      payrollImport: { unit: 'SBC' },
    },
  };

  calls = [];
  const forbiddenUpdateResponse = await PUT(request('PUT', {
    id: 'adjustment-sbc',
    payrollEntryId: 'entry-sbc',
    kind: 'addition',
    amount: 150,
  }));
  assert.equal(forbiddenUpdateResponse.status, 403);
  assert.equal(calls.filter(([operation]) => operation === 'adjustment.updateMany').length, 0);

  calls = [];
  const forbiddenDeleteResponse = await DELETE(request(
    'DELETE',
    undefined,
    '?id=adjustment-sbc',
  ));
  assert.equal(forbiddenDeleteResponse.status, 403);
  assert.equal(calls.filter(([operation]) => operation === 'adjustment.deleteMany').length, 0);
});
