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

let payrollImports;
let vacations;
let advances;
let calls;

globalThis.prisma = {
  payrollImport: {
    findMany: async args => {
      calls.push(['payrollImport.findMany', args]);
      return payrollImports;
    },
  },
  payrollVacation: {
    findMany: async args => {
      calls.push(['payrollVacation.findMany', args]);
      return args.where.advanceCostMode === 'automatic' ? advances : vacations;
    },
  },
  order: {
    findMany: async args => {
      calls.push(['order.findMany', args]);
      return [];
    },
  },
};

const { NextRequest } = await import('next/server.js');
const { GET } = await import('../src/app/api/costs/automatic/route.ts');

function payrollEntry(overrides = {}) {
  return {
    id: 'entry-1',
    employeeName: 'Colaborador teste',
    netSalary: 1000,
    baseSalary: 1000,
    bonus: 0,
    paymentStatus: 'unpaid',
    paymentDate: null,
    updatedAt: new Date('2026-09-12T12:00:00.000Z'),
    employmentType: 'PJ',
    hasFgts: false,
    hazardPayRate: 0,
    hazardPayBase: null,
    hasPenalty: false,
    adjustments: [],
    ...overrides,
  };
}

function request(unit, permissions, role = 'GERENTE') {
  return new NextRequest(`http://localhost/api/costs/automatic?month=9&year=2026&unit=${encodeURIComponent(unit)}`, {
    headers: {
      'x-user-id': 'user-1',
      'x-user-name': 'Usuário teste',
      'x-user-role': role,
      'x-user-unit': unit === 'all' ? 'Osasco' : unit,
      'x-user-permissions': JSON.stringify(permissions),
    },
  });
}

beforeEach(() => {
  calls = [];
  vacations = [];
  advances = [];
  payrollImports = [{
    id: 'import-osasco',
    unit: 'Osasco',
    updatedAt: new Date('2026-09-12T12:05:00.000Z'),
    entries: [payrollEntry()],
  }];
});

test('Custos usa a mesma parcela de férias e o mesmo líquido da Folha', async () => {
  payrollImports[0].entries = [payrollEntry({ employmentType: 'CLT', hasFgts: true })];
  vacations = [{
    id: 'vacation-1', unit: 'Osasco', employeeKey: 'colaborador teste',
    employeeName: 'Colaborador teste',
    startDate: new Date('2026-08-15T00:00:00.000Z'),
    endDate: new Date('2026-08-24T00:00:00.000Z'),
    advanceAmount: 0, advancePaidAt: null,
    updatedAt: new Date('2026-08-01T00:00:00.000Z'),
  }];

  const response = await GET(request('Osasco', { finCustos: true }));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.payroll.entries[0].salary, 1027.78);
  assert.ok(Math.abs(body.payroll.entries[0].fgts - 88.8888) < 0.001);
  const vacationCall = calls.find(([operation]) => operation === 'payrollVacation.findMany')[1];
  assert.equal(vacationCall.where.unit, 'Osasco');
});

test('custos de setembro consulta e identifica a folha de agosto', async () => {
  const response = await GET(request('Osasco', { finCustos: true }));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body.payrollCompetence, { month: 8, year: 2026 });
  assert.deepEqual(body.missingPayrollUnits, []);
  assert.equal(body.payroll.total, 1000);
  assert.equal(body.payroll.entries[0].employeeName, 'Colaborador teste');
  assert.equal(body.payroll.entries[0].updatedAt, '2026-09-12T12:00:00.000Z');
  assert.equal(body.canManagePayrollPayments, true);
  assert.equal(body.payrollRevision.lastModifiedAt, '2026-09-12T12:05:00.000Z');
  assert.match(body.payrollRevision.revision, /import-osasco/);
  assert.equal(body.automaticCostsRevision.lastModifiedAt, '2026-09-12T12:05:00.000Z');
  assert.match(body.automaticCostsRevision.revision, /payroll:import-osasco/);

  const payrollCall = calls.find(([operation]) => operation === 'payrollImport.findMany')[1];
  assert.equal(payrollCall.where.competenceMonth, 8);
  assert.equal(payrollCall.where.competenceYear, 2026);
  assert.equal(payrollCall.where.unit, 'Osasco');
});

test('adiantamento de férias aparece uma vez em Custos no mês do pagamento', async () => {
  advances = [{
    id: 'vacation-sep', unit: 'Osasco', employeeName: 'Letícia Máximo',
    startDate: new Date('2026-09-16T00:00:00.000Z'),
    endDate: new Date('2026-10-05T00:00:00.000Z'),
    advancePaidAt: new Date('2026-09-14T00:00:00.000Z'),
    advanceAmount: 1878.07,
    receipt: { net: 1878.07, paymentDueDate: '2026-09-14' },
    updatedAt: new Date('2026-09-14T12:00:00.000Z'),
  }];
  const response = await GET(request('Osasco', { finCustos: true }));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(body.vacationAdvances, [{
    id: 'vacation-sep', employeeName: 'Letícia Máximo', unit: 'Osasco',
    startDate: '2026-09-16', endDate: '2026-10-05', amount: 1878.07,
    date: '2026-09-14', isPaid: true, updatedAt: '2026-09-14T12:00:00.000Z',
  }]);
  assert.match(body.automaticCostsRevision.revision, /vacation-advance:vacation-sep/);
});

test('análise financeira recebe agregados sem nomes nem ações de pagamento', async () => {
  const response = await GET(request('Osasco', { finAnalise: true }));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.payroll.total, 1000);
  assert.deepEqual(body.payroll.entries, []);
  assert.equal(body.canManagePayrollPayments, false);
});

test('informa a competência e a unidade quando não há folha para refletir', async () => {
  payrollImports = [];
  const response = await GET(request('SCS', { finCustos: true }));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.payroll, null);
  assert.deepEqual(body.payrollCompetence, { month: 8, year: 2026 });
  assert.deepEqual(body.missingPayrollUnits, ['SCS']);
});

test('visão global aponta somente as unidades sem folha na competência anterior', async () => {
  payrollImports = [{
    id: 'import-sbc',
    unit: 'SBC',
    updatedAt: new Date('2026-09-12T13:00:00.000Z'),
    entries: [payrollEntry({ id: 'sbc-entry' })],
  }];
  const response = await GET(request('all', { admin: true }, 'ADMINISTRADOR'));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body.missingPayrollUnits, ['Osasco', 'SCS']);
});
