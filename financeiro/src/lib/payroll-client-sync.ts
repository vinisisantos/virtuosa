'use client';

export const PAYROLL_SYNC_CHANNEL = 'virtuosa-payroll-sync';
export const PAYROLL_SYNC_EVENT = 'virtuosa-payroll-sync';

export interface PayrollSyncScope {
  competenceMonth: number;
  competenceYear: number;
  unit: string;
}

export interface PayrollSyncSignal extends PayrollSyncScope {
  revision: string | null;
}

interface PayrollSyncEnvelope extends PayrollSyncSignal {
  sourceId: string;
  publishedAt: number;
}

const sourceId = typeof globalThis.crypto?.randomUUID === 'function'
  ? globalThis.crypto.randomUUID()
  : `payroll-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function normalizePayrollSyncUnit(unit: string) {
  const normalized = unit.trim();
  return !normalized || normalized === 'Todas' ? 'all' : normalized;
}

export function payrollSyncSignalAffectsScope(
  signal: PayrollSyncScope,
  scope: PayrollSyncScope,
) {
  if (
    signal.competenceMonth !== scope.competenceMonth
    || signal.competenceYear !== scope.competenceYear
  ) {
    return false;
  }

  const signalUnit = normalizePayrollSyncUnit(signal.unit);
  const scopeUnit = normalizePayrollSyncUnit(scope.unit);
  return signalUnit === scopeUnit || signalUnit === 'all' || scopeUnit === 'all';
}

function isPayrollSyncEnvelope(value: unknown): value is PayrollSyncEnvelope {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<PayrollSyncEnvelope>;
  return Number.isInteger(candidate.competenceMonth)
    && Number.isInteger(candidate.competenceYear)
    && typeof candidate.unit === 'string'
    && (typeof candidate.revision === 'string' || candidate.revision === null)
    && typeof candidate.sourceId === 'string'
    && typeof candidate.publishedAt === 'number';
}

export function publishPayrollSync(signal: PayrollSyncSignal) {
  if (typeof window === 'undefined') return;

  const envelope: PayrollSyncEnvelope = {
    ...signal,
    unit: normalizePayrollSyncUnit(signal.unit),
    sourceId,
    publishedAt: Date.now(),
  };

  window.dispatchEvent(new CustomEvent<PayrollSyncEnvelope>(PAYROLL_SYNC_EVENT, {
    detail: envelope,
  }));

  if (typeof window.BroadcastChannel !== 'function') return;
  const channel = new window.BroadcastChannel(PAYROLL_SYNC_CHANNEL);
  channel.postMessage(envelope);
  channel.close();
}

export function subscribePayrollSync(listener: (signal: PayrollSyncSignal) => void) {
  if (typeof window === 'undefined') return () => undefined;

  const handleSignal = (value: unknown, ignoreOwnBroadcast: boolean) => {
    if (!isPayrollSyncEnvelope(value)) return;
    if (ignoreOwnBroadcast && value.sourceId === sourceId) return;
    listener({
      competenceMonth: value.competenceMonth,
      competenceYear: value.competenceYear,
      unit: value.unit,
      revision: value.revision,
    });
  };
  const handleLocalSignal = (event: Event) => {
    handleSignal((event as CustomEvent<unknown>).detail, false);
  };
  const channel = typeof window.BroadcastChannel === 'function'
    ? new window.BroadcastChannel(PAYROLL_SYNC_CHANNEL)
    : null;
  const handleBroadcastSignal = (event: MessageEvent<unknown>) => {
    handleSignal(event.data, true);
  };

  window.addEventListener(PAYROLL_SYNC_EVENT, handleLocalSignal);
  channel?.addEventListener('message', handleBroadcastSignal);

  return () => {
    window.removeEventListener(PAYROLL_SYNC_EVENT, handleLocalSignal);
    channel?.removeEventListener('message', handleBroadcastSignal);
    channel?.close();
  };
}
