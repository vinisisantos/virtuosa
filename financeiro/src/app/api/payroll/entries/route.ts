import { NextRequest, NextResponse } from 'next/server';
import { getUserFromHeaders } from '@/lib/auth';
import { prisma } from '@/lib/db';
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

// GET — list entries by competence (with auto-creation of recurring entries)
export async function GET(request: NextRequest) {
    const user = getUserFromHeaders(request);
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    if (!user.isAdmin && !user.permissions?.financeiro)
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    try {
        const { searchParams } = new URL(request.url);
        const month = parseInt(searchParams.get('month') || '');
        const year = parseInt(searchParams.get('year') || '');
        const unit = searchParams.get('unit') || '';

        if (!month || !year) {
            return NextResponse.json({ error: 'Mês e ano são obrigatórios' }, { status: 400 });
        }

        const whereClause: any = {
            competenceMonth: month,
            competenceYear: year,
        };
        if (unit) {
            whereClause.unit = unit;
        }

        // --- Auto-create recurring entries from previous month ---
        try {
            const prevMonth = month === 1 ? 12 : month - 1;
            const prevYear = month === 1 ? year - 1 : year;

            const prevWhereClause: any = {
                competenceMonth: prevMonth,
                competenceYear: prevYear,
            };
            if (unit) prevWhereClause.unit = unit;

            // Find recurring entries from previous month
            const prevImports = await prisma.payrollImport.findMany({
                where: prevWhereClause,
                include: {
                    entries: {
                        where: { isRecurring: true },
                    },
                },
            });

            const recurringEntries = prevImports.flatMap(imp => imp.entries);

            if (recurringEntries.length > 0) {
                // Check if entries already exist for this month
                const existingImports = await prisma.payrollImport.findMany({
                    where: whereClause,
                    include: {
                        entries: {
                            select: { employeeName: true },
                        },
                    },
                });

                const existingNames = new Set(
                    existingImports.flatMap(imp => imp.entries.map(e => e.employeeName.toLowerCase().trim()))
                );

                // Filter only those that don't already exist
                const toCreate = recurringEntries.filter(
                    e => !existingNames.has(e.employeeName.toLowerCase().trim())
                );

                if (toCreate.length > 0) {
                    // Determine unit for new entries
                    const entryUnit = unit || prevImports[0]?.unit || 'SCS';

                    // Get or create import record for this month
                    const importRecord = await prisma.payrollImport.upsert({
                        where: {
                            competenceMonth_competenceYear_unit: {
                                competenceMonth: month,
                                competenceYear: year,
                                unit: entryUnit,
                            },
                        },
                        update: {},
                        create: {
                            fileName: `Recorrente - ${entryUnit} - ${month}/${year}`,
                            competenceMonth: month,
                            competenceYear: year,
                            unit: entryUnit,
                            processingStatus: 'completed',
                        },
                    });

                    // Create recurring entries
                    await prisma.payrollEntry.createMany({
                        data: toCreate.map(e => ({
                            payrollImportId: importRecord.id,
                            employeeName: e.employeeName,
                            netSalary: e.netSalary,
                            baseSalary: e.baseSalary,
                            cargo: e.cargo,
                            bonus: 0,
                            paymentStatus: 'unpaid',
                            confidenceScore: 1.0,
                            extractionSource: 'recurring',
                            hasPenalty: false,
                            hasAdiantamento: e.hasAdiantamento,
                            hasFgts: e.hasFgts,
                            employmentType: e.employmentType,
                            hazardPayRate: e.hazardPayRate,
                            hazardPayBase: e.hazardPayBase,
                            isRecurring: true, // Keep recurring
                            notes: null,
                        })),
                    });
                }
            }
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
        });
    } catch (err) {
        console.error('GET entries error:', err);
        return NextResponse.json({ error: 'Erro ao buscar dados' }, { status: 500 });
    }
}

// POST — add manual entry
export async function POST(request: NextRequest) {
    const user = getUserFromHeaders(request);
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    if (!user.isAdmin && !user.permissions?.financeiro)
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    try {
        const body = await request.json();
        const { employeeName, netSalary, baseSalary, cargo, bonus, unit, competenceMonth, competenceYear, notes, hasAdiantamento, isRecurring, hasFgts, employmentType, hazardPayRate, hazardPayBase, transportDiscountEnabled } = body;

        if (!employeeName || netSalary == null || !unit || !competenceMonth || !competenceYear) {
            return NextResponse.json({ error: `Campos obrigatórios ausentes. name:${employeeName}, salary:${netSalary}, unit:${unit}, month:${competenceMonth}, year:${competenceYear}` }, { status: 400 });
        }

        // Find or create the import record for this specific unit and month
        const importRecord = await prisma.payrollImport.upsert({
            where: {
                competenceMonth_competenceYear_unit: {
                    competenceMonth: Number(competenceMonth),
                    competenceYear: Number(competenceYear),
                    unit: String(unit)
                }
            },
            update: {},
            create: {
                fileName: `Manual - ${unit} - ${competenceMonth}/${competenceYear}`,
                competenceMonth: Number(competenceMonth),
                competenceYear: Number(competenceYear),
                unit: String(unit),
                processingStatus: 'completed'
            }
        });

        const normalizedEmploymentType = normalizeEmploymentType(employmentType);
        const normalizedHazardPayRate = normalizedEmploymentType === 'CLT'
            ? normalizeHazardPayRate(hazardPayRate)
            : 0;
        const normalizedHazardPayBase = normalizedHazardPayRate > 0
            ? Math.max(0, Number(hazardPayBase) || CURRENT_MINIMUM_WAGE)
            : null;
        const normalizedBaseSalary = Math.max(0, baseSalary != null ? Number(baseSalary) : Number(netSalary));
        const shouldApplyTransportDiscount = normalizedEmploymentType === 'CLT' && Boolean(transportDiscountEnabled);

        const entry = await prisma.payrollEntry.create({
            data: {
                payrollImportId: importRecord.id,
                employeeName,
                netSalary: parseFloat(netSalary),
                baseSalary: normalizedBaseSalary,
                cargo: cargo || null,
                bonus: bonus != null ? Math.max(0, Number(bonus) || 0) : 0,
                paymentStatus: 'unpaid',
                confidenceScore: 1.0,
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

        return NextResponse.json(entry);
    } catch (err) {
        console.error('POST entry error:', err);
        return NextResponse.json({ error: 'Erro ao criar entrada' }, { status: 500 });
    }
}

// PUT — update entry
export async function PUT(request: NextRequest) {
    const user = getUserFromHeaders(request);
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    if (!user.isAdmin && !user.permissions?.financeiro)
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    try {
        const body = await request.json();
        const { id, employeeName, netSalary, baseSalary, cargo, bonus, notes, hasAdiantamento, isRecurring, employmentType, hazardPayRate, hazardPayBase, transportDiscountEnabled } = body;

        if (!id) {
            return NextResponse.json({ error: 'ID é obrigatório' }, { status: 400 });
        }

        const currentEntry = await prisma.payrollEntry.findUnique({
            where: { id },
            select: {
                baseSalary: true,
                netSalary: true,
                employmentType: true,
                adjustments: {
                    where: { kind: 'transport', label: AUTOMATIC_TRANSPORT_LABEL },
                    select: { id: true },
                    take: 1,
                },
            },
        });
        if (!currentEntry) return NextResponse.json({ error: 'Colaborador não encontrado' }, { status: 404 });

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

        const updateEntry = prisma.payrollEntry.update({
            where: { id },
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
            },
        });

        const syncTransport = shouldApplyTransportDiscount
            ? automaticTransport
                ? prisma.payrollAdjustment.update({
                    where: { id: automaticTransport.id },
                    data: { amount: calculateAutomaticTransportDiscount(nextBaseSalary) },
                })
                : prisma.payrollAdjustment.create({
                    data: {
                        payrollEntryId: id,
                        kind: 'transport',
                        direction: 'debit',
                        label: AUTOMATIC_TRANSPORT_LABEL,
                        amount: calculateAutomaticTransportDiscount(nextBaseSalary),
                    },
                })
            : prisma.payrollAdjustment.deleteMany({
                where: { payrollEntryId: id, kind: 'transport', label: AUTOMATIC_TRANSPORT_LABEL },
            });

        const [entry] = await prisma.$transaction([updateEntry, syncTransport]);

        return NextResponse.json(entry);
    } catch (err) {
        console.error('PUT entry error:', err);
        return NextResponse.json({ error: 'Erro ao atualizar entrada' }, { status: 500 });
    }
}

// DELETE — remove entry or entire import
export async function DELETE(request: NextRequest) {
    const user = getUserFromHeaders(request);
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    if (!user.isAdmin && !user.permissions?.financeiro)
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        const importId = searchParams.get('importId');

        if (importId) {
            // Delete entire import (entries cascade via onDelete: Cascade)
            await prisma.payrollImport.delete({ where: { id: importId } });
            return NextResponse.json({ success: true });
        }

        if (!id) {
            return NextResponse.json({ error: 'ID é obrigatório' }, { status: 400 });
        }

        await prisma.payrollEntry.delete({ where: { id } });

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error('DELETE entry error:', err);
        return NextResponse.json({ error: 'Erro ao remover entrada' }, { status: 500 });
    }
}
