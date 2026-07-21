import type {
    EmploymentType,
    PayrollAdjustmentDirection,
    PayrollAdjustmentKind,
} from '@/lib/types';

export const PAYROLL_ADJUSTMENT_KINDS: Record<PayrollAdjustmentKind, {
    label: string;
    input: 'days' | 'currency';
    defaultDirection: PayrollAdjustmentDirection;
}> = {
    absence: { label: 'Falta', input: 'days', defaultDirection: 'debit' },
    award: { label: 'Premiação', input: 'currency', defaultDirection: 'credit' },
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
    employmentType?: EmploymentType | string;
    hasPenalty?: boolean;
    adjustments?: PayrollAdjustmentInput[];
}): number {
    const salary = Math.max(0, entry.netSalary || 0);
    const legacyPenalty = entry.hasPenalty ? salary * 0.1 : 0;
    const adjustments = entry.adjustments || [];
    const adjustmentTotal = adjustments.reduce(
        (sum, adjustment) => sum + calculateAdjustmentDelta(salary, entry.employmentType || null, adjustment),
        0,
    );

    return Math.max(0, salary + legacyPenalty + adjustmentTotal);
}

export function summarizePayrollAdjustments(entries: Array<{
    netSalary: number;
    employmentType?: EmploymentType | string;
    hasPenalty?: boolean;
    adjustments?: PayrollAdjustmentInput[];
}>) {
    let totalCredits = 0;
    let totalDebits = 0;

    for (const entry of entries) {
        for (const adjustment of entry.adjustments || []) {
            const value = calculateAdjustmentValue(entry.netSalary, entry.employmentType || null, adjustment);
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
