import assert from 'node:assert/strict';
import test from 'node:test';
import { pendingCostAdditions } from '../src/lib/pending-cost-additions.ts';

test('conflito preserva só custos criados aqui que o snapshot remoto ainda não tem', () => {
  const local = [{ id: 1, name: 'Antigo' }, { id: 2, name: 'Novo daqui' }, { id: 3, name: 'Já sincronizado' }];
  const remote = [{ id: 1, name: 'Antigo editado em outro aparelho' }, { id: 3, name: 'Já sincronizado' }, { id: 9, name: 'Novo de outro aparelho' }];
  assert.deepEqual(pendingCostAdditions(local, remote, new Set([2, 3])), [{ id: 2, name: 'Novo daqui' }]);
  assert.deepEqual(pendingCostAdditions(local, remote, new Set()), []);
});
