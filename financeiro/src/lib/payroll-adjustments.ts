import type {
    EmploymentType,
    HazardPayRate,
    PayrollAdjustmentDirection,
    PayrollAdjustmentKind,
} from '@/lib/types';

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
    const grossSalary = baseSalary + hazardPay;
    const inss = isClt ? calculateProgressiveInss(grossSalary) : 0;
    const fgts = isClt && entry.hasFgts !== false ? grossSalary * 0.08 : 0;

    return {
        baseSalary,
        hazardPayRate,
        hazardPayBase,
        hazardPay,
        grossSalary,
        inss,
        fgts,
        netBeforeAdjustments: Math.max(0, grossSalary - inss),
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
    quantity: number | null;
    amount: number | null;
};

export function calculateAdjustmentValue(
    salary: number,
    employmentType: EmploymentType | string | null,
    adjustment: PayrollAdjustmentInput,
): number {
    if (adjustment.kind === 'absence') {
        if (employmentType !== 'CLT') return 0;
        return Math.max(0, salary) / 30 * Math.max(0, adjustment.quantity || 0);
    }

    return Math.max(0, adjustment.amount || 0);
}

export function calculateAdjustmentDelta(
    salary: number,
    employmentType: EmploymentType | string | null,
    adjustment: PayrollAdjustmentInput,
): number {
    const value = calculateAdjustmentValue(salary, employmentType, adjustment);
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
    adjustments?: PayrollAdjustmentInput[];
}): number {
    const legalFigures = calculatePayrollLegalFigures(entry);
    const salary = legalFigures.baseSalary;
    const legacyPenalty = entry.hasPenalty ? salary * 0.1 : 0;
    const adjustments = entry.adjustments || [];
    const adjustmentTotal = adjustments.reduce(
        (sum, adjustment) => sum + calculateAdjustmentDelta(salary, entry.employmentType || null, adjustment),
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
    adjustments?: PayrollAdjustmentInput[];
}>) {
    let totalCredits = 0;
    let totalDebits = 0;

    for (const entry of entries) {
        totalCredits += Math.max(0, entry.bonus || 0);
        for (const adjustment of entry.adjustments || []) {
            const value = calculateAdjustmentValue(getPayrollBaseSalary(entry), entry.employmentType || null, adjustment);
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
