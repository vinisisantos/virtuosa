import { NextRequest, NextResponse } from 'next/server';
import { getUserFromHeaders } from '@/lib/auth';
import { prisma } from '@/lib/db';

// PATCH — toggle hasAdiantamento on a PayrollEntry
export async function PATCH(request: NextRequest) {
    const user = getUserFromHeaders(request);
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    if (!user.isAdmin && !user.permissions?.financeiro)
        return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    try {
        const body = await request.json();
        const { id, hasAdiantamento } = body;
        if (!id || hasAdiantamento === undefined) {
            return NextResponse.json({ error: 'ID e hasAdiantamento são obrigatórios' }, { status: 400 });
        }
        const entry = await prisma.payrollEntry.update({
            where: { id },
            data: { hasAdiantamento: Boolean(hasAdiantamento) },
        });
        return NextResponse.json(entry);
    } catch (err) {
        console.error('Toggle adiantamento error:', err);
        return NextResponse.json({ error: 'Erro ao atualizar adiantamento' }, { status: 500 });
    }
}
