import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function PATCH(request: NextRequest) {
    try {
        const body = await request.json();
        const { id, hasPenalty } = body;

        if (!id || typeof hasPenalty !== 'boolean') {
            return NextResponse.json({ error: 'ID e status de multa obrigatórios' }, { status: 400 });
        }

        const entry = await prisma.payrollEntry.update({
            where: { id },
            data: {
                hasPenalty,
            },
        });

        return NextResponse.json(entry);
    } catch (err) {
        console.error('Penalty toggle error:', err);
        return NextResponse.json({ error: 'Erro ao atualizar multa' }, { status: 500 });
    }
}
