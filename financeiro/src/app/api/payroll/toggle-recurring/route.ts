import { NextRequest } from 'next/server';
import { mutatePayrollEntryBooleanFlag } from '@/lib/payroll-entry-flag-mutation';

// PATCH — toggle isRecurring on a PayrollEntry
export async function PATCH(request: NextRequest) {
    return mutatePayrollEntryBooleanFlag(request, {
        field: 'isRecurring',
        missingFieldsMessage: 'ID e isRecurring são obrigatórios',
        failureMessage: 'Erro ao atualizar recorrência',
    });
}
