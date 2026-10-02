import type { PayrollEntryData } from '@/lib/types';
import {
  calculateAdjustmentValue,
  calculatePayrollLegalFigures,
  calculatePayrollTotal,
} from '@/lib/payroll-adjustments';
import { calculateVacationImpact, vacationDaysInCompetence } from '@/lib/payroll-vacations';
import { calculateCombinedVacationPayroll, calculateVacationReceipt, type InssBracket, type IrrfTable } from '@/lib/payroll-vacation-calculation';
import { AUTOMATIC_TRANSPORT_LABEL } from '@/lib/payroll-adjustments';

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
  taxConfig?: { inssBrackets: InssBracket[]; irrfTable: IrrfTable } | null,
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

  if (taxConfig && (entry.vacationPeriods || []).every(period => period.receipt)) {
    const baseGross = calculatePayrollLegalFigures({ ...entry, vacation: null, vacationPayroll: null }).grossSalary;
    const receipt = calculateVacationReceipt({ startDate: start, endDate: end, baseSalary: baseGross, inssBrackets: taxConfig.inssBrackets });
    const periods = [
      ...(entry.vacationPeriods || []).map(period => ({ receipt: period.receipt!, advancePaid: period.advanceAmount > 0 })),
      { receipt, advancePaid: false },
    ];
    const payroll = calculateCombinedVacationPayroll({
      periods, competenceMonth: month, competenceYear: year,
      baseSalary: baseGross, bonus: entry.bonus || 0,
      transportEnabled: (entry.adjustments || []).some(adjustment => adjustment.kind === 'transport'
        && adjustment.label === AUTOMATIC_TRANSPORT_LABEL),
      actualTransportCost: entry.transportActualCost,
      inssBrackets: taxConfig.inssBrackets,
      irrfTable: taxConfig.irrfTable,
    });
    const otherAdjustments = (entry.adjustments || []).filter(adjustment =>
      !(adjustment.kind === 'transport' && adjustment.label === AUTOMATIC_TRANSPORT_LABEL),
    ).reduce((sum, adjustment) => sum + (adjustment.direction === 'credit' ? 1 : -1)
      * calculateAdjustmentValue(baseGross, entry.employmentType, adjustment, payroll.vacationDays), 0);
    return {
      days: payroll.vacationDays,
      workedSalary: payroll.earnings.salary,
      vacationSalary: payroll.earnings.vacation,
      vacationThird: payroll.earnings.third,
      bonus: payroll.earnings.bonus,
      inss: payroll.inssTotal,
      transportDiscount: payroll.deductions.transport,
      otherAdjustments,
      advanceDeduction: payroll.deductions.vacationAdvance,
      net: Math.round(calculatePayrollTotal({ ...entry, vacationPayroll: payroll }) * 100) / 100,
    };
  }

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
