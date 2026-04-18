import { NextRequest, NextResponse } from 'next/server';
import { getUserFromHeaders } from '@/lib/auth';
import { parsePDF } from '@/lib/pdf-parser';
import { extractEmployees } from '@/lib/payroll-extractor';
import { prisma } from '@/lib/db';

export async function POST(request: NextRequest) {
    const user = getUserFromHeaders(request);
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    if (!user.isAdmin && !user.permissions?.financeiro)
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    try {
        const formData = await request.formData();
        const file = formData.get('file') as File | null;
        const competenceMonth = parseInt(formData.get('competenceMonth') as string);
        const competenceYear = parseInt(formData.get('competenceYear') as string);
        const unit = (formData.get('unit') as string) || 'Barueri';
        const confirmImport = formData.get('confirmImport') === 'true';

        if (!file) {
            return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 });
        }

        if (!competenceMonth || !competenceYear) {
            return NextResponse.json({ error: 'Competência (mês/ano) é obrigatória' }, { status: 400 });
        }

        // Convert file to buffer
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);

        // Parse PDF
        const parseResult = await parsePDF(buffer);

        if (!parseResult.success) {
            return NextResponse.json({
                error: parseResult.error || 'Não foi possível processar o PDF',
                method: parseResult.method,
                partialText: parseResult.text?.substring(0, 500),
            }, { status: 422 });
        }

        // Extract employees
        const employees = extractEmployees(parseResult.text);

        if (employees.length === 0) {
            return NextResponse.json({
                error: 'Nenhum colaborador encontrado no PDF. O formato pode não ser compatível.',
                rawText: parseResult.text?.substring(0, 2000),
                pages: parseResult.pages,
            }, { status: 422 });
        }

        // If confirmImport is true, save to database
        if (confirmImport) {
            // Check for existing import for same competence + unit
            const existingImport = await prisma.payrollImport.findFirst({
                where: { competenceMonth, competenceYear, unit },
            });
            let replacedExisting = false;
            if (existingImport) {
                // Delete old entries and import to prevent duplicates
                await prisma.payrollEntry.deleteMany({ where: { payrollImportId: existingImport.id } });
                await prisma.payrollImport.delete({ where: { id: existingImport.id } });
                replacedExisting = true;
            }

            const payrollImport = await prisma.payrollImport.create({
                data: {
                    fileName: file.name,
                    competenceMonth,
                    competenceYear,
                    unit,
                    processingStatus: 'completed',
                    rawExtractedText: parseResult.text,
                    entries: {
                        create: employees.map(emp => ({
                            employeeName: emp.name,
                            netSalary: emp.netSalary,
                            baseSalary: emp.baseSalary || null,
                            cargo: emp.cargo || null,
                            paymentStatus: emp.confidenceScore < 0.6 ? 'review' : 'unpaid',
                            confidenceScore: emp.confidenceScore,
                            extractionSource: emp.extractionSource,
                        })),
                    },
                },
                include: { entries: true },
            });

            return NextResponse.json({
                message: replacedExisting ? 'Folha substituída com sucesso!' : 'Folha importada com sucesso!',
                import: payrollImport,
                employeesFound: employees.length,
                replacedExisting,
            });
        }

        // Preview mode — return extracted data without saving
        return NextResponse.json({
            preview: true,
            employees,
            totalPayroll: employees.reduce((sum, e) => sum + e.netSalary, 0),
            employeesFound: employees.length,
            pages: parseResult.pages,
            method: parseResult.method,
            lowConfidenceCount: employees.filter(e => e.confidenceScore < 0.6).length,
        });

    } catch (err) {
        console.error('Upload error:', err);
        return NextResponse.json(
            { error: 'Erro interno ao processar o arquivo' },
            { status: 500 }
        );
    }
}
