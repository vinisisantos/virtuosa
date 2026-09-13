import assert from 'node:assert/strict';
import test from 'node:test';

const listeners = new Map();
const posted = [];
const channels = [];

class TestCustomEvent extends Event {
  constructor(type, init) {
    super(type);
    this.detail = init?.detail;
  }
}

class TestBroadcastChannel {
  constructor(name) {
    this.name = name;
    this.listeners = new Set();
    channels.push(this);
  }
  postMessage(value) { posted.push(value); }
  addEventListener(type, listener) { if (type === 'message') this.listeners.add(listener); }
  removeEventListener(type, listener) { if (type === 'message') this.listeners.delete(listener); }
  close() {}
}

globalThis.CustomEvent = TestCustomEvent;
globalThis.window = {
  BroadcastChannel: TestBroadcastChannel,
  addEventListener(type, listener) { listeners.set(type, listener); },
  removeEventListener(type, listener) {
    if (listeners.get(type) === listener) listeners.delete(type);
  },
  dispatchEvent(event) {
    listeners.get(event.type)?.(event);
    return true;
  },
};

const {
  FINANCIAL_BACKUP_SYNC_CHANNEL,
  FINANCIAL_BACKUP_SYNC_EVENT,
  publishFinancialBackupSync,
  subscribeFinancialBackupSync,
} = await import('../src/lib/financial-backup-client-sync.ts');

test('publica a revisão localmente e pelo canal entre abas', () => {
  const received = [];
  const unsubscribe = subscribeFinancialBackupSync(signal => received.push(signal));

  publishFinancialBackupSync({ revision: 'revision-2' });

  assert.deepEqual(received, [{ revision: 'revision-2' }]);
  assert.equal(posted.length, 1);
  assert.equal(posted[0].revision, 'revision-2');
  assert.equal(channels.every(channel => channel.name === FINANCIAL_BACKUP_SYNC_CHANNEL), true);
  assert.equal(listeners.has(FINANCIAL_BACKUP_SYNC_EVENT), true);

  unsubscribe();
  assert.equal(listeners.has(FINANCIAL_BACKUP_SYNC_EVENT), false);
});

test('aceita revisão válida recebida de outra aba e ignora payload incompleto', () => {
  const received = [];
  const unsubscribe = subscribeFinancialBackupSync(signal => received.push(signal));
  const subscriberChannel = channels.at(-1);

  for (const listener of subscriberChannel.listeners) {
    listener({ data: { revision: 'revision-3', sourceId: 'other-tab', publishedAt: Date.now() } });
    listener({ data: { revision: 'revision-invalid' } });
  }

  assert.deepEqual(received, [{ revision: 'revision-3' }]);
  unsubscribe();
});
