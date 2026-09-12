import { Prisma } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { parsePDF } from '@/lib/pdf-parser';
import { extractEmployees } from '@/lib/payroll-extractor';
import {
    PayrollWriteConflictError,
    matchesExpectedUpdatedAt,
    parseOptionalExpectedUpdatedAt,
    payrollWriteConflictPayload,
} from '@/lib/payroll-sync';
import { ACTIVE_UNITS } from '@/lib/role-access';
import {
    requireUnitGuard,
    UnitAccessDeniedError,
    unitAccessDeniedResponse,
} from '@/lib/unit-guard';

class PayrollVersionRequiredError extends Error {}

function versionRequiredResponse() {
    return NextResponse.json({
        error: 'A versão atual da folha é obrigatória. Recarregue os dados antes de substituir.',
        code: 'PAYROLL_VERSION_REQUIRED',
        reloadRequired: true,
    }, { status: 428 });
}

function writeConflictResponse() {
    return NextResponse.json(payrollWriteConflictPayload(), { status: 409 });
}

function recurrenceLockKey(month: number, year: number, unit: string) {
    return `payroll-recurrence:${year}-${String(month).padStart(2, '0')}:${unit}`;
}

export async function POST(request: NextRequest) {
    const guard = requireUnitGuard(request);
    if (guard instanceof NextResponse) return guard;
    if (!guard.isAdmin && !guard.permissions?.financeiro) {
        return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    try {
        const formData = await request.formData();
        const file = formData.get('file');
        const competenceMonth = Number(formData.get('competenceMonth'));
        const competenceYear = Number(formData.get('competenceYear'));
        const rawUnit = formData.get('unit');
        const unit = typeof rawUnit === 'string' ? rawUnit.trim() : '';
        const confirmImport = formData.get('confirmImport') === 'true';
        const rawExpectedUpdatedAt = formData.get('expectedUpdatedAt');
        const expectedUpdatedAt = parseOptionalExpectedUpdatedAt(
            rawExpectedUpdatedAt === null ? undefined : rawExpectedUpdatedAt,
        );

        if (!(file instanceof File)) {
            return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 });
        }
        if (!ACTIVE_UNITS.includes(unit as (typeof ACTIVE_UNITS)[number])) {
            return NextResponse.json({ error: 'Unidade inválida' }, { status: 400 });
        }
        if (
            !Number.isInteger(competenceMonth)
            || competenceMonth < 1
            || competenceMonth > 12
            || !Number.isInteger(competenceYear)
            || competenceYear < 2000
            || competenceYear > 9999
        ) {
            return NextResponse.json({ error: 'Competência (mês/ano) inválida' }, { status: 400 });
        }
        if (expectedUpdatedAt === null) {
            return NextResponse.json({ error: 'Versão da folha inválida' }, { status: 400 });
        }

        guard.enforceUnit(unit);

        const bytes = await file.arrayBuffer();
        const parseResult = await parsePDF(Buffer.from(bytes));

        if (!parseResult.success) {
            return NextResponse.json({
                error: parseResult.error || 'Não foi possível processar o PDF',
                method: parseResult.method,
                partialText: parseResult.text?.substring(0, 500),
            }, { status: 422 });
        }

        const employees = extractEmployees(parseResult.text);
        if (employees.length === 0) {
            return NextResponse.json({
                error: 'Nenhum colaborador encontrado no PDF. O formato pode não ser compatível.',
                rawText: parseResult.text?.substring(0, 2000),
                pages: parseResult.pages,
            }, { status: 422 });
        }

        if (confirmImport) {
            const result = await prisma.$transaction(async transaction => {
                await transaction.$queryRaw(
                    Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${recurrenceLockKey(competenceMonth, competenceYear, unit)}))`,
                );

                const existingImport = await transaction.payrollImport.findUnique({
                    where: {
                        competenceMonth_competenceYear_unit: {
                            competenceMonth,
                            competenceYear,
                            unit,
                        },
                    },
                    select: { id: true, updatedAt: true },
                });

                if (existingImport) {
                    if (expectedUpdatedAt === undefined) throw new PayrollVersionRequiredError();
                    if (!matchesExpectedUpdatedAt(existingImport.updatedAt, expectedUpdatedAt)) {
                        throw new PayrollWriteConflictError();
                    }

                    const deleted = await transaction.payrollImport.deleteMany({
                        where: {
                            id: existingImport.id,
                            updatedAt: expectedUpdatedAt,
                        },
                    });
                    if (deleted.count !== 1) throw new PayrollWriteConflictError();
                } else if (expectedUpdatedAt !== undefined) {
                    // A versão enviada pertencia a uma folha removida por outra sessão.
                    // Não a recrie silenciosamente sobre um estado que já mudou.
                    throw new PayrollWriteConflictError();
                }

                const payrollImport = await transaction.payrollImport.create({
                    data: {
                        fileName: file.name,
                        competenceMonth,
                        competenceYear,
                        unit,
                        processingStatus: 'completed',
                        rawExtractedText: parseResult.text,
                        entries: {
                            create: employees.map(employee => ({
                                employeeName: employee.name,
                                netSalary: employee.netSalary,
                                baseSalary: employee.baseSalary || null,
                                cargo: employee.cargo || null,
                                paymentStatus: employee.confidenceScore < 0.6 ? 'review' : 'unpaid',
                                confidenceScore: employee.confidenceScore,
                                extractionSource: employee.extractionSource,
                            })),
                        },
                    },
                    include: { entries: true },
                });

                return { payrollImport, replacedExisting: Boolean(existingImport) };
            }, { timeout: 20_000 });

            return NextResponse.json({
                message: result.replacedExisting
                    ? 'Folha substituída com sucesso!'
                    : 'Folha importada com sucesso!',
                import: result.payrollImport,
                employeesFound: employees.length,
                replacedExisting: result.replacedExisting,
            });
        }

        const existingImport = await prisma.payrollImport.findUnique({
            where: {
                competenceMonth_competenceYear_unit: {
                    competenceMonth,
                    competenceYear,
                    unit,
                },
            },
            select: { updatedAt: true },
        });

        return NextResponse.json({
            preview: true,
            employees,
            totalPayroll: employees.reduce((sum, employee) => sum + employee.netSalary, 0),
            employeesFound: employees.length,
            pages: parseResult.pages,
            method: parseResult.method,
            lowConfidenceCount: employees.filter(employee => employee.confidenceScore < 0.6).length,
            existingImportUpdatedAt: existingImport?.updatedAt.toISOString() || null,
        });
    } catch (err) {
        if (err instanceof UnitAccessDeniedError) return unitAccessDeniedResponse(err);
        if (err instanceof PayrollVersionRequiredError) return versionRequiredResponse();
        if (err instanceof PayrollWriteConflictError) return writeConflictResponse();
        console.error('Upload error:', err);
        return NextResponse.json(
            { error: 'Erro interno ao processar o arquivo' },
            { status: 500 },
        );
    }
}
