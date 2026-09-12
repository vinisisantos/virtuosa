import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { canManageAutomaticCosts } from '@/lib/automatic-costs';
import { prisma } from '@/lib/db';
import { canManagePayroll } from '@/lib/payroll-entry-flag-mutation';
import {
    isPayrollPaymentStatus,
    resolvePayrollPaymentMutation,
} from '@/lib/payroll-payment';
import {
    PayrollWriteConflictError,
    matchesExpectedUpdatedAt,
    nextPayrollUpdatedAt,
    parseOptionalExpectedUpdatedAt,
    payrollWriteConflictPayload,
    touchPayrollImportRevisions,
} from '@/lib/payroll-sync';
import { ACTIVE_UNITS } from '@/lib/role-access';
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

function writeConflictResponse() {
    return NextResponse.json(payrollWriteConflictPayload(), { status: 409 });
}

class PayrollVersionRequiredError extends Error {}

function versionRequiredResponse() {
    return NextResponse.json({
        error: 'A versão atual da folha é obrigatória. Recarregue os dados antes de confirmar o pagamento.',
        code: 'PAYROLL_VERSION_REQUIRED',
        reloadRequired: true,
    }, { status: 428 });
}

function parseExpectedVersions(value: unknown) {
    if (value === undefined) return { valid: true as const, values: new Map<string, Date>() };
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return { valid: false as const, values: new Map<string, Date>() };
    }

    const values = new Map<string, Date>();
    for (const [id, rawVersion] of Object.entries(value)) {
        const version = parseOptionalExpectedUpdatedAt(rawVersion);
        if (!id.trim() || !version) {
            return { valid: false as const, values: new Map<string, Date>() };
        }
        values.set(id.trim(), version);
    }
    return { valid: true as const, values };
}

function parseRequestedUnit(value: unknown) {
    if (value === undefined || value === null || value === 'all' || value === 'Todas') {
        return { valid: true as const, unit: null };
    }
    if (typeof value !== 'string' || value.trim() === '') {
        return { valid: false as const, unit: null };
    }

    const unit = value.trim();
    return ACTIVE_UNITS.includes(unit as (typeof ACTIVE_UNITS)[number])
        ? { valid: true as const, unit }
        : { valid: false as const, unit: null };
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
    const { id, paymentStatus, unit, expectedUpdatedAt: rawExpectedUpdatedAt } = body as Record<string, unknown>;

    if (typeof id !== 'string' || id.trim() === '' || !paymentStatus) {
        return NextResponse.json({ error: 'ID e status são obrigatórios' }, { status: 400 });
    }
    if (!isPayrollPaymentStatus(paymentStatus)) {
        return NextResponse.json({ error: 'Status inválido' }, { status: 400 });
    }
    const parsedUnit = parseRequestedUnit(unit);
    if (!parsedUnit.valid) {
        return NextResponse.json({ error: 'Unidade inválida' }, { status: 400 });
    }
    const expectedUpdatedAt = parseOptionalExpectedUpdatedAt(rawExpectedUpdatedAt);
    if (expectedUpdatedAt === null) {
        return NextResponse.json({ error: 'Versão da folha inválida' }, { status: 400 });
    }

    const requestedUnit = parsedUnit.unit;
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
            if (expectedUpdatedAt === undefined) throw new PayrollVersionRequiredError();
            if (!matchesExpectedUpdatedAt(currentEntry.updatedAt, expectedUpdatedAt)) {
                throw new PayrollWriteConflictError();
            }

            const mutationTime = nextPayrollUpdatedAt(currentEntry.updatedAt);
            const mutation = resolvePayrollPaymentMutation({
                currentStatus: currentEntry.paymentStatus,
                currentPaymentDate: currentEntry.paymentDate,
                requestedStatus: paymentStatus,
                now: mutationTime,
            });
            const { payrollImport, ...unchangedEntry } = currentEntry;
            if (!mutation.changed) return { entry: unchangedEntry, changed: false };

            const updated = await tx.payrollEntry.updateMany({
                where: {
                    id: entryId,
                    payrollImport: { unit: payrollImport.unit },
                    ...(expectedUpdatedAt ? { updatedAt: expectedUpdatedAt } : {}),
                },
                data: { ...mutation.data, updatedAt: mutationTime },
            });
            if (updated.count !== 1) {
                throw new PayrollWriteConflictError();
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
            await touchPayrollImportRevisions(tx, [currentEntry.payrollImportId]);

            return {
                entry: { ...unchangedEntry, ...mutation.data, updatedAt: mutationTime },
                changed: true,
            };
        });

        if (!result) {
            return NextResponse.json({ error: 'Lançamento da folha não encontrado' }, { status: 404 });
        }
        return NextResponse.json({ ...result.entry, changed: result.changed });
    } catch (err) {
        if (err instanceof PayrollVersionRequiredError) return versionRequiredResponse();
        if (err instanceof PayrollWriteConflictError) return writeConflictResponse();
        if (err instanceof UnitAccessDeniedError) return unitAccessDeniedResponse(err);
        console.error('PATCH payment error:', err);
        return NextResponse.json({ error: 'Erro ao atualizar pagamento' }, { status: 500 });
    }
}

// POST — batch mark all as paid for a given competence + unit OR for specific IDs
export async function POST(request: NextRequest) {
    const baseGuard = requireUnitGuard(request);
    if (baseGuard instanceof NextResponse) return baseGuard;
    if (!canManagePayroll(baseGuard)) {
        return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return invalidJsonResponse();
    }
    if (!body || typeof body !== 'object') return invalidJsonResponse();

    const { competenceMonth, competenceYear, unit, ids, expectedUpdatedAtById } = body as Record<string, unknown>;
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
    const parsedUnit = parseRequestedUnit(unit);
    if (!parsedUnit.valid) {
        return NextResponse.json({ error: 'Unidade inválida' }, { status: 400 });
    }
    const expectedVersions = parseExpectedVersions(expectedUpdatedAtById);
    if (!expectedVersions.valid) {
        return NextResponse.json({ error: 'Versões da folha inválidas' }, { status: 400 });
    }

    const requestedUnit = parsedUnit.unit;
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
                ? { id: { in: normalizedIds } }
                : { payrollImport: importWhere };
            const candidates = await tx.payrollEntry.findMany({
                where: selectionWhere,
                select: { id: true },
            });
            if (normalizedIds.length > 0 && candidates.length !== normalizedIds.length) {
                return { count: 0, missingEntries: true };
            }
            if (candidates.length === 0) return { count: 0 };

            const candidateIds = candidates.map(entry => entry.id).sort();
            await tx.$queryRaw(
                Prisma.sql`
                    SELECT "id"
                    FROM "PayrollEntry"
                    WHERE "id" IN (${Prisma.join(candidateIds)})
                    ORDER BY "id"
                    FOR UPDATE
                `,
            );

            const entries = await tx.payrollEntry.findMany({
                where: { id: { in: candidateIds } },
                select: {
                    id: true,
                    paymentStatus: true,
                    paymentDate: true,
                    updatedAt: true,
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
            if (entries.length !== candidateIds.length) {
                return { count: 0, missingEntries: true };
            }

            for (const entry of entries) {
                guard.enforceUnit(entry.payrollImport.unit);
                if (requestedUnit && entry.payrollImport.unit !== requestedUnit) {
                    throw new UnitAccessDeniedError(guard.userUnit, entry.payrollImport.unit, guard.userId);
                }
            }

            const targets = entries.filter(entry => (
                entry.paymentStatus !== 'paid' || entry.paymentDate === null
            ));
            if (targets.length === 0) return { count: 0 };

            for (const entry of targets) {
                const expectedUpdatedAt = expectedVersions.values.get(entry.id);
                if (!expectedUpdatedAt) throw new PayrollVersionRequiredError();
                if (!matchesExpectedUpdatedAt(entry.updatedAt, expectedUpdatedAt)) {
                    throw new PayrollWriteConflictError();
                }
            }

            const targetIds = targets.map(entry => entry.id);
            const targetUnits = [...new Set(targets.map(entry => entry.payrollImport.unit))];
            const mutationTime = new Date(Math.max(
                Date.now(),
                ...targets.map(entry => new Date(entry.updatedAt).getTime() + 1),
            ));
            const updated = await tx.payrollEntry.updateMany({
                where: {
                    id: { in: targetIds },
                    payrollImport: { unit: { in: targetUnits } },
                    OR: [
                        { paymentStatus: { not: 'paid' } },
                        { paymentDate: null },
                    ],
                },
                data: { paymentStatus: 'paid', paymentDate: mutationTime, updatedAt: mutationTime },
            });
            if (updated.count !== targets.length) throw new PayrollWriteConflictError();

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
                await touchPayrollImportRevisions(tx, importIds);
            }

            return { count: updated.count, missingEntries: false };
        });

        if ('missingEntries' in result && result.missingEntries) {
            return NextResponse.json({ error: 'Um ou mais lançamentos da folha não foram encontrados' }, { status: 404 });
        }
        return NextResponse.json({ success: true, updatedCount: result.count });
    } catch (err: unknown) {
        if (err instanceof PayrollVersionRequiredError) return versionRequiredResponse();
        if (err instanceof PayrollWriteConflictError) return writeConflictResponse();
        if (err instanceof UnitAccessDeniedError) return unitAccessDeniedResponse(err);
        console.error('POST batch payment error:', err);
        return NextResponse.json({ error: 'Erro ao confirmar pagamentos da folha' }, { status: 500 });
    }
}
