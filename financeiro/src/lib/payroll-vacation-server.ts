import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import type { VacationReceipt } from '@/lib/payroll-vacation-calculation';

type LinkedPeriod = {
  id: string;
  advanceCostMode: string;
  advanceAmount: number;
  advancePaidAt: Date | null;
  linkedBackupId: string | null;
  linkedBillId: number | null;
};

export function storedVacationReceipt(value: Prisma.JsonValue | null): VacationReceipt | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.startDate !== 'string' || typeof row.endDate !== 'string'
    || typeof row.paymentDueDate !== 'string' || typeof row.totalDays !== 'number'
    || typeof row.baseSalary !== 'number' || typeof row.vacation !== 'number'
    || typeof row.third !== 'number' || typeof row.inss !== 'number'
    || typeof row.net !== 'number') return null;
  return row as VacationReceipt;
}

export async function linkedVacationPaymentState(periods: readonly LinkedPeriod[]): Promise<Map<string, boolean>> {
  const linked = periods.filter(period => period.advanceCostMode === 'manual'
    && period.linkedBackupId && period.linkedBillId != null);
  if (linked.length === 0) return new Map();
  const snapshots = await prisma.financialBackup.findMany({
    where: { id: { in: [...new Set(linked.map(period => period.linkedBackupId!))] } },
    select: { id: true, bills: true },
  });
  const billsByBackup = new Map<string, Record<string, unknown>[]>();
  for (const snapshot of snapshots) {
    try {
      const bills = JSON.parse(snapshot.bills);
      if (Array.isArray(bills)) billsByBackup.set(snapshot.id, bills);
    } catch { /* malformed legacy snapshot cannot authorize a deduction */ }
  }
  return new Map(linked.map(period => {
    const bill = (billsByBackup.get(period.linkedBackupId!) || []).find(item => item.id === period.linkedBillId);
    const date = typeof bill?.dueDateManual === 'string' ? bill.dueDateManual : '';
    const payments = bill?.payments && typeof bill.payments === 'object' ? bill.payments as Record<string, unknown> : {};
    return [period.id, payments[date] === true];
  }));
}

export function vacationAdvancePaid(period: LinkedPeriod, linkedPaymentState: Map<string, boolean>): boolean {
  if (period.advanceCostMode === 'manual') return linkedPaymentState.get(period.id) === true;
  if (period.advanceCostMode === 'automatic') return period.advanceAmount > 0 && period.advancePaidAt !== null;
  return period.advanceAmount > 0 && period.advancePaidAt !== null;
}
