import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { materializeRecurringPayrollEntries } from '@/lib/payroll-recurrence-materialization';
import { normalizePayrollEmployeeKey } from '@/lib/payroll-recurrence';
import {
    PayrollWriteConflictError,
    buildPayrollRevision,
    matchesExpectedUpdatedAt,
    nextPayrollUpdatedAt,
    parseOptionalExpectedUpdatedAt,
    payrollWriteConflictPayload,
    touchPayrollImportRevisions,
} from '@/lib/payroll-sync';
import {
    requireUnitGuard,
    UnitAccessDeniedError,
    unitAccessDeniedResponse,
} from '@/lib/unit-guard';
import { ACTIVE_UNITS } from '@/lib/role-access';
import {
    AUTOMATIC_TRANSPORT_LABEL,
    CURRENT_MINIMUM_WAGE,
    calculateAutomaticTransportDiscount,
    calculatePayrollLegalFigures,
    calculatePayrollTotal,
    normalizeEmploymentType,
    normalizeHazardPayRate,
    summarizePayrollAdjustments,
} from '@/lib/payroll-adjustments';

function writeConflictResponse() {
    return NextResponse.json(payrollWriteConflictPayload(), { status: 409 });
}

class PayrollVersionRequiredError extends Error {}
class PayrollVersionInvalidError extends Error {}

function versionRequiredResponse() {
    return NextResponse.json({
        error: 'A versão atual da folha é obrigatória. Recarregue os dados antes de salvar.',
        code: 'PAYROLL_VERSION_REQUIRED',
        reloadRequired: true,
    }, { status: 428 });
}

function requireExpectedUpdatedAt(value: Date | undefined | null) {
    if (value === undefined) throw new PayrollVersionRequiredError();
    if (value === null) throw new PayrollVersionInvalidError();
    return value;
}

// GET — materialize recurring entries, then read the competence snapshot
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
    if (!guard.isAdmin && !guard.permissions?.financeiro)
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    try {
        const month = Number(searchParams.get('month'));
        const year = Number(searchParams.get('year'));
        const unit = guard.unitFilter || '';

        if (
            !Number.isInteger(month)
            || month < 1
            || month > 12
            || !Number.isInteger(year)
            || year < 2000
            || year > 9999
        ) {
            return NextResponse.json({ error: 'Mês e ano válidos são obrigatórios' }, { status: 400 });
        }

        const whereClause = {
            competenceMonth: month,
            competenceYear: year,
            ...(unit ? { unit } : {}),
        };

        // A escrita recorrente fica isolada da leitura abaixo. Assim, o endpoint
        // leve de revisão nunca precisa chamar este GET mutante.
        try {
            await materializeRecurringPayrollEntries({ month, year, ...(unit ? { unit } : {}) });
        } catch (recurErr) {
            console.error('Recurring auto-create warning:', recurErr);
            // Non-fatal — continue with normal fetch
        }

        // --- Fetch all entries for this month ---
        const imports = await prisma.payrollImport.findMany({
            where: whereClause,
            select: {
                id: true,
                fileName: true,
                competenceMonth: true,
                competenceYear: true,
                unit: true,
                uploadDate: true,
                updatedAt: true,
                processingStatus: true,
                entries: {
                    orderBy: { employeeName: 'asc' },
                    include: {
                        adjustments: { orderBy: { createdAt: 'asc' } },
                    },
                },
            },
            orderBy: { uploadDate: 'desc' },
        });

        // Flatten entries from all imports of this competence
        const allEntries = imports.flatMap(imp => imp.entries);

        const adjustmentSummary = summarizePayrollAdjustments(allEntries);
        const legalSummary = allEntries.reduce((totals, entry) => {
            const figures = calculatePayrollLegalFigures(entry);
            totals.totalBaseSalary += figures.baseSalary;
            totals.totalHazardPay += figures.hazardPay;
            totals.totalGrossSalary += figures.grossSalary;
            totals.totalInss += figures.inss;
            totals.totalFgts += figures.fgts;
            return totals;
        }, {
            totalBaseSalary: 0,
            totalHazardPay: 0,
            totalGrossSalary: 0,
            totalInss: 0,
            totalFgts: 0,
        });

        const summary = {
            totalPayroll: allEntries.reduce((sum, e) => sum + calculatePayrollTotal(e), 0),
            totalPaid: allEntries.filter(e => e.paymentStatus === 'paid').reduce((sum, e) => sum + calculatePayrollTotal(e), 0),
            totalPending: allEntries.filter(e => e.paymentStatus !== 'paid').reduce((sum, e) => sum + calculatePayrollTotal(e), 0),
            totalEmployees: allEntries.length,
            paidCount: allEntries.filter(e => e.paymentStatus === 'paid').length,
            pendingCount: allEntries.filter(e => e.paymentStatus === 'unpaid').length,
            reviewCount: allEntries.filter(e => e.paymentStatus === 'review').length,
            totalBonus: allEntries.reduce((sum, e) => sum + (e.bonus || 0), 0),
            ...legalSummary,
            ...adjustmentSummary,
            cltCount: allEntries.filter(e => e.employmentType === 'CLT').length,
            pjCount: allEntries.filter(e => e.employmentType === 'PJ').length,
            undefinedRegimeCount: allEntries.filter(e => !e.employmentType).length,
        };

        return NextResponse.json({
            imports,
            entries: allEntries,
            summary,
            ...buildPayrollRevision(imports),
        }, {
            headers: { 'Cache-Control': 'private, no-store, max-age=0' },
        });
    } catch (err) {
        console.error('GET entries error:', err);
        return NextResponse.json({ error: 'Erro ao buscar dados' }, { status: 500 });
    }
}

// POST — add manual entry
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { employeeName, netSalary, baseSalary, cargo, bonus, competenceMonth, competenceYear, notes, hasAdiantamento, isRecurring, hasFgts, employmentType, hazardPayRate, hazardPayBase, transportDiscountEnabled } = body;
        const requestedUnit = typeof body.unit === 'string' ? body.unit.trim() : '';

        if (!ACTIVE_UNITS.includes(requestedUnit as (typeof ACTIVE_UNITS)[number])) {
            return NextResponse.json({ error: 'Unidade inválida' }, { status: 400 });
        }
        const guard = requireUnitGuard(request, { requestedUnit });
        if (guard instanceof NextResponse) return guard;
        if (!guard.isAdmin && !guard.permissions?.financeiro) {
            return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
        }
        guard.enforceUnit(requestedUnit);
        const unit = guard.createUnit(requestedUnit);
        const normalizedCompetenceMonth = Number(competenceMonth);
        const normalizedCompetenceYear = Number(competenceYear);
        const normalizedNetSalary = Number(netSalary);

        if (!employeeName || netSalary == null || !unit) {
            return NextResponse.json({ error: 'Nome, salário e unidade são obrigatórios' }, { status: 400 });
        }
        if (
            !Number.isInteger(normalizedCompetenceMonth)
            || normalizedCompetenceMonth < 1
            || normalizedCompetenceMonth > 12
            || !Number.isInteger(normalizedCompetenceYear)
            || normalizedCompetenceYear < 2000
            || normalizedCompetenceYear > 9999
        ) {
            return NextResponse.json({ error: 'Competência inválida' }, { status: 400 });
        }
        if (!Number.isFinite(normalizedNetSalary) || normalizedNetSalary < 0) {
            return NextResponse.json({ error: 'Salário inválido' }, { status: 400 });
        }

        const normalizedEmploymentType = normalizeEmploymentType(employmentType);
        const normalizedHazardPayRate = normalizedEmploymentType === 'CLT'
            ? normalizeHazardPayRate(hazardPayRate)
            : 0;
        const normalizedHazardPayBase = normalizedHazardPayRate > 0
            ? Math.max(0, Number(hazardPayBase) || CURRENT_MINIMUM_WAGE)
            : null;
        const normalizedBaseSalary = Math.max(0, baseSalary != null ? Number(baseSalary) : normalizedNetSalary);
        const shouldApplyTransportDiscount = normalizedEmploymentType === 'CLT' && Boolean(transportDiscountEnabled);

        const entry = await prisma.$transaction(async transaction => {
            const importRecord = await transaction.payrollImport.upsert({
                where: {
                    competenceMonth_competenceYear_unit: {
                        competenceMonth: normalizedCompetenceMonth,
                        competenceYear: normalizedCompetenceYear,
                        unit,
                    },
                },
                update: {},
                create: {
                    fileName: `Manual - ${unit} - ${normalizedCompetenceMonth}/${normalizedCompetenceYear}`,
                    competenceMonth: normalizedCompetenceMonth,
                    competenceYear: normalizedCompetenceYear,
                    unit,
                    processingStatus: 'completed',
                },
            });
            const createdEntry = await transaction.payrollEntry.create({
                data: {
                    payrollImportId: importRecord.id,
                    employeeName,
                    netSalary: normalizedNetSalary,
                    baseSalary: normalizedBaseSalary,
                    cargo: cargo || null,
                    bonus: bonus != null ? Math.max(0, Number(bonus) || 0) : 0,
                    paymentStatus: 'unpaid',
                    confidenceScore: 1,
                    extractionSource: 'manual',
                    hasAdiantamento: hasAdiantamento || false,
                    isRecurring: isRecurring || false,
                    hasFgts: hasFgts !== undefined ? Boolean(hasFgts) : true,
                    employmentType: normalizedEmploymentType,
                    hazardPayRate: normalizedHazardPayRate,
                    hazardPayBase: normalizedHazardPayBase,
                    notes: notes || null,
                    adjustments: shouldApplyTransportDiscount ? {
                        create: {
                            kind: 'transport',
                            direction: 'debit',
                            label: AUTOMATIC_TRANSPORT_LABEL,
                            amount: calculateAutomaticTransportDiscount(normalizedBaseSalary),
                        },
                    } : undefined,
                },
            });
            await touchPayrollImportRevisions(transaction, [importRecord.id]);
            return createdEntry;
        });

        return NextResponse.json(entry);
    } catch (err) {
        if (err instanceof UnitAccessDeniedError) return unitAccessDeniedResponse(err);
        console.error('POST entry error:', err);
        return NextResponse.json({ error: 'Erro ao criar entrada' }, { status: 500 });
    }
}

// PUT — update entry
export async function PUT(request: NextRequest) {
    const guard = requireUnitGuard(request);
    if (guard instanceof NextResponse) return guard;
    if (!guard.isAdmin && !guard.permissions?.financeiro) {
        return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    try {
        const body = await request.json();
        const { id, employeeName, netSalary, baseSalary, cargo, bonus, notes, hasAdiantamento, isRecurring, employmentType, hazardPayRate, hazardPayBase, transportDiscountEnabled } = body;
        const expectedUpdatedAt = parseOptionalExpectedUpdatedAt(body.expectedUpdatedAt);

        if (!id) {
            return NextResponse.json({ error: 'ID é obrigatório' }, { status: 400 });
        }

        const entry = await prisma.$transaction(async transaction => {
            const currentEntry = await transaction.payrollEntry.findUnique({
                where: { id: String(id) },
                select: {
                    id: true,
                    payrollImportId: true,
                    updatedAt: true,
                    baseSalary: true,
                    netSalary: true,
                    employmentType: true,
                    payrollImport: { select: { unit: true } },
                    adjustments: {
                        where: { kind: 'transport', label: AUTOMATIC_TRANSPORT_LABEL },
                        select: { id: true },
                        take: 1,
                    },
                },
            });
            if (!currentEntry) return null;

            guard.enforceUnit(currentEntry.payrollImport.unit);
            const requiredExpectedUpdatedAt = requireExpectedUpdatedAt(expectedUpdatedAt);
            if (!matchesExpectedUpdatedAt(currentEntry.updatedAt, requiredExpectedUpdatedAt)) {
                throw new PayrollWriteConflictError();
            }

            const normalizedEmploymentType = employmentType !== undefined
                ? normalizeEmploymentType(employmentType)
                : undefined;
            const normalizedHazardPayRate = normalizedEmploymentType === 'PJ'
                ? 0
                : hazardPayRate !== undefined
                    ? normalizeHazardPayRate(hazardPayRate)
                    : undefined;
            const normalizedHazardPayBase = normalizedHazardPayRate === 0
                ? null
                : hazardPayBase !== undefined
                    ? Math.max(0, Number(hazardPayBase) || CURRENT_MINIMUM_WAGE)
                    : undefined;

            const nextBaseSalary = Math.max(0, baseSalary !== undefined
                ? Number(baseSalary ?? netSalary ?? 0)
                : currentEntry.baseSalary ?? currentEntry.netSalary);
            const nextEmploymentType = normalizedEmploymentType !== undefined
                ? normalizedEmploymentType
                : normalizeEmploymentType(currentEntry.employmentType);
            const automaticTransport = currentEntry.adjustments[0];
            const transportEnabled = transportDiscountEnabled !== undefined
                ? Boolean(transportDiscountEnabled)
                : Boolean(automaticTransport);
            const shouldApplyTransportDiscount = nextEmploymentType === 'CLT' && transportEnabled;
            const mutationTime = nextPayrollUpdatedAt(currentEntry.updatedAt);

            const updated = await transaction.payrollEntry.updateMany({
                where: {
                    id: currentEntry.id,
                    payrollImport: { unit: currentEntry.payrollImport.unit },
                    updatedAt: requiredExpectedUpdatedAt,
                },
                data: {
                    ...(employeeName && { employeeName }),
                    ...(netSalary != null && { netSalary: parseFloat(netSalary) }),
                    ...(baseSalary !== undefined && { baseSalary: baseSalary != null ? parseFloat(baseSalary) : null }),
                    ...(cargo !== undefined && { cargo: cargo || null }),
                    ...(bonus !== undefined && { bonus: bonus != null ? Math.max(0, Number(bonus) || 0) : 0 }),
                    ...(notes !== undefined && { notes }),
                    ...(hasAdiantamento !== undefined && { hasAdiantamento: Boolean(hasAdiantamento) }),
                    ...(isRecurring !== undefined && { isRecurring: Boolean(isRecurring) }),
                    ...(normalizedEmploymentType !== undefined && { employmentType: normalizedEmploymentType }),
                    ...(normalizedHazardPayRate !== undefined && { hazardPayRate: normalizedHazardPayRate }),
                    ...(normalizedHazardPayBase !== undefined && { hazardPayBase: normalizedHazardPayBase }),
                    updatedAt: mutationTime,
                },
            });
            if (updated.count !== 1) throw new PayrollWriteConflictError();

            if (shouldApplyTransportDiscount) {
                if (automaticTransport) {
                    const transportUpdated = await transaction.payrollAdjustment.updateMany({
                        where: {
                            id: automaticTransport.id,
                            payrollEntryId: currentEntry.id,
                        },
                        data: { amount: calculateAutomaticTransportDiscount(nextBaseSalary) },
                    });
                    if (transportUpdated.count !== 1) throw new PayrollWriteConflictError();
                } else {
                    await transaction.payrollAdjustment.create({
                        data: {
                            payrollEntryId: currentEntry.id,
                            kind: 'transport',
                            direction: 'debit',
                            label: AUTOMATIC_TRANSPORT_LABEL,
                            amount: calculateAutomaticTransportDiscount(nextBaseSalary),
                        },
                    });
                }
            } else {
                await transaction.payrollAdjustment.deleteMany({
                    where: {
                        payrollEntryId: currentEntry.id,
                        kind: 'transport',
                        label: AUTOMATIC_TRANSPORT_LABEL,
                    },
                });
            }

            await touchPayrollImportRevisions(transaction, [currentEntry.payrollImportId]);
            return transaction.payrollEntry.findUnique({ where: { id: currentEntry.id } });
        });

        if (!entry) return NextResponse.json({ error: 'Colaborador não encontrado' }, { status: 404 });

        return NextResponse.json(entry);
    } catch (err) {
        if (err instanceof PayrollVersionRequiredError) return versionRequiredResponse();
        if (err instanceof PayrollVersionInvalidError) {
            return NextResponse.json({ error: 'Versão da folha inválida' }, { status: 400 });
        }
        if (err instanceof PayrollWriteConflictError) return writeConflictResponse();
        if (err instanceof UnitAccessDeniedError) return unitAccessDeniedResponse(err);
        console.error('PUT entry error:', err);
        return NextResponse.json({ error: 'Erro ao atualizar entrada' }, { status: 500 });
    }
}

// DELETE — remove entry or entire import
export async function DELETE(request: NextRequest) {
    const guard = requireUnitGuard(request);
    if (guard instanceof NextResponse) return guard;
    if (!guard.isAdmin && !guard.permissions?.financeiro)
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        const importId = searchParams.get('importId');
        const rawExpectedUpdatedAt = searchParams.get('expectedUpdatedAt');
        const expectedUpdatedAt = parseOptionalExpectedUpdatedAt(
            rawExpectedUpdatedAt === null ? undefined : rawExpectedUpdatedAt,
        );
        if (importId) {
            const payrollImport = await prisma.payrollImport.findUnique({
                where: { id: importId },
                select: {
                    id: true,
                    unit: true,
                    competenceMonth: true,
                    competenceYear: true,
                    updatedAt: true,
                    entries: { select: { employeeName: true } },
                },
            });
            if (!payrollImport) {
                return NextResponse.json({ error: 'Competência não encontrada' }, { status: 404 });
            }
            guard.enforceUnit(payrollImport.unit);
            if (expectedUpdatedAt === undefined) return versionRequiredResponse();
            if (expectedUpdatedAt === null) {
                return NextResponse.json({ error: 'Versão da folha inválida' }, { status: 400 });
            }
            if (!matchesExpectedUpdatedAt(payrollImport.updatedAt, expectedUpdatedAt)) {
                return writeConflictResponse();
            }

            const exclusions = payrollImport.entries.map(entry => ({
                competenceMonth: payrollImport.competenceMonth,
                competenceYear: payrollImport.competenceYear,
                unit: payrollImport.unit,
                employeeKey: normalizePayrollEmployeeKey(entry.employeeName),
                employeeName: entry.employeeName,
            }));

            await prisma.$transaction(async transaction => {
                if (exclusions.length > 0) {
                    await transaction.payrollEntryExclusion.createMany({
                        data: exclusions,
                        skipDuplicates: true,
                    });
                }
                // Entries e ajustes são removidos em cascata após registrar o bloqueio.
                const deleted = await transaction.payrollImport.deleteMany({
                    where: {
                        id: payrollImport.id,
                        updatedAt: expectedUpdatedAt,
                    },
                });
                if (deleted.count !== 1) throw new PayrollWriteConflictError();
            });
            return NextResponse.json({ success: true });
        }

        if (!id) {
            return NextResponse.json({ error: 'ID é obrigatório' }, { status: 400 });
        }

        const entry = await prisma.payrollEntry.findUnique({
            where: { id },
            select: {
                id: true,
                employeeName: true,
                updatedAt: true,
                payrollImportId: true,
                payrollImport: {
                    select: {
                        unit: true,
                        competenceMonth: true,
                        competenceYear: true,
                    },
                },
            },
        });
        if (!entry) {
            return NextResponse.json({ error: 'Colaborador não encontrado' }, { status: 404 });
        }
        guard.enforceUnit(entry.payrollImport.unit);
        if (expectedUpdatedAt === undefined) return versionRequiredResponse();
        if (expectedUpdatedAt === null) {
            return NextResponse.json({ error: 'Versão da folha inválida' }, { status: 400 });
        }
        if (!matchesExpectedUpdatedAt(entry.updatedAt, expectedUpdatedAt)) {
            return writeConflictResponse();
        }

        const exclusionIdentity = {
            competenceMonth: entry.payrollImport.competenceMonth,
            competenceYear: entry.payrollImport.competenceYear,
            unit: entry.payrollImport.unit,
            employeeKey: normalizePayrollEmployeeKey(entry.employeeName),
        };

        await prisma.$transaction(async transaction => {
            await transaction.payrollEntryExclusion.upsert({
                where: {
                    competenceMonth_competenceYear_unit_employeeKey: exclusionIdentity,
                },
                update: { employeeName: entry.employeeName },
                create: { ...exclusionIdentity, employeeName: entry.employeeName },
            });
            const deleted = await transaction.payrollEntry.deleteMany({
                where: {
                    id: entry.id,
                    payrollImport: { unit: entry.payrollImport.unit },
                    updatedAt: expectedUpdatedAt,
                },
            });
            if (deleted.count !== 1) throw new PayrollWriteConflictError();
            await touchPayrollImportRevisions(transaction, [entry.payrollImportId]);
        });

        return NextResponse.json({ success: true });
    } catch (err) {
        if (err instanceof PayrollWriteConflictError) return writeConflictResponse();
        if (err instanceof UnitAccessDeniedError) return unitAccessDeniedResponse(err);
        console.error('DELETE entry error:', err);
        return NextResponse.json({ error: 'Erro ao remover entrada' }, { status: 500 });
    }
}
