import { NextRequest } from 'next/server';
import { mutatePayrollEntryBooleanFlag } from '@/lib/payroll-entry-flag-mutation';

export async function PATCH(request: NextRequest) {
    return mutatePayrollEntryBooleanFlag(request, {
        field: 'hasPenalty',
        missingFieldsMessage: 'ID e status de multa obrigatórios',
        failureMessage: 'Erro ao atualizar multa',
    });
}
