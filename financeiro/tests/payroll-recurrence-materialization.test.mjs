import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';

let calls;
let currentEmployees;

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
  payrollImport: {
    findMany: async args => {
      calls.push(['import.findMany', args]);
      if (args.where.competenceMonth === 7) {
        return [{
          unit: 'Osasco',
          entries: [{
            employeeName: 'Maria da Silva',
            netSalary: 2200,
            baseSalary: 2200,
            cargo: 'Recepcionista',
            hasAdiantamento: false,
            hasFgts: true,
            employmentType: 'CLT',
            hazardPayRate: 0,
            hazardPayBase: null,
          }],
        }];
      }
      return currentEmployees.length === 0 ? [] : [{
        id: 'import-current',
        unit: 'Osasco',
        entries: currentEmployees.map(employeeName => ({ employeeName })),
      }];
    },
    upsert: async args => {
      calls.push(['import.upsert', args]);
      return { id: 'import-current', unit: 'Osasco' };
    },
  },
  payrollEntryExclusion: {
    findMany: async args => {
      calls.push(['exclusion.findMany', args]);
      return [];
    },
  },
  payrollEntry: {
    createMany: async args => {
      calls.push(['entry.createMany', args]);
      currentEmployees.push(...args.data.map(entry => entry.employeeName));
      return { count: args.data.length };
    },
  },
};

const { materializeRecurringPayrollEntries } = await import(
  '../src/lib/payroll-recurrence-materialization.ts'
);

beforeEach(() => {
  calls = [];
  currentEmployees = [];
});

test('materialização trava a unidade antes de reler e criar recorrências', async () => {
  await materializeRecurringPayrollEntries({ month: 8, year: 2026, unit: 'Osasco' });

  const lockIndex = calls.findIndex(([operation]) => operation === 'queryRaw');
  const currentReadIndex = calls.findIndex(([operation, args]) => (
    operation === 'import.findMany' && args.where.competenceMonth === 8
  ));
  const creation = calls.find(([operation]) => operation === 'entry.createMany');

  assert.ok(lockIndex >= 0);
  assert.ok(currentReadIndex > lockIndex);
  assert.equal(creation[1].data.length, 1);
  assert.equal(creation[1].data[0].employeeName, 'Maria da Silva');
  assert.equal(calls.filter(([operation]) => operation === 'executeRaw').length, 1);
});

test('segunda materialização relê o estado protegido e não duplica colaborador', async () => {
  await materializeRecurringPayrollEntries({ month: 8, year: 2026, unit: 'Osasco' });
  await materializeRecurringPayrollEntries({ month: 8, year: 2026, unit: 'Osasco' });

  assert.equal(calls.filter(([operation]) => operation === 'queryRaw').length, 2);
  assert.equal(calls.filter(([operation]) => operation === 'entry.createMany').length, 1);
  assert.deepEqual(currentEmployees, ['Maria da Silva']);
});
