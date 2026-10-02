import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import type { VacationReceipt } from '@/lib/payroll-vacation-calculation';
import { normalizePayrollEmployeeKey } from '@/lib/payroll-recurrence';
import { vacationCompetences } from '@/lib/payroll-vacations';
import { touchPayrollImportRevisions } from '@/lib/payroll-sync';

type LinkedPeriod = {
  id: string;
  advanceCostMode: string;
  advanceAmount: number;
  advancePaidAt: Date | null;
  linkedBackupId: string | null;
  linkedBillId: number | null;
  unit?: string;
  employeeKey?: string;
  employeeName?: string;
  startDate?: Date | string;
  endDate?: Date | string;
};

export type LinkedVacationPaymentState = {
  paid: boolean;
  backupUpdatedAt: Date | null;
};

export class VacationPayrollAlreadyPaidError extends Error {
  constructor() {
    super('O pagamento do adiantamento não pode alterar férias de uma folha já paga. Confira com a contabilidade.');
    this.name = 'VacationPayrollAlreadyPaidError';
  }
}

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

export async function linkedVacationPaymentState(
  periods: readonly LinkedPeriod[],
): Promise<Map<string, LinkedVacationPaymentState>> {
  const linked = periods.filter(period => period.advanceCostMode === 'manual'
    && period.linkedBackupId && period.linkedBillId != null);
  if (linked.length === 0) return new Map();
  const snapshots = await prisma.financialBackup.findMany({
    where: { id: { in: [...new Set(linked.map(period => period.linkedBackupId!))] } },
    select: { id: true, bills: true, updatedAt: true },
  });
  const billsByBackup = new Map<string, { bills: Record<string, unknown>[]; updatedAt: Date }>();
  for (const snapshot of snapshots) {
    try {
      const bills = JSON.parse(snapshot.bills);
      if (Array.isArray(bills)) billsByBackup.set(snapshot.id, { bills, updatedAt: snapshot.updatedAt });
    } catch { /* malformed legacy snapshot cannot authorize a deduction */ }
  }
  return new Map(linked.map(period => {
    const snapshot = billsByBackup.get(period.linkedBackupId!);
    const bill = snapshot?.bills.find(item => item.id === period.linkedBillId);
    const date = typeof bill?.dueDateManual === 'string' ? bill.dueDateManual : '';
    const payments = bill?.payments && typeof bill.payments === 'object' ? bill.payments as Record<string, unknown> : {};
    return [period.id, { paid: payments[date] === true, backupUpdatedAt: snapshot?.updatedAt || null }];
  }));
}

export function vacationAdvancePaid(
  period: LinkedPeriod,
  linkedPaymentState: Map<string, LinkedVacationPaymentState>,
): boolean {
  if (period.advanceCostMode === 'manual') return linkedPaymentState.get(period.id)?.paid === true;
  if (period.advanceCostMode === 'automatic') return period.advanceAmount > 0 && period.advancePaidAt !== null;
  return period.advanceAmount > 0 && period.advancePaidAt !== null;
}

function parseBills(value: unknown): Record<string, unknown>[] {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed)
      ? parsed.filter((bill): bill is Record<string, unknown> => Boolean(bill) && typeof bill === 'object' && !Array.isArray(bill))
      : [];
  } catch {
    return [];
  }
}

export function manualVacationBillPaid(value: unknown, billId: number): boolean {
  const bills = parseBills(value);
  const bill = bills.find(item => item.id === billId);
  const date = typeof bill?.dueDateManual === 'string' ? bill.dueDateManual : '';
  const payments = bill?.payments && typeof bill.payments === 'object' && !Array.isArray(bill.payments)
    ? bill.payments as Record<string, unknown>
    : {};
  return Boolean(date) && payments[date] === true;
}

export function changedManualVacationPaymentPeriods<T extends LinkedPeriod>(
  periods: readonly T[],
  previousBills: unknown,
  nextBills: unknown,
): T[] {
  const previous = parseBills(previousBills);
  const next = parseBills(nextBills);
  return periods.filter(period => period.advanceCostMode === 'manual'
    && period.linkedBillId != null
    && manualVacationBillPaid(previous, period.linkedBillId) !== manualVacationBillPaid(next, period.linkedBillId));
}

export async function refreshManualVacationPayrollRevisions(
  transaction: Prisma.TransactionClient,
  periods: readonly LinkedPeriod[],
) {
  const byUnit = new Map<string, LinkedPeriod[]>();
  for (const period of periods) {
    if (!period.unit || !period.employeeKey || !period.startDate || !period.endDate) continue;
    const current = byUnit.get(period.unit) || [];
    current.push(period);
    byUnit.set(period.unit, current);
  }

  const importIds = new Set<string>();
  for (const [unit, scopedPeriods] of byUnit) {
    const competences = new Map<string, { month: number; year: number }>();
    for (const period of scopedPeriods) {
      for (const competence of vacationCompetences({ startDate: period.startDate!, endDate: period.endDate! })) {
        competences.set(`${competence.year}-${competence.month}`, competence);
      }
    }
    const imports = await transaction.payrollImport.findMany({
      where: {
        unit,
        OR: [...competences.values()].map(({ month, year }) => ({ competenceMonth: month, competenceYear: year })),
      },
      select: {
        id: true, competenceMonth: true, competenceYear: true,
        entries: { select: { employeeName: true, paymentStatus: true } },
      },
    });
    for (const payrollImport of imports) {
      const affected = scopedPeriods.filter(period => [...vacationCompetences({
        startDate: period.startDate!, endDate: period.endDate!,
      })].some(competence => competence.month === payrollImport.competenceMonth
        && competence.year === payrollImport.competenceYear));
      const matchingEntries = payrollImport.entries.filter(entry => affected.some(period =>
        normalizePayrollEmployeeKey(entry.employeeName) === period.employeeKey));
      if (matchingEntries.some(entry => entry.paymentStatus === 'paid')) {
        throw new VacationPayrollAlreadyPaidError();
      }
      if (matchingEntries.length > 0) importIds.add(payrollImport.id);
    }
  }
  await touchPayrollImportRevisions(transaction, [...importIds]);
}
