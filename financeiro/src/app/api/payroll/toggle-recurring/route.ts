import { NextRequest, NextResponse } from 'next/server';
import { getUserFromHeaders } from '@/lib/auth';
import { prisma } from '@/lib/db';

// PATCH — toggle isRecurring on a PayrollEntry
export async function PATCH(request: NextRequest) {
    const user = getUserFromHeaders(request);
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    if (!user.isAdmin && !user.permissions?.financeiro)
        return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    try {
        const body = await request.json();
        const { id, isRecurring } = body;
        if (!id || isRecurring === undefined) {
            return NextResponse.json({ error: 'ID e isRecurring são obrigatórios' }, { status: 400 });
        }
        const entry = await prisma.payrollEntry.update({
            where: { id },
            data: { isRecurring: Boolean(isRecurring) },
        });
        return NextResponse.json(entry);
    } catch (err) {
        console.error('Toggle recurring error:', err);
        return NextResponse.json({ error: 'Erro ao atualizar recorrência' }, { status: 500 });
    }
}
