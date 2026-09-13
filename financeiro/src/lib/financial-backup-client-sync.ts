'use client';

export const FINANCIAL_BACKUP_SYNC_CHANNEL = 'virtuosa-financial-backup-sync';
export const FINANCIAL_BACKUP_SYNC_EVENT = 'virtuosa-financial-backup-sync';

export interface FinancialBackupSyncSignal {
  revision: string;
}

interface FinancialBackupSyncEnvelope extends FinancialBackupSyncSignal {
  sourceId: string;
  publishedAt: number;
}

const sourceId = typeof globalThis.crypto?.randomUUID === 'function'
  ? globalThis.crypto.randomUUID()
  : `financial-backup-${Date.now()}-${Math.random().toString(36).slice(2)}`;

function isFinancialBackupSyncEnvelope(value: unknown): value is FinancialBackupSyncEnvelope {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<FinancialBackupSyncEnvelope>;
  return typeof candidate.revision === 'string'
    && typeof candidate.sourceId === 'string'
    && typeof candidate.publishedAt === 'number';
}

export function publishFinancialBackupSync(signal: FinancialBackupSyncSignal) {
  if (typeof window === 'undefined') return;

  const envelope: FinancialBackupSyncEnvelope = {
    ...signal,
    sourceId,
    publishedAt: Date.now(),
  };
  window.dispatchEvent(new CustomEvent<FinancialBackupSyncEnvelope>(
    FINANCIAL_BACKUP_SYNC_EVENT,
    { detail: envelope },
  ));

  if (typeof window.BroadcastChannel !== 'function') return;
  const channel = new window.BroadcastChannel(FINANCIAL_BACKUP_SYNC_CHANNEL);
  channel.postMessage(envelope);
  channel.close();
}

export function subscribeFinancialBackupSync(
  listener: (signal: FinancialBackupSyncSignal) => void,
) {
  if (typeof window === 'undefined') return () => undefined;

  const handleSignal = (value: unknown, ignoreOwnBroadcast: boolean) => {
    if (!isFinancialBackupSyncEnvelope(value)) return;
    if (ignoreOwnBroadcast && value.sourceId === sourceId) return;
    listener({ revision: value.revision });
  };
  const handleLocalSignal = (event: Event) => {
    handleSignal((event as CustomEvent<unknown>).detail, false);
  };
  const channel = typeof window.BroadcastChannel === 'function'
    ? new window.BroadcastChannel(FINANCIAL_BACKUP_SYNC_CHANNEL)
    : null;
  const handleBroadcastSignal = (event: MessageEvent<unknown>) => {
    handleSignal(event.data, true);
  };

  window.addEventListener(FINANCIAL_BACKUP_SYNC_EVENT, handleLocalSignal);
  channel?.addEventListener('message', handleBroadcastSignal);

  return () => {
    window.removeEventListener(FINANCIAL_BACKUP_SYNC_EVENT, handleLocalSignal);
    channel?.removeEventListener('message', handleBroadcastSignal);
    channel?.close();
  };
}
