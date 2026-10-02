import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { normalizePayrollEmployeeKey } from '@/lib/payroll-recurrence';
import {
  matchesExpectedUpdatedAt,
  parseOptionalExpectedUpdatedAt,
  touchPayrollImportRevisions,
} from '@/lib/payroll-sync';
import { vacationCompetences, vacationDaysInCompetence } from '@/lib/payroll-vacations';
import { requireUnitGuard, UnitAccessDeniedError, unitAccessDeniedResponse } from '@/lib/unit-guard';

class VacationError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function parseDate(value: unknown): Date {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new VacationError('Informe uma data válida no formato AAAA-MM-DD.', 400);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new VacationError('Informe uma data válida.', 400);
  }
  return date;
}

function errorResponse(error: unknown) {
  if (error instanceof UnitAccessDeniedError) return unitAccessDeniedResponse(error);
  if (error instanceof VacationError) return NextResponse.json({
    error: error.message,
    ...(error.status === 409 && error.message.includes('Recarregue') ? { reloadRequired: true } : {}),
  }, { status: error.status });
  console.error('Payroll vacation error:', error);
  return NextResponse.json({ error: 'Não foi possível salvar as férias.' }, { status: 500 });
}

type VacationScope = { unit: string; employeeKey: string; startDate: Date; endDate: Date };

async function refreshAffectedPayroll(
  transaction: Prisma.TransactionClient,
  scope: VacationScope,
) {
  const competences = vacationCompetences(scope);
  const imports = await transaction.payrollImport.findMany({
    where: {
      unit: scope.unit,
      OR: competences.map(competence => ({
        competenceMonth: competence.month,
        competenceYear: competence.year,
      })),
    },
    select: {
      id: true,
      entries: { select: { id: true, employeeName: true } },
    },
  });
  const affectedIds: string[] = [];
  const importIds: string[] = [];
  for (const payrollImport of imports) {
    const ids = payrollImport.entries
      .filter(entry => normalizePayrollEmployeeKey(entry.employeeName) === scope.employeeKey)
      .map(entry => entry.id);
    if (ids.length === 0) continue;
    affectedIds.push(...ids);
    importIds.push(payrollImport.id);
  }
  if (affectedIds.length === 0) return;

  await transaction.$executeRaw(Prisma.sql`
    UPDATE "PayrollEntry"
    SET "paymentStatus" = CASE WHEN "paymentStatus" = 'paid' THEN 'review' ELSE "paymentStatus" END,
        "paymentDate" = CASE WHEN "paymentStatus" = 'paid' THEN NULL ELSE "paymentDate" END,
        "updatedAt" = GREATEST(CURRENT_TIMESTAMP, "updatedAt" + INTERVAL '1 millisecond')
    WHERE "id" IN (${Prisma.join(affectedIds)})
  `);
  await touchPayrollImportRevisions(transaction, importIds);
}

function authorize(request: NextRequest) {
  const guard = requireUnitGuard(request);
  if (guard instanceof NextResponse) return guard;
  if (!guard.isAdmin && !guard.permissions?.financeiro) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }
  return guard;
}

export async function POST(request: NextRequest) {
  const guard = authorize(request);
  if (guard instanceof NextResponse) return guard;
  try {
    const body = await request.json() as Record<string, unknown>;
    const payrollEntryId = typeof body.payrollEntryId === 'string' ? body.payrollEntryId : '';
    const expectedUpdatedAt = parseOptionalExpectedUpdatedAt(body.expectedEntryUpdatedAt);
    if (!payrollEntryId) throw new VacationError('Selecione um colaborador.', 400);
    if (!expectedUpdatedAt) throw new VacationError('Recarregue a folha antes de salvar as férias.', 428);
    const startDate = parseDate(body.startDate);
    const endDate = parseDate(body.endDate);
    const totalDays = (endDate.getTime() - startDate.getTime()) / 86_400_000 + 1;
    if (totalDays < 1 || totalDays > 30) {
      throw new VacationError('O período deve ter entre 1 e 30 dias corridos.', 400);
    }
    const advanceAmount = body.advanceAmount == null ? 0 : Number(body.advanceAmount);
    if (!Number.isFinite(advanceAmount) || advanceAmount < 0) {
      throw new VacationError('Informe um adiantamento válido.', 400);
    }
    const advancePaidAt = advanceAmount > 0 ? parseDate(body.advancePaidAt) : null;
    if (advanceAmount > 0 && body.advanceRegisteredInCosts !== true) {
      throw new VacationError('Registre o adiantamento em Custos antes de abatê-lo da folha.', 400);
    }

    const vacation = await prisma.$transaction(async transaction => {
      const entrySelect = {
        employeeName: true, employmentType: true, updatedAt: true,
        payrollImport: { select: { unit: true, competenceMonth: true, competenceYear: true } },
      } as const;
      const initialEntry = await transaction.payrollEntry.findUnique({
        where: { id: payrollEntryId },
        select: entrySelect,
      });
      if (!initialEntry) throw new VacationError('Colaborador não encontrado.', 404);
      guard.enforceUnit(initialEntry.payrollImport.unit);
      const employeeKey = normalizePayrollEmployeeKey(initialEntry.employeeName);
      await transaction.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${initialEntry.payrollImport.unit}), hashtext(${employeeKey}))::text`;
      await transaction.$queryRaw`SELECT "id" FROM "PayrollEntry" WHERE "id" = ${payrollEntryId} FOR UPDATE`;
      const entry = await transaction.payrollEntry.findUnique({
        where: { id: payrollEntryId },
        select: entrySelect,
      });
      if (!entry) throw new VacationError('Colaborador não encontrado.', 404);
      if (entry.payrollImport.unit !== initialEntry.payrollImport.unit
        || normalizePayrollEmployeeKey(entry.employeeName) !== employeeKey) {
        throw new VacationError('Os dados do colaborador mudaram. Recarregue a folha.', 409);
      }
      if (entry.employmentType !== 'CLT') throw new VacationError('Férias estão disponíveis apenas para CLT.', 400);
      if (!matchesExpectedUpdatedAt(entry.updatedAt, expectedUpdatedAt)) {
        throw new VacationError('A folha mudou. Recarregue antes de salvar.', 409);
      }
      if (!vacationDaysInCompetence(
        { startDate, endDate }, entry.payrollImport.competenceMonth, entry.payrollImport.competenceYear,
      )) {
        throw new VacationError('O período deve incluir dias da competência selecionada.', 400);
      }
      const overlapping = await transaction.payrollVacation.findFirst({
        where: {
          unit: entry.payrollImport.unit,
          employeeKey,
          startDate: { lte: endDate },
          endDate: { gte: startDate },
        },
        select: { id: true },
      });
      if (overlapping) throw new VacationError('Já existe um período de férias para essas datas.', 409);

      const saved = await transaction.payrollVacation.create({
        data: {
          unit: entry.payrollImport.unit,
          employeeKey,
          employeeName: entry.employeeName,
          startDate,
          endDate,
          advanceAmount,
          advancePaidAt,
        },
      });
      await refreshAffectedPayroll(transaction, {
        unit: saved.unit, employeeKey: saved.employeeKey, startDate, endDate,
      });
      return saved;
    });
    return NextResponse.json(vacation, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  const guard = authorize(request);
  if (guard instanceof NextResponse) return guard;
  try {
    const id = request.nextUrl.searchParams.get('id');
    const expectedUpdatedAt = parseOptionalExpectedUpdatedAt(request.nextUrl.searchParams.get('expectedUpdatedAt'));
    if (!id) throw new VacationError('Selecione o período de férias.', 400);
    if (!expectedUpdatedAt) throw new VacationError('Recarregue a folha antes de remover as férias.', 428);
    await prisma.$transaction(async transaction => {
      const current = await transaction.payrollVacation.findUnique({ where: { id } });
      if (!current) throw new VacationError('Período de férias não encontrado.', 404);
      guard.enforceUnit(current.unit);
      if (!matchesExpectedUpdatedAt(current.updatedAt, expectedUpdatedAt)) {
        throw new VacationError('O período mudou. Recarregue a folha.', 409);
      }
      const deleted = await transaction.payrollVacation.deleteMany({
        where: { id, unit: current.unit, updatedAt: expectedUpdatedAt },
      });
      if (deleted.count !== 1) throw new VacationError('O período mudou. Recarregue a folha.', 409);
      await refreshAffectedPayroll(transaction, current);
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
