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
let currentImport;
let updateCount;

globalThis.prisma = {
  $transaction: async callback => callback(globalThis.prisma),
  $executeRaw: async (...args) => {
    calls.push(['executeRaw', args]);
    return 1;
  },
  payrollEntry: {
    findUnique: async args => {
      calls.push(['entry.findUnique', args]);
      return currentEntry;
    },
    updateMany: async args => {
      calls.push(['entry.updateMany', args]);
      if (updateCount === 1) currentEntry = { ...currentEntry, ...args.data };
      return { count: updateCount };
    },
    deleteMany: async args => {
      calls.push(['entry.deleteMany', args]);
      return { count: updateCount };
    },
    create: async args => {
      calls.push(['entry.create', args]);
      return { id: 'created-entry', updatedAt: new Date(), ...args.data };
    },
    createMany: async args => {
      calls.push(['entry.createMany', args]);
      return { count: args.data.length };
    },
  },
  payrollAdjustment: {
    create: async args => {
      calls.push(['adjustment.create', args]);
      return { id: 'transport-1', ...args.data };
    },
    updateMany: async args => {
      calls.push(['adjustment.updateMany', args]);
      return { count: 1 };
    },
    deleteMany: async args => {
      calls.push(['adjustment.deleteMany', args]);
      return { count: 0 };
    },
  },
  payrollEntryExclusion: {
    upsert: async args => {
      calls.push(['exclusion.upsert', args]);
      return args.create;
    },
    createMany: async args => {
      calls.push(['exclusion.createMany', args]);
      return { count: args.data.length };
    },
  },
  payrollImport: {
    upsert: async args => {
      calls.push(['import.upsert', args]);
      return {
        id: 'import-1',
        unit: args.create.unit,
        competenceMonth: args.create.competenceMonth,
        competenceYear: args.create.competenceYear,
      };
    },
    findUnique: async args => {
      calls.push(['import.findUnique', args]);
      return currentImport;
    },
    deleteMany: async args => {
      calls.push(['import.deleteMany', args]);
      return { count: updateCount };
    },
  },
};

const { NextRequest } = await import('next/server.js');
const { POST, PUT, DELETE } = await import('../src/app/api/payroll/entries/route.ts');

function request(method, body, query = '', {
  unit = 'Osasco',
  permissions = { financeiro: true },
} = {}) {
  return new NextRequest(`http://localhost/api/payroll/entries${query}`, {
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
  updateCount = 1;
  currentImport = null;
  currentEntry = {
    id: 'entry-1',
    payrollImportId: 'import-1',
    employeeName: 'Colaboradora teste',
    netSalary: 2000,
    baseSalary: 2000,
    employmentType: 'CLT',
    updatedAt: new Date('2026-09-12T11:00:00.000Z'),
    payrollImport: {
      unit: 'Osasco',
      competenceMonth: 8,
      competenceYear: 2026,
    },
    adjustments: [],
  };
});

test('edição filtra por unidade e versão e toca a revisão na mesma transação', async () => {
  const response = await PUT(request('PUT', {
    id: 'entry-1',
    employeeName: 'Nome atualizado',
    expectedUpdatedAt: '2026-09-12T11:00:00.000Z',
  }));

  assert.equal(response.status, 200);
  const write = calls.find(([operation]) => operation === 'entry.updateMany')[1];
  assert.equal(write.where.payrollImport.unit, 'Osasco');
  assert.equal(write.where.updatedAt.toISOString(), '2026-09-12T11:00:00.000Z');
  assert.equal(calls.filter(([operation]) => operation === 'executeRaw').length, 1);
});

test('edição com versão antiga retorna 409 sem escrever', async () => {
  const response = await PUT(request('PUT', {
    id: 'entry-1',
    employeeName: 'Nome antigo',
    expectedUpdatedAt: '2026-09-12T10:00:00.000Z',
  }));
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.equal(body.reloadRequired, true);
  assert.equal(calls.filter(([operation]) => operation === 'entry.updateMany').length, 0);
  assert.equal(calls.filter(([operation]) => operation === 'executeRaw').length, 0);
});

test('edição existente exige versão e diferencia ausência de formato inválido', async () => {
  const missingResponse = await PUT(request('PUT', {
    id: 'entry-1',
    employeeName: 'Nome atualizado',
  }));
  const missingBody = await missingResponse.json();

  assert.equal(missingResponse.status, 428);
  assert.equal(missingBody.code, 'PAYROLL_VERSION_REQUIRED');
  assert.equal(missingBody.reloadRequired, true);
  assert.equal(calls.filter(([operation]) => operation === 'entry.updateMany').length, 0);

  calls = [];
  const invalidResponse = await PUT(request('PUT', {
    id: 'entry-1',
    employeeName: 'Nome atualizado',
    expectedUpdatedAt: 'data-inválida',
  }));

  assert.equal(invalidResponse.status, 400);
  assert.equal(calls.filter(([operation]) => operation === 'entry.updateMany').length, 0);
});

test('edição preserva 404 e 403 antes de exigir versão', async () => {
  currentEntry = null;
  const missingEntryResponse = await PUT(request('PUT', {
    id: 'entry-inexistente',
    employeeName: 'Nome atualizado',
  }));
  assert.equal(missingEntryResponse.status, 404);

  calls = [];
  currentEntry = {
    id: 'entry-sbc',
    payrollImportId: 'import-sbc',
    employeeName: 'Outra unidade',
    netSalary: 2000,
    baseSalary: 2000,
    employmentType: 'CLT',
    updatedAt: new Date('2026-09-12T11:00:00.000Z'),
    payrollImport: { unit: 'SBC', competenceMonth: 8, competenceYear: 2026 },
    adjustments: [],
  };
  const forbiddenResponse = await PUT(request('PUT', {
    id: 'entry-sbc',
    employeeName: 'Nome atualizado',
  }));
  assert.equal(forbiddenResponse.status, 403);
  assert.equal(calls.filter(([operation]) => operation === 'entry.updateMany').length, 0);
});

test('edição por ID de outra unidade é bloqueada antes da escrita', async () => {
  currentEntry.payrollImport.unit = 'SBC';
  const response = await PUT(request('PUT', { id: 'entry-1', employeeName: 'Ataque' }));

  assert.equal(response.status, 403);
  assert.equal(calls.filter(([operation]) => operation === 'entry.updateMany').length, 0);
});

test('criação usa a unidade autorizada e rejeita unidade alheia', async () => {
  const forbidden = await POST(request('POST', {
    employeeName: 'Nova pessoa',
    netSalary: 2000,
    unit: 'SBC',
    competenceMonth: 8,
    competenceYear: 2026,
  }));

  assert.equal(forbidden.status, 403);
  assert.equal(calls.filter(([operation]) => operation === 'import.upsert').length, 0);

  calls = [];
  const allowed = await POST(request('POST', {
    employeeName: 'Nova pessoa',
    netSalary: 2000,
    unit: 'Osasco',
    competenceMonth: 8,
    competenceYear: 2026,
  }));
  assert.equal(allowed.status, 200);
  assert.equal(calls.find(([operation]) => operation === 'import.upsert')[1].create.unit, 'Osasco');
  assert.equal(calls.filter(([operation]) => operation === 'executeRaw').length, 1);
});

test('exclusão individual com versão antiga não registra supressão parcial', async () => {
  const response = await DELETE(request(
    'DELETE',
    undefined,
    '?id=entry-1&expectedUpdatedAt=2026-09-12T10%3A00%3A00.000Z',
  ));

  assert.equal(response.status, 409);
  assert.equal(calls.filter(([operation]) => operation === 'exclusion.upsert').length, 0);
  assert.equal(calls.filter(([operation]) => operation === 'entry.deleteMany').length, 0);
});

test('exclusão individual condiciona a versão e toca a revisão após remover', async () => {
  const response = await DELETE(request(
    'DELETE',
    undefined,
    '?id=entry-1&expectedUpdatedAt=2026-09-12T11%3A00%3A00.000Z',
  ));

  assert.equal(response.status, 200);
  const deletion = calls.find(([operation]) => operation === 'entry.deleteMany')[1];
  assert.equal(deletion.where.payrollImport.unit, 'Osasco');
  assert.equal(deletion.where.updatedAt.toISOString(), '2026-09-12T11:00:00.000Z');
  assert.equal(calls.filter(([operation]) => operation === 'executeRaw').length, 1);
});

test('exclusão individual existente exige versão antes de registrar supressão', async () => {
  const missingResponse = await DELETE(request('DELETE', undefined, '?id=entry-1'));
  const missingBody = await missingResponse.json();

  assert.equal(missingResponse.status, 428);
  assert.equal(missingBody.code, 'PAYROLL_VERSION_REQUIRED');
  assert.equal(missingBody.reloadRequired, true);
  assert.equal(calls.filter(([operation]) => operation === 'exclusion.upsert').length, 0);
  assert.equal(calls.filter(([operation]) => operation === 'entry.deleteMany').length, 0);

  calls = [];
  const invalidResponse = await DELETE(request(
    'DELETE',
    undefined,
    '?id=entry-1&expectedUpdatedAt=data-invalida',
  ));
  assert.equal(invalidResponse.status, 400);
  assert.equal(calls.filter(([operation]) => operation === 'exclusion.upsert').length, 0);
});

test('exclusão de competência existente também exige a revisão da importação', async () => {
  currentImport = {
    id: 'import-1',
    unit: 'Osasco',
    competenceMonth: 8,
    competenceYear: 2026,
    updatedAt: new Date('2026-09-12T11:00:00.000Z'),
    entries: [{ employeeName: 'Colaboradora teste' }],
  };

  const response = await DELETE(request('DELETE', undefined, '?importId=import-1'));
  const body = await response.json();

  assert.equal(response.status, 428);
  assert.equal(body.code, 'PAYROLL_VERSION_REQUIRED');
  assert.equal(calls.filter(([operation]) => operation === 'exclusion.createMany').length, 0);
  assert.equal(calls.filter(([operation]) => operation === 'import.deleteMany').length, 0);
});

test('exclusão preserva 404 e 403 antes de exigir versão', async () => {
  currentEntry = null;
  const missingEntryResponse = await DELETE(request(
    'DELETE',
    undefined,
    '?id=entry-inexistente',
  ));
  assert.equal(missingEntryResponse.status, 404);

  calls = [];
  currentEntry = {
    id: 'entry-sbc',
    employeeName: 'Outra unidade',
    updatedAt: new Date('2026-09-12T11:00:00.000Z'),
    payrollImportId: 'import-sbc',
    payrollImport: { unit: 'SBC', competenceMonth: 8, competenceYear: 2026 },
  };
  const forbiddenEntryResponse = await DELETE(request(
    'DELETE',
    undefined,
    '?id=entry-sbc',
  ));
  assert.equal(forbiddenEntryResponse.status, 403);
  assert.equal(calls.filter(([operation]) => operation === 'exclusion.upsert').length, 0);

  calls = [];
  currentImport = null;
  const missingImportResponse = await DELETE(request(
    'DELETE',
    undefined,
    '?importId=import-inexistente',
  ));
  assert.equal(missingImportResponse.status, 404);
});
