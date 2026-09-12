import { NextRequest } from 'next/server';
import { mutatePayrollEntryBooleanFlag } from '@/lib/payroll-entry-flag-mutation';

export async function POST(request: NextRequest) {
    const response = await mutatePayrollEntryBooleanFlag(request, {
        field: 'hasFgts',
        missingFieldsMessage: 'ID e status de FGTS são obrigatórios',
        failureMessage: 'Erro ao atualizar FGTS',
    });

    if (!response.ok) return response;
    const entry = await response.json();
    return Response.json({ success: true, entry });
}
