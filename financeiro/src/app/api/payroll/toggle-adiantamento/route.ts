import { NextRequest } from 'next/server';
import { mutatePayrollEntryBooleanFlag } from '@/lib/payroll-entry-flag-mutation';

// PATCH — toggle hasAdiantamento on a PayrollEntry
export async function PATCH(request: NextRequest) {
    return mutatePayrollEntryBooleanFlag(request, {
        field: 'hasAdiantamento',
        missingFieldsMessage: 'ID e hasAdiantamento são obrigatórios',
        failureMessage: 'Erro ao atualizar adiantamento',
    });
}
