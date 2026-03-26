import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// PATCH — toggle payment status
export async function PATCH(request: NextRequest) {
    try {
        const body = await request.json();
        const { id, paymentStatus } = body;

        if (!id || !paymentStatus) {
            return NextResponse.json({ error: 'ID e status são obrigatórios' }, { status: 400 });
        }

        if (!['paid', 'unpaid', 'review'].includes(paymentStatus)) {
            return NextResponse.json({ error: 'Status inválido' }, { status: 400 });
        }

        const entry = await prisma.payrollEntry.update({
            where: { id },
            data: {
                paymentStatus,
                paymentDate: paymentStatus === 'paid' ? new Date() : null,
            },
        });

        return NextResponse.json(entry);
    } catch (err) {
        console.error('PATCH payment error:', err);
        return NextResponse.json({ error: 'Erro ao atualizar pagamento' }, { status: 500 });
    }
}

// POST — batch mark all as paid for a given competence + unit
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { competenceMonth, competenceYear, unit } = body;

        if (!competenceMonth || !competenceYear) {
            return NextResponse.json({ error: 'Competência é obrigatória' }, { status: 400 });
        }

        const whereClause: any = {
            paymentStatus: { not: 'paid' },
            payrollImport: { competenceMonth, competenceYear },
        };
        if (unit) whereClause.payrollImport.unit = unit;

        const result = await prisma.payrollEntry.updateMany({
            where: whereClause,
            data: { paymentStatus: 'paid', paymentDate: new Date() },
        });

        return NextResponse.json({ success: true, updatedCount: result.count });
    } catch (err) {
        console.error('POST batch payment error:', err);
        return NextResponse.json({ error: 'Erro ao pagar todos' }, { status: 500 });
    }
}
