import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { PAYROLL_ADJUSTMENT_KINDS, normalizeEmploymentType } from '@/lib/payroll-adjustments';
import {
    PayrollWriteConflictError,
    matchesExpectedUpdatedAt,
    nextPayrollUpdatedAt,
    parseOptionalExpectedUpdatedAt,
    payrollWriteConflictPayload,
    touchPayrollImportRevisions,
} from '@/lib/payroll-sync';
import type { PayrollAdjustmentDirection, PayrollAdjustmentKind } from '@/lib/types';
import {
    requireUnitGuard,
    UnitAccessDeniedError,
    unitAccessDeniedResponse,
} from '@/lib/unit-guard';

class PayrollAdjustmentValidationError extends Error {}
class PayrollAdjustmentNotFoundError extends Error {}
class PayrollVersionRequiredError extends Error {}

function authorize(request: NextRequest) {
    const guard = requireUnitGuard(request);
    if (guard instanceof NextResponse) return guard;
    if (!guard.isAdmin && !guard.permissions?.financeiro) {
        return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }
    return guard;
}

function writeConflictResponse() {
    return NextResponse.json(payrollWriteConflictPayload(), { status: 409 });
}

function versionRequiredResponse() {
    return NextResponse.json({
        error: 'A versão atual da folha é obrigatória. Recarregue os dados antes de salvar.',
        code: 'PAYROLL_VERSION_REQUIRED',
        reloadRequired: true,
    }, { status: 428 });
}

function requireExpectedUpdatedAt(value: Date | undefined | null, invalidMessage: string) {
    if (value === undefined) throw new PayrollVersionRequiredError();
    if (value === null) throw new PayrollAdjustmentValidationError(invalidMessage);
    return value;
}

function parseKind(value: unknown): PayrollAdjustmentKind | null {
    if (typeof value !== 'string' || !(value in PAYROLL_ADJUSTMENT_KINDS)) return null;
    return value as PayrollAdjustmentKind;
}

function parseDirection(value: unknown): PayrollAdjustmentDirection {
    return value === 'credit' ? 'credit' : 'debit';
}

function buildAdjustmentData(body: Record<string, unknown>, employmentTypeValue: string | null) {
    const kind = parseKind(body.kind);
    if (!kind) throw new PayrollAdjustmentValidationError('Tipo de ajuste inválido');

    const employmentType = normalizeEmploymentType(employmentTypeValue);
    if (kind === 'absence' && employmentType !== 'CLT') {
        throw new PayrollAdjustmentValidationError('Faltas automáticas são permitidas somente para colaboradores CLT');
    }

    const config = PAYROLL_ADJUSTMENT_KINDS[kind];
    const quantity = config.input === 'days' ? Number(body.quantity) : null;
    const amount = config.input === 'currency' ? Number(body.amount) : null;

    if (config.input === 'days' && (!Number.isFinite(quantity) || !quantity || quantity <= 0)) {
        throw new PayrollAdjustmentValidationError('Informe uma quantidade de dias maior que zero');
    }
    if (config.input === 'currency' && (!Number.isFinite(amount) || !amount || amount <= 0)) {
        throw new PayrollAdjustmentValidationError('Informe um valor maior que zero');
    }

    const direction = kind === 'other' ? parseDirection(body.direction) : config.defaultDirection;
    const customLabel = typeof body.label === 'string' ? body.label.trim().slice(0, 80) : '';

    return {
        kind,
        direction,
        label: customLabel || config.label,
        quantity,
        amount,
    };
}

function adjustmentErrorResponse(error: unknown, operation: string) {
    if (error instanceof PayrollVersionRequiredError) return versionRequiredResponse();
    if (error instanceof PayrollWriteConflictError) return writeConflictResponse();
    if (error instanceof UnitAccessDeniedError) return unitAccessDeniedResponse(error);
    if (error instanceof PayrollAdjustmentNotFoundError) {
        return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof PayrollAdjustmentValidationError) {
        return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error(`${operation} payroll adjustment error:`, error);
    return NextResponse.json({ error: 'Erro ao salvar ajuste' }, { status: 500 });
}

export async function POST(request: NextRequest) {
    const guard = authorize(request);
    if (guard instanceof NextResponse) return guard;

    try {
        const body = await request.json() as Record<string, unknown>;
        if (!body.payrollEntryId) {
            return NextResponse.json({ error: 'Colaborador é obrigatório' }, { status: 400 });
        }
        const expectedEntryUpdatedAt = parseOptionalExpectedUpdatedAt(body.expectedEntryUpdatedAt);

        const adjustment = await prisma.$transaction(async transaction => {
            const payrollEntryId = String(body.payrollEntryId);
            await transaction.$queryRaw`
                SELECT "id" FROM "PayrollEntry" WHERE "id" = ${payrollEntryId} FOR UPDATE
            `;
            const entry = await transaction.payrollEntry.findUnique({
                where: { id: payrollEntryId },
                select: {
                    id: true,
                    updatedAt: true,
                    employmentType: true,
                    payrollImportId: true,
                    payrollImport: { select: { unit: true } },
                },
            });
            if (!entry) throw new PayrollAdjustmentNotFoundError('Colaborador não encontrado');

            guard.enforceUnit(entry.payrollImport.unit);
            const requiredExpectedUpdatedAt = requireExpectedUpdatedAt(
                expectedEntryUpdatedAt,
                'Versão da folha inválida',
            );
            if (!matchesExpectedUpdatedAt(entry.updatedAt, requiredExpectedUpdatedAt)) {
                throw new PayrollWriteConflictError();
            }

            const data = buildAdjustmentData(body, entry.employmentType);
            const created = await transaction.payrollAdjustment.create({
                data: { payrollEntryId, ...data },
            });
            await transaction.payrollEntry.update({
                where: { id: entry.id },
                data: { updatedAt: nextPayrollUpdatedAt(entry.updatedAt) },
            });
            await touchPayrollImportRevisions(transaction, [entry.payrollImportId]);
            return created;
        });

        return NextResponse.json(adjustment, { status: 201 });
    } catch (error) {
        return adjustmentErrorResponse(error, 'POST');
    }
}

export async function PUT(request: NextRequest) {
    const guard = authorize(request);
    if (guard instanceof NextResponse) return guard;

    try {
        const body = await request.json() as Record<string, unknown>;
        if (!body.id || !body.payrollEntryId) {
            return NextResponse.json({ error: 'Ajuste e colaborador são obrigatórios' }, { status: 400 });
        }
        const expectedUpdatedAt = parseOptionalExpectedUpdatedAt(body.expectedUpdatedAt);

        const adjustment = await prisma.$transaction(async transaction => {
            const adjustmentId = String(body.id);
            const payrollEntryId = String(body.payrollEntryId);
            // Todas as gravações seguem PayrollEntry → PayrollAdjustment para
            // evitar deadlock com a edição de salário/vale-transporte.
            await transaction.$queryRaw`
                SELECT "id" FROM "PayrollEntry" WHERE "id" = ${payrollEntryId} FOR UPDATE
            `;
            const current = await transaction.payrollAdjustment.findUnique({
                where: { id: adjustmentId },
                include: {
                    payrollEntry: {
                        select: {
                            employmentType: true,
                            updatedAt: true,
                            payrollImportId: true,
                            payrollImport: { select: { unit: true } },
                        },
                    },
                },
            });
            if (!current || current.payrollEntryId !== payrollEntryId) {
                throw new PayrollAdjustmentNotFoundError('Ajuste não encontrado para este colaborador');
            }

            guard.enforceUnit(current.payrollEntry.payrollImport.unit);
            const requiredExpectedUpdatedAt = requireExpectedUpdatedAt(
                expectedUpdatedAt,
                'Versão do ajuste inválida',
            );
            if (!matchesExpectedUpdatedAt(current.updatedAt, requiredExpectedUpdatedAt)) {
                throw new PayrollWriteConflictError();
            }

            const data = buildAdjustmentData(body, current.payrollEntry.employmentType);
            const updated = await transaction.payrollAdjustment.updateMany({
                where: {
                    id: adjustmentId,
                    payrollEntryId,
                    updatedAt: requiredExpectedUpdatedAt,
                },
                data: { ...data, updatedAt: nextPayrollUpdatedAt(current.updatedAt) },
            });
            if (updated.count !== 1) throw new PayrollWriteConflictError();

            const entryUpdated = await transaction.payrollEntry.updateMany({
                where: {
                    id: current.payrollEntryId,
                    updatedAt: current.payrollEntry.updatedAt,
                    payrollImport: { unit: current.payrollEntry.payrollImport.unit },
                },
                data: { updatedAt: nextPayrollUpdatedAt(current.payrollEntry.updatedAt) },
            });
            if (entryUpdated.count !== 1) throw new PayrollWriteConflictError();

            await touchPayrollImportRevisions(transaction, [current.payrollEntry.payrollImportId]);
            return transaction.payrollAdjustment.findUnique({ where: { id: adjustmentId } });
        });

        return NextResponse.json(adjustment);
    } catch (error) {
        return adjustmentErrorResponse(error, 'PUT');
    }
}

export async function DELETE(request: NextRequest) {
    const guard = authorize(request);
    if (guard instanceof NextResponse) return guard;

    try {
        const searchParams = request.nextUrl.searchParams;
        const id = searchParams.get('id');
        if (!id) return NextResponse.json({ error: 'Ajuste é obrigatório' }, { status: 400 });

        const rawExpectedUpdatedAt = searchParams.get('expectedUpdatedAt');
        const expectedUpdatedAt = parseOptionalExpectedUpdatedAt(
            rawExpectedUpdatedAt === null ? undefined : rawExpectedUpdatedAt,
        );

        await prisma.$transaction(async transaction => {
            const adjustmentLink = await transaction.payrollAdjustment.findUnique({
                where: { id },
                select: { payrollEntryId: true },
            });
            if (!adjustmentLink) throw new PayrollAdjustmentNotFoundError('Ajuste não encontrado');

            await transaction.$queryRaw`
                SELECT "id" FROM "PayrollEntry" WHERE "id" = ${adjustmentLink.payrollEntryId} FOR UPDATE
            `;
            const current = await transaction.payrollAdjustment.findUnique({
                where: { id },
                include: {
                    payrollEntry: {
                        select: {
                            updatedAt: true,
                            payrollImportId: true,
                            payrollImport: { select: { unit: true } },
                        },
                    },
                },
            });
            if (!current) throw new PayrollAdjustmentNotFoundError('Ajuste não encontrado');

            guard.enforceUnit(current.payrollEntry.payrollImport.unit);
            const requiredExpectedUpdatedAt = requireExpectedUpdatedAt(
                expectedUpdatedAt,
                'Versão do ajuste inválida',
            );
            if (!matchesExpectedUpdatedAt(current.updatedAt, requiredExpectedUpdatedAt)) {
                throw new PayrollWriteConflictError();
            }

            const deleted = await transaction.payrollAdjustment.deleteMany({
                where: {
                    id,
                    payrollEntryId: current.payrollEntryId,
                    updatedAt: requiredExpectedUpdatedAt,
                },
            });
            if (deleted.count !== 1) throw new PayrollWriteConflictError();
            const entryUpdated = await transaction.payrollEntry.updateMany({
                where: {
                    id: current.payrollEntryId,
                    updatedAt: current.payrollEntry.updatedAt,
                    payrollImport: { unit: current.payrollEntry.payrollImport.unit },
                },
                data: { updatedAt: nextPayrollUpdatedAt(current.payrollEntry.updatedAt) },
            });
            if (entryUpdated.count !== 1) throw new PayrollWriteConflictError();
            await touchPayrollImportRevisions(transaction, [current.payrollEntry.payrollImportId]);
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        return adjustmentErrorResponse(error, 'DELETE');
    }
}
