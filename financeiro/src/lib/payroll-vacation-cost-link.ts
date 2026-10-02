import { normalizePayrollEmployeeKey } from '@/lib/payroll-recurrence';

export type ManualVacationCostMatch = {
  backupId: string;
  billId: number;
  name: string;
  date: string;
  paid: boolean;
};

type BackupSnapshot = { id: string; bills: string };

export function findManualVacationCostMatches(
  snapshots: BackupSnapshot[],
  input: { unit: string; employeeName: string; netAmount: number; paymentMonth: string },
): ManualVacationCostMatch[] {
  const fold = (value: string) => normalizePayrollEmployeeKey(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const firstName = fold(input.employeeName).split(' ')[0];
  const expectedCents = Math.round(input.netAmount * 100);
  const matches: ManualVacationCostMatch[] = [];
  for (const snapshot of snapshots) {
    let bills: unknown;
    try { bills = JSON.parse(snapshot.bills); } catch { continue; }
    if (!Array.isArray(bills)) continue;
    for (const bill of bills) {
      if (!bill || typeof bill !== 'object' || Array.isArray(bill)) continue;
      const row = bill as Record<string, unknown>;
      const name = typeof row.name === 'string' ? row.name : '';
      const key = fold(name);
      const date = typeof row.dueDateManual === 'string' ? row.dueDateManual : '';
      if (!Number.isInteger(row.id) || row.type !== 'variavel'
        || row.unit !== input.unit || !key.includes('ferias') || !key.includes(firstName)
        || Math.round(Number(row.value) * 100) !== expectedCents
        || date.slice(0, 7) !== input.paymentMonth) continue;
      const payments = row.payments && typeof row.payments === 'object' && !Array.isArray(row.payments)
        ? row.payments as Record<string, unknown> : {};
      matches.push({
        backupId: snapshot.id,
        billId: row.id as number,
        name,
        date,
        paid: payments[date] === true,
      });
    }
  }
  return matches;
}
