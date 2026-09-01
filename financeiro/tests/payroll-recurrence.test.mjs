import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizePayrollEmployeeKey,
  selectRecurringPayrollEntries,
} from '../src/lib/payroll-recurrence.ts';

test('normaliza nome com espaços sem criar uma identidade paralela', () => {
  assert.equal(normalizePayrollEmployeeKey('  Maria   da Silva  '), 'maria da silva');
});

test('não recria colaborador excluído na mesma competência e unidade', () => {
  const candidates = [
    { id: 'source-1', unit: 'Osasco', employeeName: 'Maria da Silva' },
  ];

  const selected = selectRecurringPayrollEntries(candidates, [], [
    { unit: 'Osasco', employeeKey: 'maria da silva' },
  ]);

  assert.deepEqual(selected, []);
});

test('exclusão em uma unidade não bloqueia homônimo de outra unidade', () => {
  const candidates = [
    { id: 'osasco', unit: 'Osasco', employeeName: 'Ana Souza' },
    { id: 'sbc', unit: 'SBC', employeeName: 'Ana Souza' },
  ];

  const selected = selectRecurringPayrollEntries(candidates, [], [
    { unit: 'Osasco', employeeKey: 'ana souza' },
  ]);

  assert.deepEqual(selected.map(entry => entry.id), ['sbc']);
});

test('não duplica colaborador já existente nem candidato repetido por unidade', () => {
  const candidates = [
    { id: 'existing', unit: 'SCS', employeeName: 'Carlos Lima' },
    { id: 'new-1', unit: 'SCS', employeeName: 'Joana Melo' },
    { id: 'new-2', unit: 'SCS', employeeName: '  Joana   Melo ' },
  ];

  const selected = selectRecurringPayrollEntries(
    candidates,
    [{ unit: 'SCS', employeeName: 'carlos lima' }],
    [],
  );

  assert.deepEqual(selected.map(entry => entry.id), ['new-1']);
});
