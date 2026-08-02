export type PaymentStatus = 'paid' | 'unpaid' | 'review';

export interface ExtractedEmployee {
    name: string;
    netSalary: number;
    baseSalary?: number;
    cargo?: string;
    confidenceScore: number;
    extractionSource: string;
}

export interface PayrollImportData {
    id: string;
    fileName: string;
    competenceMonth: number;
    competenceYear: number;
    unit?: string;
    uploadDate: string;
    processingStatus: string;
    entries: PayrollEntryData[];
}

export interface PayrollEntryData {
    id: string;
    payrollImportId: string;
    employeeName: string;
    netSalary: number;
    baseSalary: number | null;
    cargo: string | null;
    bonus: number | null;
    paymentStatus: PaymentStatus;
    paymentDate: string | null;
    confidenceScore: number;
    extractionSource: string | null;
    hasPenalty: boolean;
    hasAdiantamento: boolean;
    isRecurring: boolean;
    hasFgts: boolean;
    employmentType: EmploymentType;
    hazardPayRate: HazardPayRate;
    hazardPayBase: number | null;
    adjustments: PayrollAdjustmentData[];
    notes: string | null;
}

export type EmploymentType = 'CLT' | 'PJ' | null;
export type HazardPayRate = 0 | 10 | 20 | 40;
export type PayrollAdjustmentKind = 'absence' | 'award' | 'transport' | 'advance' | 'discount' | 'addition' | 'other';
export type PayrollAdjustmentDirection = 'credit' | 'debit';

export interface PayrollAdjustmentData {
    id: string;
    payrollEntryId: string;
    kind: PayrollAdjustmentKind;
    direction: PayrollAdjustmentDirection;
    label: string | null;
    quantity: number | null;
    amount: number | null;
    createdAt: string;
    updatedAt: string;
}

export interface PayrollSummary {
    totalPayroll: number;
    totalPaid: number;
    totalPending: number;
    totalEmployees: number;
    paidCount: number;
    pendingCount: number;
    reviewCount: number;
    totalBaseSalary: number;
    totalBonus: number;
    totalCredits: number;
    totalDebits: number;
    totalHazardPay: number;
    totalGrossSalary: number;
    totalInss: number;
    totalFgts: number;
    cltCount: number;
    pjCount: number;
    undefinedRegimeCount: number;
}
