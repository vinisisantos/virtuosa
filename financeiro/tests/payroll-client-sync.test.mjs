import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PAYROLL_SYNC_CHANNEL,
  PAYROLL_SYNC_EVENT,
  normalizePayrollSyncUnit,
  payrollSyncSignalAffectsScope,
  publishPayrollSync,
  subscribePayrollSync,
} from '../src/lib/payroll-client-sync.ts';

test('normaliza a unidade compartilhada sem alterar unidades específicas', () => {
  assert.equal(normalizePayrollSyncUnit(''), 'all');
  assert.equal(normalizePayrollSyncUnit('  Todas  '), 'all');
  assert.equal(normalizePayrollSyncUnit(' Osasco '), 'Osasco');
});

test('sinal só afeta a mesma competência e unidades compatíveis', () => {
  const scope = { competenceMonth: 9, competenceYear: 2026, unit: 'Osasco' };

  assert.equal(payrollSyncSignalAffectsScope({ ...scope }, scope), true);
  assert.equal(payrollSyncSignalAffectsScope({ ...scope, unit: 'all' }, scope), true);
  assert.equal(payrollSyncSignalAffectsScope({ ...scope, unit: 'Todas' }, scope), true);
  assert.equal(payrollSyncSignalAffectsScope({ ...scope, unit: 'SBC' }, scope), false);
  assert.equal(payrollSyncSignalAffectsScope({ ...scope, competenceMonth: 8 }, scope), false);
  assert.equal(payrollSyncSignalAffectsScope({ ...scope, competenceYear: 2025 }, scope), false);
});

test('publica uma vez na aba atual e recebe atualizações válidas de outra aba', () => {
  const previousWindow = globalThis.window;
  const channels = new Set();

  class FakeBroadcastChannel extends EventTarget {
    constructor(name) {
      super();
      this.name = name;
      channels.add(this);
    }

    postMessage(data) {
      for (const channel of channels) {
        if (channel !== this && channel.name === this.name) {
          channel.dispatchEvent(new MessageEvent('message', { data }));
        }
      }
    }

    close() {
      channels.delete(this);
    }
  }

  const fakeWindow = new EventTarget();
  fakeWindow.BroadcastChannel = FakeBroadcastChannel;
  globalThis.window = fakeWindow;

  try {
    const received = [];
    const unsubscribe = subscribePayrollSync(signal => received.push(signal));
    const localSignal = {
      competenceMonth: 9,
      competenceYear: 2026,
      unit: 'Todas',
      revision: 'revision-local',
    };

    publishPayrollSync(localSignal);
    assert.deepEqual(received, [{ ...localSignal, unit: 'all' }]);

    const remoteChannel = new FakeBroadcastChannel(PAYROLL_SYNC_CHANNEL);
    remoteChannel.postMessage({
      competenceMonth: 9,
      competenceYear: 2026,
      unit: 'Osasco',
      revision: 'revision-remote',
      sourceId: 'outra-aba',
      publishedAt: Date.now(),
    });
    assert.deepEqual(received.at(-1), {
      competenceMonth: 9,
      competenceYear: 2026,
      unit: 'Osasco',
      revision: 'revision-remote',
    });

    fakeWindow.dispatchEvent(new CustomEvent(PAYROLL_SYNC_EVENT, {
      detail: { competenceMonth: 9, competenceYear: 2026 },
    }));
    assert.equal(received.length, 2, 'ignora sinais incompletos');

    unsubscribe();
    remoteChannel.postMessage({
      competenceMonth: 9,
      competenceYear: 2026,
      unit: 'Osasco',
      revision: 'revision-after-cleanup',
      sourceId: 'outra-aba',
      publishedAt: Date.now(),
    });
    assert.equal(received.length, 2, 'remove os dois listeners no cleanup');
    remoteChannel.close();
    assert.equal(channels.size, 0);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});
