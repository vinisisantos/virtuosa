import type { PayrollEntryData } from '@/lib/types';
import {
  calculateAdjustmentValue,
  calculatePayrollLegalFigures,
  calculatePayrollTotal,
} from '@/lib/payroll-adjustments';
import { calculateVacationImpact, vacationDaysInCompetence } from '@/lib/payroll-vacations';

export type VacationPayrollPreview = {
  days: number;
  workedSalary: number;
  vacationSalary: number;
  vacationThird: number;
  bonus: number;
  inss: number;
  transportDiscount: number;
  otherAdjustments: number;
  advanceDeduction: number;
  net: number;
};

function validDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
}

export function previewVacationPayroll(
  entry: PayrollEntryData,
  month: number,
  year: number,
  startDate: string,
  endDate: string,
  advanceAmount: number,
): VacationPayrollPreview | null {
  if (entry.employmentType !== 'CLT') return null;
  const start = validDate(startDate);
  const end = validDate(endDate);
  if (!start || !end || !Number.isFinite(advanceAmount) || advanceAmount < 0) return null;
  const days = (end.getTime() - start.getTime()) / 86_400_000 + 1;
  if (days < 1 || days > 30 || !vacationDaysInCompetence({ startDate: start, endDate: end }, month, year)) return null;
  if ((entry.vacationPeriods || []).some(period =>
    new Date(period.startDate).getTime() <= end.getTime()
    && new Date(period.endDate).getTime() >= start.getTime()
  )) return null;

  const baseGross = calculatePayrollLegalFigures({ ...entry, vacation: null }).grossSalary;
  const vacation = calculateVacationImpact(
    [...(entry.vacationPeriods || []), { startDate: start, endDate: end, advanceAmount }],
    month,
    year,
    baseGross,
  );
  const candidate = { ...entry, vacation };
  const figures = calculatePayrollLegalFigures(candidate);
  let transportDiscount = 0;
  let otherAdjustments = entry.hasPenalty ? figures.baseSalary * 0.1 : 0;
  for (const adjustment of entry.adjustments || []) {
    const value = calculateAdjustmentValue(figures.baseSalary, entry.employmentType, adjustment, vacation.days);
    if (adjustment.direction === 'debit' && adjustment.kind === 'transport') transportDiscount += value;
    else otherAdjustments += adjustment.direction === 'credit' ? value : -value;
  }

  return {
    days: vacation.days,
    workedSalary: vacation.workedSalary,
    vacationSalary: vacation.salaryPortion,
    vacationThird: vacation.third,
    bonus: Math.max(0, entry.bonus || 0),
    inss: figures.inss,
    transportDiscount,
    otherAdjustments,
    advanceDeduction: vacation.advanceDeduction,
    net: Math.round(calculatePayrollTotal(candidate) * 100) / 100,
  };
}
