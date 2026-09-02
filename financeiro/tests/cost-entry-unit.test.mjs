import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveCostEntryUnit } from '../src/lib/cost-entry-unit.ts';

test('usa a unidade ativa da tela em vez da unidade antiga do formulário', () => {
  assert.equal(resolveCostEntryUnit('Osasco', 'SCS'), 'Osasco');
  assert.equal(resolveCostEntryUnit('SBC', 'SCS'), 'SBC');
});

test('mantém a unidade do formulário quando a visão está em todas', () => {
  assert.equal(resolveCostEntryUnit('all', 'SCS'), 'SCS');
  assert.equal(resolveCostEntryUnit('Todas', 'Osasco'), 'Osasco');
  assert.equal(resolveCostEntryUnit('', 'SBC'), 'SBC');
});
