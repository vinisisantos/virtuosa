import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { calculatePayrollTotal } from '@/lib/payroll-adjustments';
import { ACTIVE_UNITS } from '@/lib/role-access';
import {
    requireUnitGuard,
    UnitAccessDeniedError,
    unitAccessDeniedResponse,
} from '@/lib/unit-guard';

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const requestedUnit = searchParams.get('unit');
    if (
        requestedUnit
        && requestedUnit !== 'all'
        && requestedUnit !== 'Todas'
        && !ACTIVE_UNITS.includes(requestedUnit as (typeof ACTIVE_UNITS)[number])
    ) {
        return NextResponse.json({ error: 'Unidade inválida' }, { status: 400 });
    }

    const guard = requireUnitGuard(request, { requestedUnit });
    if (guard instanceof NextResponse) return guard;
    if (!guard.isAdmin && !guard.permissions?.financeiro) {
        return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }
    if (
        !guard.isAdmin
        && !ACTIVE_UNITS.includes(guard.unitFilter as (typeof ACTIVE_UNITS)[number])
    ) {
        return NextResponse.json({ error: 'Unidade do usuário não configurada' }, { status: 403 });
    }

    try {
        if (requestedUnit && requestedUnit !== 'all' && requestedUnit !== 'Todas') {
            guard.enforceUnit(requestedUnit);
        }

        const imports = await prisma.payrollImport.findMany({
            where: guard.unitFilter ? { unit: guard.unitFilter } : undefined,
            include: {
                entries: { include: { adjustments: true } },
            },
        });

        const syncData = [];

        for (const imp of imports) {
            // Calculate total payroll cost for this import, applying 10% penalty if active
            const totalCost = imp.entries.reduce((sum, entry) => sum + calculatePayrollTotal(entry), 0);

            if (totalCost > 0) {
                // Ensure date formatting assigns it to the exact year/month of the competency
                // We'll set the date to the 5th day of the NEXT month (typical payroll payment date)
                // or just the last day of the competency month. 
                // Let's use the 5th day of the next month to be realistic for cash flow.
                let dateYear = imp.competenceYear;
                let dateMonth = imp.competenceMonth + 1; // 1-indexed (Jan = 1, Dec = 12)

                if (dateMonth > 12) {
                    dateMonth = 1;
                    dateYear++;
                }

                // Format: YYYY-MM-DD
                const dateString = `${dateYear}-${String(dateMonth).padStart(2, '0')}-05`;

                syncData.push({
                    type: 'cost',
                    name: `Folha de Pagamento - ${imp.competenceMonth}/${imp.competenceYear}`,
                    value: totalCost,
                    date: dateString,
                    category: 'Salários',
                    unit: imp.unit,
                    id: `payroll-${imp.id}`,
                    // Extra metadata just in case
                    competenceMonth: imp.competenceMonth,
                    competenceYear: imp.competenceYear,
                });
            }
        }

        return NextResponse.json({ success: true, data: syncData });
    } catch (err) {
        if (err instanceof UnitAccessDeniedError) return unitAccessDeniedResponse(err);
        console.error('Dashboard sync error:', err);
        return NextResponse.json({ error: 'Erro ao sincronizar dados com o dashboard' }, { status: 500 });
    }
}
