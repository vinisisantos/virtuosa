import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { canManageAutomaticCosts } from '@/lib/automatic-costs';
import { prisma } from '@/lib/db';
import {
    isPayrollPaymentStatus,
    resolvePayrollPaymentMutation,
} from '@/lib/payroll-payment';
import {
    requireUnitGuard,
    UnitAccessDeniedError,
    unitAccessDeniedResponse,
} from '@/lib/unit-guard';

function invalidJsonResponse() {
    return NextResponse.json({ error: 'Corpo da requisição inválido' }, { status: 400 });
}

function payrollPaymentAuditDescription(paymentStatus: string) {
    if (paymentStatus === 'paid') return 'Pagamento da folha confirmado';
    if (paymentStatus === 'review') return 'Pagamento da folha marcado para revisão';
    return 'Confirmação de pagamento da folha desfeita';
}

// PATCH — toggle payment status
export async function PATCH(request: NextRequest) {
    const baseGuard = requireUnitGuard(request);
    if (baseGuard instanceof NextResponse) return baseGuard;
    if (!canManageAutomaticCosts(baseGuard)) {
        return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return invalidJsonResponse();
    }

    if (!body || typeof body !== 'object') return invalidJsonResponse();
    const { id, paymentStatus, unit } = body as Record<string, unknown>;

    if (typeof id !== 'string' || id.trim() === '' || !paymentStatus) {
        return NextResponse.json({ error: 'ID e status são obrigatórios' }, { status: 400 });
    }
    if (!isPayrollPaymentStatus(paymentStatus)) {
        return NextResponse.json({ error: 'Status inválido' }, { status: 400 });
    }
    if (unit !== undefined && (typeof unit !== 'string' || unit.trim() === '')) {
        return NextResponse.json({ error: 'Unidade inválida' }, { status: 400 });
    }

    const requestedUnit = typeof unit === 'string' ? unit.trim() : null;
    const guard = requireUnitGuard(request, { requestedUnit });
    if (guard instanceof NextResponse) return guard;

    try {
        const result = await prisma.$transaction(async tx => {
            const entryId = id.trim();
            if (requestedUnit) guard.enforceUnit(requestedUnit);

            const currentEntry = await tx.payrollEntry.findFirst({
                where: {
                    id: entryId,
                    ...(requestedUnit ? { payrollImport: { unit: requestedUnit } } : {}),
                },
                include: {
                    payrollImport: {
                        select: {
                            unit: true,
                            competenceMonth: true,
                            competenceYear: true,
                        },
                    },
                },
            });
            if (!currentEntry) return null;

            guard.enforceUnit(currentEntry.payrollImport.unit);

            const mutation = resolvePayrollPaymentMutation({
                currentStatus: currentEntry.paymentStatus,
                currentPaymentDate: currentEntry.paymentDate,
                requestedStatus: paymentStatus,
                now: new Date(),
            });
            const { payrollImport, ...unchangedEntry } = currentEntry;
            if (!mutation.changed) return { entry: unchangedEntry, changed: false };

            const updated = await tx.payrollEntry.updateMany({
                where: {
                    id: entryId,
                    payrollImport: { unit: payrollImport.unit },
                },
                data: mutation.data,
            });
            if (updated.count !== 1) {
                throw new Error('A folha mudou durante a confirmação do pagamento');
            }

            await tx.activityLog.create({
                data: {
                    userId: guard.userId,
                    userName: guard.userName || 'Usuário',
                    action: 'update',
                    entityType: 'payroll',
                    entityId: entryId,
                    description: payrollPaymentAuditDescription(paymentStatus),
                    metadata: JSON.stringify({
                        previousStatus: currentEntry.paymentStatus,
                        paymentStatus,
                        competenceMonth: payrollImport.competenceMonth,
                        competenceYear: payrollImport.competenceYear,
                    }),
                    unit: payrollImport.unit,
                },
            });

            return {
                entry: { ...unchangedEntry, ...mutation.data },
                changed: true,
            };
        });

        if (!result) {
            return NextResponse.json({ error: 'Lançamento da folha não encontrado' }, { status: 404 });
        }
        return NextResponse.json({ ...result.entry, changed: result.changed });
    } catch (err) {
        if (err instanceof UnitAccessDeniedError) return unitAccessDeniedResponse(err);
        console.error('PATCH payment error:', err);
        return NextResponse.json({ error: 'Erro ao atualizar pagamento' }, { status: 500 });
    }
}

// POST — batch mark all as paid for a given competence + unit OR for specific IDs
export async function POST(request: NextRequest) {
    const baseGuard = requireUnitGuard(request);
    if (baseGuard instanceof NextResponse) return baseGuard;
    if (!canManageAutomaticCosts(baseGuard)) {
        return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return invalidJsonResponse();
    }
    if (!body || typeof body !== 'object') return invalidJsonResponse();

    const { competenceMonth, competenceYear, unit, ids } = body as Record<string, unknown>;
    if (ids !== undefined && !Array.isArray(ids)) {
        return NextResponse.json({ error: 'IDs inválidos' }, { status: 400 });
    }
    if (Array.isArray(ids) && ids.some(id => typeof id !== 'string')) {
        return NextResponse.json({ error: 'IDs inválidos' }, { status: 400 });
    }

    const normalizedIds = Array.isArray(ids)
        ? [...new Set(ids.map(id => (id as string).trim()).filter(Boolean))]
        : [];
    const hasCompetence = Number.isInteger(competenceMonth)
        && Number.isInteger(competenceYear)
        && Number(competenceMonth) >= 1
        && Number(competenceMonth) <= 12
        && Number(competenceYear) >= 2000
        && Number(competenceYear) <= 9999;

    if (normalizedIds.length === 0 && !hasCompetence) {
        return NextResponse.json({ error: 'IDs ou Competência são obrigatórios' }, { status: 400 });
    }
    if (unit !== undefined && (typeof unit !== 'string' || unit.trim() === '')) {
        return NextResponse.json({ error: 'Unidade inválida' }, { status: 400 });
    }

    const requestedUnit = typeof unit === 'string' ? unit.trim() : null;
    const guard = requireUnitGuard(request, { requestedUnit });
    if (guard instanceof NextResponse) return guard;

    try {
        const result = await prisma.$transaction(async tx => {
            if (requestedUnit) guard.enforceUnit(requestedUnit);

            const importWhere: Prisma.PayrollImportWhereInput = {};
            if (normalizedIds.length === 0) {
                importWhere.competenceMonth = competenceMonth as number;
                importWhere.competenceYear = competenceYear as number;
                if (requestedUnit) importWhere.unit = requestedUnit;
                else if (guard.unitFilter) importWhere.unit = guard.unitFilter;
            }

            const selectionWhere: Prisma.PayrollEntryWhereInput = normalizedIds.length > 0
                ? {
                    id: { in: normalizedIds },
                    ...(requestedUnit ? { payrollImport: { unit: requestedUnit } } : {}),
                }
                : { payrollImport: importWhere };
            const entries = await tx.payrollEntry.findMany({
                where: selectionWhere,
                select: {
                    id: true,
                    paymentStatus: true,
                    paymentDate: true,
                    payrollImport: {
                        select: {
                            id: true,
                            unit: true,
                            competenceMonth: true,
                            competenceYear: true,
                        },
                    },
                },
            });

            for (const entry of entries) guard.enforceUnit(entry.payrollImport.unit);

            const targets = entries.filter(entry => (
                entry.paymentStatus !== 'paid' || entry.paymentDate === null
            ));
            if (targets.length === 0) return { count: 0 };

            const targetIds = targets.map(entry => entry.id);
            const targetUnits = [...new Set(targets.map(entry => entry.payrollImport.unit))];
            const updated = await tx.payrollEntry.updateMany({
                where: {
                    id: { in: targetIds },
                    payrollImport: { unit: { in: targetUnits } },
                    OR: [
                        { paymentStatus: { not: 'paid' } },
                        { paymentDate: null },
                    ],
                },
                data: { paymentStatus: 'paid', paymentDate: new Date() },
            });

            if (updated.count > 0) {
                const importIds = [...new Set(targets.map(entry => entry.payrollImport.id))];
                const competences = [...new Set(targets.map(entry => (
                    `${entry.payrollImport.competenceMonth}/${entry.payrollImport.competenceYear}`
                )))];
                await tx.activityLog.create({
                    data: {
                        userId: guard.userId,
                        userName: guard.userName || 'Usuário',
                        action: 'update',
                        entityType: 'payroll',
                        entityId: importIds.length === 1 ? importIds[0] : null,
                        description: `Pagamento confirmado para ${updated.count} lançamento(s) da folha`,
                        metadata: JSON.stringify({
                            updatedCount: updated.count,
                            competences,
                            batchMode: normalizedIds.length > 0 ? 'ids' : 'competence',
                        }),
                        unit: targetUnits.length === 1 ? targetUnits[0] : null,
                    },
                });
            }

            return { count: updated.count };
        });

        return NextResponse.json({ success: true, updatedCount: result.count });
    } catch (err: unknown) {
        if (err instanceof UnitAccessDeniedError) return unitAccessDeniedResponse(err);
        console.error('POST batch payment error:', err);
        return NextResponse.json({ error: 'Erro ao confirmar pagamentos da folha' }, { status: 500 });
    }
}
