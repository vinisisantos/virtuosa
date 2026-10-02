import { normalizePayrollEmployeeKey } from '@/lib/payroll-recurrence';

export type PayrollVacationPeriod = {
  id: string;
  unit: string;
  employeeKey: string;
  employeeName: string;
  startDate: Date | string;
  endDate: Date | string;
  advanceAmount: number;
  advancePaidAt: Date | string | null;
  updatedAt: Date | string;
};

export type PayrollVacationImpact = {
  days: number;
  salaryPortion: number;
  workedSalary: number;
  third: number;
  advanceDeduction: number;
};

const DAY_MS = 86_400_000;

function dayNumber(value: Date | string): number {
  const date = value instanceof Date ? value : new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  return Math.floor(date.getTime() / DAY_MS);
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function payrollVacationScopeKey(unit: string, employeeName: string): string {
  return `${unit}\u0000${normalizePayrollEmployeeKey(employeeName)}`;
}

export function vacationDaysInCompetence(
  period: Pick<PayrollVacationPeriod, 'startDate' | 'endDate'>,
  month: number,
  year: number,
): number {
  const first = Date.UTC(year, month - 1, 1) / DAY_MS;
  const last = Date.UTC(year, month, 1) / DAY_MS - 1;
  return Math.max(0, Math.min(last, dayNumber(period.endDate)) - Math.max(first, dayNumber(period.startDate)) + 1);
}

export function vacationCompetences(period: Pick<PayrollVacationPeriod, 'startDate' | 'endDate'>) {
  const result: Array<{ month: number; year: number }> = [];
  const start = new Date(dayNumber(period.startDate) * DAY_MS);
  const end = new Date(dayNumber(period.endDate) * DAY_MS);
  let year = start.getUTCFullYear();
  let month = start.getUTCMonth() + 1;
  while (year < end.getUTCFullYear() || (year === end.getUTCFullYear() && month <= end.getUTCMonth() + 1)) {
    result.push({ month, year });
    month += 1;
    if (month === 13) { month = 1; year += 1; }
  }
  return result;
}

export function calculateVacationImpact(
  periods: Array<Pick<PayrollVacationPeriod, 'startDate' | 'endDate' | 'advanceAmount'>>,
  month: number,
  year: number,
  monthlyGrossSalary: number,
): PayrollVacationImpact {
  let days = 0;
  let advanceDeduction = 0;
  for (const period of periods) {
    const periodDays = vacationDaysInCompetence(period, month, year);
    if (periodDays === 0) continue;
    days += periodDays;
    const totalDays = dayNumber(period.endDate) - dayNumber(period.startDate) + 1;
    const monthLast = Date.UTC(year, month, 1) / DAY_MS - 1;
    const daysThroughMonth = Math.min(totalDays, monthLast - dayNumber(period.startDate) + 1);
    const daysBeforeMonth = daysThroughMonth - periodDays;
    advanceDeduction += roundMoney(period.advanceAmount * daysThroughMonth / totalDays)
      - roundMoney(period.advanceAmount * daysBeforeMonth / totalDays);
  }

  const salaryPortion = roundMoney(Math.max(0, monthlyGrossSalary) * Math.min(days, 30) / 30);
  return {
    days,
    salaryPortion,
    workedSalary: roundMoney(Math.max(0, monthlyGrossSalary) - salaryPortion),
    third: roundMoney(salaryPortion / 3),
    advanceDeduction: roundMoney(advanceDeduction),
  };
}
