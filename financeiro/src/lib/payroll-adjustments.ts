import type {
    EmploymentType,
    HazardPayRate,
    PayrollAdjustmentDirection,
    PayrollAdjustmentKind,
} from '@/lib/types';
import type { PayrollVacationImpact } from '@/lib/payroll-vacations';
import type { VacationPayroll } from '@/lib/payroll-vacation-calculation';

export const CURRENT_MINIMUM_WAGE = 1621;
export const HAZARD_PAY_RATES: HazardPayRate[] = [0, 10, 20, 40];
export const TRANSPORT_DISCOUNT_RATE = 0.06;
export const AUTOMATIC_TRANSPORT_LABEL = 'Vale-transporte automático · 6% do salário-base';

const INSS_2026_BRACKETS = [
    { limit: 1621.00, rate: 0.075 },
    { limit: 2902.84, rate: 0.09 },
    { limit: 4354.27, rate: 0.12 },
    { limit: 8475.55, rate: 0.14 },
];

type PayrollLegalInput = {
    netSalary: number;
    baseSalary?: number | null;
    employmentType?: EmploymentType | string;
    hasFgts?: boolean;
    hazardPayRate?: number | null;
    hazardPayBase?: number | null;
    vacation?: PayrollVacationImpact | null;
    vacationPayroll?: VacationPayroll | null;
};

export function normalizeHazardPayRate(value: unknown): HazardPayRate {
    const rate = Number(value);
    return HAZARD_PAY_RATES.includes(rate as HazardPayRate) ? rate as HazardPayRate : 0;
}

export function getPayrollBaseSalary(entry: Pick<PayrollLegalInput, 'netSalary' | 'baseSalary'>): number {
    return Math.max(0, entry.baseSalary ?? entry.netSalary ?? 0);
}

export function calculateAutomaticTransportDiscount(baseSalary: number): number {
    return Math.round(Math.max(0, baseSalary) * TRANSPORT_DISCOUNT_RATE * 100) / 100;
}

export function calculateProgressiveInss(base: number): number {
    const cappedBase = Math.min(Math.max(0, base), INSS_2026_BRACKETS.at(-1)?.limit || 0);
    let previousLimit = 0;
    let total = 0;

    for (const bracket of INSS_2026_BRACKETS) {
        const taxableAmount = Math.min(cappedBase, bracket.limit) - previousLimit;
        if (taxableAmount <= 0) break;
        total += taxableAmount * bracket.rate;
        previousLimit = bracket.limit;
    }

    return Math.round(total * 100) / 100;
}

export function calculatePayrollLegalFigures(entry: PayrollLegalInput) {
    const baseSalary = getPayrollBaseSalary(entry);
    const isClt = entry.employmentType === 'CLT';
    const hazardPayRate = isClt ? normalizeHazardPayRate(entry.hazardPayRate) : 0;
    const hazardPayBase = hazardPayRate > 0
        ? Math.max(0, entry.hazardPayBase ?? CURRENT_MINIMUM_WAGE)
        : 0;
    const hazardPay = hazardPayBase * hazardPayRate / 100;
    const vacation = isClt ? entry.vacation : null;
    const detailedVacation = isClt ? entry.vacationPayroll : null;
    if (detailedVacation) {
        const grossSalary = detailedVacation.inssBase;
        return {
            baseSalary, hazardPayRate, hazardPayBase, hazardPay,
            vacationDays: detailedVacation.vacationDays,
            vacationSalary: detailedVacation.earnings.vacation,
            workedSalary: detailedVacation.earnings.salary,
            vacationThird: detailedVacation.earnings.third,
            vacationAdvanceDeduction: detailedVacation.deductions.vacationAdvance,
            grossSalary,
            inss: detailedVacation.inssTotal,
            irrf: detailedVacation.deductions.irrf,
            fgts: entry.hasFgts !== false ? detailedVacation.fgts : 0,
            netBeforeAdjustments: detailedVacation.net - detailedVacation.earnings.bonus,
        };
    }
    const grossSalary = baseSalary + hazardPay + (vacation?.third || 0);
    const inss = isClt ? calculateProgressiveInss(grossSalary) : 0;
    const fgts = isClt && entry.hasFgts !== false ? grossSalary * 0.08 : 0;

    return {
        baseSalary,
        hazardPayRate,
        hazardPayBase,
        hazardPay,
        vacationDays: vacation?.days || 0,
        vacationSalary: vacation?.salaryPortion || 0,
        workedSalary: vacation?.workedSalary ?? baseSalary + hazardPay,
        vacationThird: vacation?.third || 0,
        vacationAdvanceDeduction: vacation?.advanceDeduction || 0,
        grossSalary,
        inss,
        irrf: 0,
        fgts,
        netBeforeAdjustments: Math.max(0, grossSalary - inss - (vacation?.advanceDeduction || 0)),
    };
}

export const PAYROLL_ADJUSTMENT_KINDS: Record<PayrollAdjustmentKind, {
    label: string;
    input: 'days' | 'currency';
    defaultDirection: PayrollAdjustmentDirection;
}> = {
    absence: { label: 'Falta', input: 'days', defaultDirection: 'debit' },
    award: { label: 'Premiação', input: 'currency', defaultDirection: 'credit' },
    transport: { label: 'Vale-transporte', input: 'currency', defaultDirection: 'debit' },
    advance: { label: 'Adiantamento', input: 'currency', defaultDirection: 'debit' },
    discount: { label: 'Desconto', input: 'currency', defaultDirection: 'debit' },
    addition: { label: 'Acréscimo', input: 'currency', defaultDirection: 'credit' },
    other: { label: 'Outro', input: 'currency', defaultDirection: 'debit' },
};

export type PayrollAdjustmentInput = {
    kind: string;
    direction: string;
    label?: string | null;
    quantity: number | null;
    amount: number | null;
};

export function calculateAdjustmentValue(
    salary: number,
    employmentType: EmploymentType | string | null,
    adjustment: PayrollAdjustmentInput,
    vacationDays = 0,
): number {
    if (adjustment.kind === 'absence') {
        if (employmentType !== 'CLT') return 0;
        return Math.max(0, salary) / 30 * Math.max(0, adjustment.quantity || 0);
    }

    const amount = Math.max(0, adjustment.amount || 0);
    if (employmentType === 'CLT' && adjustment.kind === 'transport'
        && adjustment.label === AUTOMATIC_TRANSPORT_LABEL && vacationDays > 0) {
        return Math.round(amount * Math.max(0, 30 - Math.min(30, vacationDays)) / 30 * 100) / 100;
    }
    return amount;
}

export function calculateAdjustmentDelta(
    salary: number,
    employmentType: EmploymentType | string | null,
    adjustment: PayrollAdjustmentInput,
    vacationDays = 0,
): number {
    const value = calculateAdjustmentValue(salary, employmentType, adjustment, vacationDays);
    return adjustment.direction === 'credit' ? value : -value;
}

export function calculatePayrollTotal(entry: {
    netSalary: number;
    baseSalary?: number | null;
    bonus?: number | null;
    employmentType?: EmploymentType | string;
    hasFgts?: boolean;
    hazardPayRate?: number | null;
    hazardPayBase?: number | null;
    hasPenalty?: boolean;
    vacation?: PayrollVacationImpact | null;
    vacationPayroll?: VacationPayroll | null;
    adjustments?: PayrollAdjustmentInput[];
}): number {
    const legalFigures = calculatePayrollLegalFigures(entry);
    const salary = legalFigures.baseSalary;
    const legacyPenalty = entry.hasPenalty ? salary * 0.1 : 0;
    const adjustments = entry.adjustments || [];
    const effectiveAdjustments = entry.vacationPayroll
        ? adjustments.filter(adjustment => !(adjustment.kind === 'transport' && adjustment.label === AUTOMATIC_TRANSPORT_LABEL))
        : adjustments;
    const adjustmentTotal = effectiveAdjustments.reduce(
        (sum, adjustment) => sum + calculateAdjustmentDelta(salary, entry.employmentType || null, adjustment, legalFigures.vacationDays),
        0,
    );

    return Math.max(0, legalFigures.netBeforeAdjustments + Math.max(0, entry.bonus || 0) + legacyPenalty + adjustmentTotal);
}

export function summarizePayrollAdjustments(entries: Array<{
    netSalary: number;
    baseSalary?: number | null;
    bonus?: number | null;
    employmentType?: EmploymentType | string;
    hasPenalty?: boolean;
    vacation?: PayrollVacationImpact | null;
    vacationPayroll?: VacationPayroll | null;
    adjustments?: PayrollAdjustmentInput[];
}>) {
    let totalCredits = 0;
    let totalDebits = 0;

    for (const entry of entries) {
        totalCredits += Math.max(0, entry.bonus || 0);
        totalCredits += entry.vacationPayroll?.earnings.third ?? entry.vacation?.third ?? 0;
        totalDebits += entry.vacationPayroll?.deductions.vacationAdvance ?? entry.vacation?.advanceDeduction ?? 0;
        for (const adjustment of entry.adjustments || []) {
            const value = calculateAdjustmentValue(getPayrollBaseSalary(entry), entry.employmentType || null, adjustment, entry.vacation?.days);
            if (adjustment.direction === 'credit') totalCredits += value;
            else totalDebits += value;
        }
    }

    return { totalCredits, totalDebits };
}

export function normalizeEmploymentType(value: unknown): EmploymentType {
    if (value === 'CLT' || value === 'PJ') return value;
    return null;
}
