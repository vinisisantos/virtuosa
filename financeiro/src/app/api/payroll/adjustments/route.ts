import { NextRequest, NextResponse } from 'next/server';
import { getUserFromHeaders } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { PAYROLL_ADJUSTMENT_KINDS, normalizeEmploymentType } from '@/lib/payroll-adjustments';
import type { PayrollAdjustmentDirection, PayrollAdjustmentKind } from '@/lib/types';

function authorize(request: NextRequest) {
    const user = getUserFromHeaders(request);
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    if (!user.isAdmin && !user.permissions?.financeiro) {
        return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }
    return null;
}

function parseKind(value: unknown): PayrollAdjustmentKind | null {
    if (typeof value !== 'string' || !(value in PAYROLL_ADJUSTMENT_KINDS)) return null;
    return value as PayrollAdjustmentKind;
}

function parseDirection(value: unknown): PayrollAdjustmentDirection {
    return value === 'credit' ? 'credit' : 'debit';
}

async function buildAdjustmentData(body: Record<string, unknown>, payrollEntryId: string) {
    const kind = parseKind(body.kind);
    if (!kind) throw new Error('Tipo de ajuste inválido');

    const entry = await prisma.payrollEntry.findUnique({
        where: { id: payrollEntryId },
        select: { id: true, employmentType: true },
    });
    if (!entry) throw new Error('Colaborador não encontrado');

    const employmentType = normalizeEmploymentType(entry.employmentType);
    if (kind === 'absence' && employmentType !== 'CLT') {
        throw new Error('Faltas automáticas são permitidas somente para colaboradores CLT');
    }

    const config = PAYROLL_ADJUSTMENT_KINDS[kind];
    const quantity = config.input === 'days' ? Number(body.quantity) : null;
    const amount = config.input === 'currency' ? Number(body.amount) : null;

    if (config.input === 'days' && (!Number.isFinite(quantity) || !quantity || quantity <= 0)) {
        throw new Error('Informe uma quantidade de dias maior que zero');
    }
    if (config.input === 'currency' && (!Number.isFinite(amount) || !amount || amount <= 0)) {
        throw new Error('Informe um valor maior que zero');
    }

    const direction = kind === 'other' ? parseDirection(body.direction) : config.defaultDirection;
    const customLabel = typeof body.label === 'string' ? body.label.trim().slice(0, 80) : '';

    return {
        payrollEntryId,
        kind,
        direction,
        label: customLabel || config.label,
        quantity,
        amount,
    };
}

export async function POST(request: NextRequest) {
    const authError = authorize(request);
    if (authError) return authError;

    try {
        const body = await request.json();
        if (!body.payrollEntryId) {
            return NextResponse.json({ error: 'Colaborador é obrigatório' }, { status: 400 });
        }

        const data = await buildAdjustmentData(body, String(body.payrollEntryId));
        const adjustment = await prisma.payrollAdjustment.create({ data });
        return NextResponse.json(adjustment, { status: 201 });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao criar ajuste';
        return NextResponse.json({ error: message }, { status: 400 });
    }
}

export async function PUT(request: NextRequest) {
    const authError = authorize(request);
    if (authError) return authError;

    try {
        const body = await request.json();
        if (!body.id || !body.payrollEntryId) {
            return NextResponse.json({ error: 'Ajuste e colaborador são obrigatórios' }, { status: 400 });
        }

        const data = await buildAdjustmentData(body, String(body.payrollEntryId));
        const adjustment = await prisma.payrollAdjustment.update({
            where: { id: String(body.id) },
            data: {
                kind: data.kind,
                direction: data.direction,
                label: data.label,
                quantity: data.quantity,
                amount: data.amount,
            },
        });
        return NextResponse.json(adjustment);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao atualizar ajuste';
        return NextResponse.json({ error: message }, { status: 400 });
    }
}

export async function DELETE(request: NextRequest) {
    const authError = authorize(request);
    if (authError) return authError;

    try {
        const id = new URL(request.url).searchParams.get('id');
        if (!id) return NextResponse.json({ error: 'Ajuste é obrigatório' }, { status: 400 });

        await prisma.payrollAdjustment.delete({ where: { id } });
        return NextResponse.json({ success: true });
    } catch {
        return NextResponse.json({ error: 'Erro ao remover ajuste' }, { status: 500 });
    }
}
