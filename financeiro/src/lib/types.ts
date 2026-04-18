export type PaymentStatus = 'paid' | 'unpaid' | 'review';

export interface ExtractedEmployee {
    name: string;
    netSalary: number;
    confidenceScore: number;
    extractionSource: string;
}

export interface PayrollImportData {
    id: string;
    fileName: string;
    competenceMonth: number;
    competenceYear: number;
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
    notes: string | null;
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
}
