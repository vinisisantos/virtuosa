import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// GET — list entries by competence
export async function GET(request: NextRequest) {
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

        const imports = await prisma.payrollImport.findMany({
            where: whereClause,
            include: {
                entries: {
                    orderBy: { employeeName: 'asc' },
                },
            },
            orderBy: { uploadDate: 'desc' },
        });

        // Flatten entries from all imports of this competence
        const allEntries = imports.flatMap(imp => imp.entries);

        const getEffectiveSalary = (e: any) => e.hasPenalty ? e.netSalary * 1.1 : e.netSalary;

        const summary = {
            totalPayroll: allEntries.reduce((sum, e) => sum + getEffectiveSalary(e), 0),
            totalPaid: allEntries.filter(e => e.paymentStatus === 'paid').reduce((sum, e) => sum + getEffectiveSalary(e), 0),
            totalPending: allEntries.filter(e => e.paymentStatus !== 'paid').reduce((sum, e) => sum + getEffectiveSalary(e), 0),
            totalEmployees: allEntries.length,
            paidCount: allEntries.filter(e => e.paymentStatus === 'paid').length,
            pendingCount: allEntries.filter(e => e.paymentStatus === 'unpaid').length,
            reviewCount: allEntries.filter(e => e.paymentStatus === 'review').length,
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
    try {
        const body = await request.json();
        const { employeeName, netSalary, unit, competenceMonth, competenceYear, notes } = body;

        if (!employeeName || netSalary == null || !unit || !competenceMonth || !competenceYear) {
            return NextResponse.json({ error: 'Nome, salário, unidade e competência são obrigatórios' }, { status: 400 });
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

        const entry = await prisma.payrollEntry.create({
            data: {
                payrollImportId: importRecord.id,
                employeeName,
                netSalary: parseFloat(netSalary),
                paymentStatus: 'unpaid',
                confidenceScore: 1.0,
                extractionSource: 'manual',
                notes: notes || null,
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
    try {
        const body = await request.json();
        const { id, employeeName, netSalary, notes } = body;

        if (!id) {
            return NextResponse.json({ error: 'ID é obrigatório' }, { status: 400 });
        }

        const entry = await prisma.payrollEntry.update({
            where: { id },
            data: {
                ...(employeeName && { employeeName }),
                ...(netSalary != null && { netSalary: parseFloat(netSalary) }),
                ...(notes !== undefined && { notes }),
            },
        });

        return NextResponse.json(entry);
    } catch (err) {
        console.error('PUT entry error:', err);
        return NextResponse.json({ error: 'Erro ao atualizar entrada' }, { status: 500 });
    }
}

// DELETE — remove entry or entire import
export async function DELETE(request: NextRequest) {
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
