import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';

const mockedModules = new Map([
  ['@/lib/pdf-parser', `
    export async function parsePDF(buffer) {
      return globalThis.__payrollUploadParsePDF(buffer);
    }
  `],
  ['@/lib/payroll-extractor', `
    export function extractEmployees(text) {
      return globalThis.__payrollUploadExtractEmployees(text);
    }
  `],
]);

registerHooks({
  resolve(specifier, context, nextResolve) {
    const mockedSource = mockedModules.get(specifier);
    if (mockedSource) {
      return {
        shortCircuit: true,
        url: `data:text/javascript,${encodeURIComponent(mockedSource)}`,
      };
    }
    if (specifier.startsWith('.') && context.parentURL && existsSync(new URL(`${specifier}.ts`, context.parentURL))) {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier === 'next/server' ? 'next/server.js' : specifier, context);
  },
});

const originalUpdatedAt = new Date('2026-09-12T10:00:00.000Z');
let calls;
let persistedImport;
let createShouldFail;
let parseCalls;

function cloneImport(value) {
  if (!value) return null;
  return {
    ...value,
    updatedAt: new Date(value.updatedAt),
    entries: value.entries?.map(entry => ({ ...entry })) || [],
  };
}

globalThis.__payrollUploadParsePDF = async buffer => {
  parseCalls += 1;
  assert.equal(Buffer.isBuffer(buffer), true);
  return { success: true, text: 'folha extraída', pages: 1, method: 'text' };
};

globalThis.__payrollUploadExtractEmployees = text => {
  assert.equal(text, 'folha extraída');
  return [{
    name: 'Ana Teste',
    netSalary: 1800,
    baseSalary: 2000,
    cargo: 'Esteticista',
    confidenceScore: 0.95,
    extractionSource: 'text',
  }];
};

globalThis.prisma = {
  payrollImport: {
    findUnique: async args => {
      calls.push(['root.findUnique', args]);
      return cloneImport(persistedImport);
    },
    deleteMany: async () => {
      throw new Error('A exclusão não pode ocorrer fora da transação');
    },
    create: async () => {
      throw new Error('A criação não pode ocorrer fora da transação');
    },
  },
  $transaction: async (callback, options) => {
    calls.push(['transaction.begin', options]);
    let transactionImport = cloneImport(persistedImport);
    const transaction = {
      $queryRaw: async query => {
        calls.push(['transaction.lock', query]);
        return [{ pg_advisory_xact_lock: null }];
      },
      payrollImport: {
        findUnique: async args => {
          calls.push(['transaction.findUnique', args]);
          return cloneImport(transactionImport);
        },
        deleteMany: async args => {
          calls.push(['transaction.deleteMany', args]);
          const matches = transactionImport
            && transactionImport.id === args.where.id
            && transactionImport.updatedAt.getTime() === args.where.updatedAt.getTime();
          if (matches) transactionImport = null;
          return { count: matches ? 1 : 0 };
        },
        create: async args => {
          calls.push(['transaction.create', args]);
          if (createShouldFail) throw new Error('falha simulada ao criar');
          transactionImport = {
            id: 'import-created',
            ...args.data,
            updatedAt: new Date('2026-09-12T11:00:00.000Z'),
            entries: args.data.entries.create,
          };
          return cloneImport(transactionImport);
        },
      },
    };

    const result = await callback(transaction);
    persistedImport = transactionImport;
    calls.push(['transaction.commit']);
    return result;
  },
};

const { NextRequest } = await import('next/server.js');
const { POST } = await import('../src/app/api/payroll/upload/route.ts');

function uploadRequest({
  unit = 'Osasco',
  month = '8',
  year = '2026',
  confirmImport = false,
  expectedUpdatedAt,
  permissions = { financeiro: true },
  userUnit = 'Osasco',
  role = 'GERENTE',
} = {}) {
  const form = new FormData();
  form.set('file', new File(['conteúdo PDF'], 'folha.pdf', { type: 'application/pdf' }));
  form.set('competenceMonth', month);
  form.set('competenceYear', year);
  form.set('unit', unit);
  form.set('confirmImport', String(confirmImport));
  if (expectedUpdatedAt !== undefined) form.set('expectedUpdatedAt', expectedUpdatedAt);

  return new NextRequest('http://localhost/api/payroll/upload', {
    method: 'POST',
    headers: {
      'x-user-id': 'user-1',
      'x-user-name': 'Usuário teste',
      'x-user-role': role,
      'x-user-unit': userUnit,
      'x-user-permissions': JSON.stringify(permissions),
    },
    body: form,
  });
}

beforeEach(() => {
  calls = [];
  parseCalls = 0;
  createShouldFail = false;
  persistedImport = {
    id: 'import-existing',
    fileName: 'folha-antiga.pdf',
    competenceMonth: 8,
    competenceYear: 2026,
    unit: 'Osasco',
    updatedAt: originalUpdatedAt,
    entries: [{ id: 'entry-antiga', employeeName: 'Folha preservada' }],
  };
});

test('nega upload sem permissão financeira antes de processar o PDF', async () => {
  const response = await POST(uploadRequest({ permissions: { finAnalise: true } }));

  assert.equal(response.status, 403);
  assert.equal(parseCalls, 0);
  assert.deepEqual(calls, []);
});

test('nega unidade fora do escopo antes de processar ou consultar a folha', async () => {
  const response = await POST(uploadRequest({ unit: 'SBC' }));

  assert.equal(response.status, 403);
  assert.equal(parseCalls, 0);
  assert.deepEqual(calls, []);
});

test('valida unidade e competência antes de processar o PDF', async () => {
  const invalidUnit = await POST(uploadRequest({ unit: 'Barueri' }));
  assert.equal(invalidUnit.status, 400);

  const invalidCompetence = await POST(uploadRequest({ month: '13' }));
  assert.equal(invalidCompetence.status, 400);
  assert.equal(parseCalls, 0);
  assert.deepEqual(calls, []);
});

test('preview informa a versão atual necessária para substituir a folha', async () => {
  const response = await POST(uploadRequest());
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.preview, true);
  assert.equal(body.existingImportUpdatedAt, originalUpdatedAt.toISOString());
  assert.equal(body.employeesFound, 1);
  assert.equal(calls[0][0], 'root.findUnique');
  assert.deepEqual(
    calls[0][1].where.competenceMonth_competenceYear_unit,
    { competenceMonth: 8, competenceYear: 2026, unit: 'Osasco' },
  );
});

test('exige precondição de versão quando a competência já possui folha', async () => {
  const response = await POST(uploadRequest({ confirmImport: true }));
  const body = await response.json();

  assert.equal(response.status, 428);
  assert.equal(body.code, 'PAYROLL_VERSION_REQUIRED');
  assert.equal(body.reloadRequired, true);
  assert.equal(persistedImport.id, 'import-existing');
  assert.equal(calls.some(([operation]) => operation === 'transaction.deleteMany'), false);
  assert.equal(calls.some(([operation]) => operation === 'transaction.create'), false);
});

test('rejeita versão obsoleta sem excluir a folha existente', async () => {
  const response = await POST(uploadRequest({
    confirmImport: true,
    expectedUpdatedAt: '2026-09-12T09:59:59.000Z',
  }));
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.equal(body.code, 'PAYROLL_VERSION_CONFLICT');
  assert.equal(persistedImport.id, 'import-existing');
  assert.equal(calls.some(([operation]) => operation === 'transaction.deleteMany'), false);
  assert.equal(calls.some(([operation]) => operation === 'transaction.create'), false);
});

test('substitui sob lock e CAS dentro de uma única transação', async () => {
  const response = await POST(uploadRequest({
    confirmImport: true,
    expectedUpdatedAt: originalUpdatedAt.toISOString(),
  }));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.replacedExisting, true);
  assert.equal(persistedImport.id, 'import-created');
  assert.deepEqual(
    calls.map(([operation]) => operation),
    [
      'transaction.begin',
      'transaction.lock',
      'transaction.findUnique',
      'transaction.deleteMany',
      'transaction.create',
      'transaction.commit',
    ],
  );
  assert.equal(calls[0][1].timeout, 20_000);
  assert.equal(calls[3][1].where.updatedAt.toISOString(), originalUpdatedAt.toISOString());
  assert.match(calls[1][1].values.join(' '), /payroll-recurrence:2026-08:Osasco/);
  assert.match(
    calls[1][1].strings.join(''),
    /CAST\(pg_advisory_xact_lock[\s\S]*AS text\)/,
  );
});

test('rollback da transação preserva integralmente a folha se a criação falhar', async () => {
  createShouldFail = true;
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    const response = await POST(uploadRequest({
      confirmImport: true,
      expectedUpdatedAt: originalUpdatedAt.toISOString(),
    }));

    assert.equal(response.status, 500);
    assert.equal(persistedImport.id, 'import-existing');
    assert.deepEqual(persistedImport.entries, [{ id: 'entry-antiga', employeeName: 'Folha preservada' }]);
    assert.equal(calls.some(([operation]) => operation === 'transaction.deleteMany'), true);
    assert.equal(calls.some(([operation]) => operation === 'transaction.create'), true);
    assert.equal(calls.some(([operation]) => operation === 'transaction.commit'), false);
  } finally {
    console.error = originalConsoleError;
  }
});

test('não recria silenciosamente uma folha removida depois do preview', async () => {
  persistedImport = null;
  const response = await POST(uploadRequest({
    confirmImport: true,
    expectedUpdatedAt: originalUpdatedAt.toISOString(),
  }));

  assert.equal(response.status, 409);
  assert.equal(persistedImport, null);
  assert.equal(calls.some(([operation]) => operation === 'transaction.create'), false);
});

test('permite a primeira importação sem precondição de versão', async () => {
  persistedImport = null;
  const response = await POST(uploadRequest({ confirmImport: true }));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.replacedExisting, false);
  assert.equal(persistedImport.id, 'import-created');
});
