import { NextRequest, NextResponse } from 'next/server';
import { getUserFromHeaders } from '@/lib/auth';
import { prisma } from '@/lib/db';

// PATCH — toggle payment status
export async function PATCH(request: NextRequest) {
    const user = getUserFromHeaders(request);
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    if (!user.isAdmin && !user.permissions?.financeiro)
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
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

// POST — batch mark all as paid for a given competence + unit OR for specific IDs
export async function POST(request: NextRequest) {
    const user = getUserFromHeaders(request);
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    if (!user.isAdmin && !user.permissions?.financeiro)
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    try {
        const body = await request.json();
        const { competenceMonth, competenceYear, unit, ids } = body;

        let whereClause: any = {};

        if (ids && Array.isArray(ids) && ids.length > 0) {
            whereClause = { id: { in: ids } };
        } else if (competenceMonth && competenceYear) {
            whereClause = {
                paymentStatus: { not: 'paid' },
                payrollImport: { competenceMonth, competenceYear },
            };
            if (unit) whereClause.payrollImport.unit = unit;
        } else {
            return NextResponse.json({ error: 'IDs ou Competência são obrigatórios' }, { status: 400 });
        }

        const result = await prisma.payrollEntry.updateMany({
            where: whereClause,
            data: { paymentStatus: 'paid', paymentDate: new Date() },
        });

        return NextResponse.json({ success: true, updatedCount: result.count });
    } catch (err: any) {
        console.error('POST batch payment error:', err);
        return NextResponse.json({ error: `Erro interno: ${err.message || 'Desconhecido'}` }, { status: 500 });
    }
}
