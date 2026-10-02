import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { normalizePayrollEmployeeKey } from '@/lib/payroll-recurrence';
import { calculatePayrollLegalFigures } from '@/lib/payroll-adjustments';
import { calculateVacationReceipt } from '@/lib/payroll-vacation-calculation';
import { findManualVacationCostMatches } from '@/lib/payroll-vacation-cost-link';
import { getPayrollTaxConfig } from '@/lib/payroll-tax-config';
import { manualVacationBillPaid } from '@/lib/payroll-vacation-server';
import {
  matchesExpectedUpdatedAt,
  nextPayrollUpdatedAt,
  parseOptionalExpectedUpdatedAt,
  touchPayrollImportRevisions,
} from '@/lib/payroll-sync';
import { vacationCompetences, vacationDaysInCompetence } from '@/lib/payroll-vacations';
import { requireUnitGuard, UnitAccessDeniedError, unitAccessDeniedResponse } from '@/lib/unit-guard';

class VacationError extends Error {
  readonly status: number;
  readonly details?: Record<string, unknown>;
  constructor(message: string, status: number, details?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.details = details;
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
    ...error.details,
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
      entries: { select: { id: true, employeeName: true, paymentStatus: true } },
    },
  });
  const affectedIds: string[] = [];
  const importIds: string[] = [];
  for (const payrollImport of imports) {
    const ids = payrollImport.entries
      .filter(entry => normalizePayrollEmployeeKey(entry.employeeName) === scope.employeeKey)
      .map(entry => entry.id);
    if (ids.length === 0) continue;
    if (payrollImport.entries.some(entry => ids.includes(entry.id) && entry.paymentStatus === 'paid')) {
      throw new VacationError('Esta competência já tem pagamento confirmado. Não altere férias de folha paga; confira com a contabilidade.', 409);
    }
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
    if (body.advanceAmount !== undefined || body.advancePaidAt !== undefined) {
      throw new VacationError('O valor das férias é calculado automaticamente pelas datas e salário.', 400);
    }
    if (body.advanceAlreadyPaid !== undefined && typeof body.advanceAlreadyPaid !== 'boolean') {
      throw new VacationError('Informe se o adiantamento de férias já foi pago.', 400);
    }
    const taxConfig = await getPayrollTaxConfig(startDate.getUTCFullYear());

    const vacation = await prisma.$transaction(async transaction => {
      const entrySelect = {
        employeeName: true, employmentType: true, updatedAt: true,
        netSalary: true, baseSalary: true, hazardPayRate: true, hazardPayBase: true,
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

      const receipt = calculateVacationReceipt({
        startDate, endDate,
        baseSalary: calculatePayrollLegalFigures(entry).grossSalary,
        inssBrackets: taxConfig.inssBrackets,
      });
      const backupUnits = [...new Set([guard.createUnit(), entry.payrollImport.unit])];
      const snapshots = await Promise.all(backupUnits.map(unit => transaction.financialBackup.findFirst({
        where: { unit, isAuto: true }, orderBy: { updatedAt: 'desc' }, select: { id: true, bills: true },
      })));
      const matches = findManualVacationCostMatches(snapshots.filter(snapshot => snapshot !== null), {
        unit: entry.payrollImport.unit,
        employeeName: entry.employeeName,
        netAmount: receipt.net,
        paymentMonth: receipt.paymentDueDate.slice(0, 7),
      });
      if (matches.length > 1) {
        throw new VacationError('Há mais de uma despesa de férias compatível. Concilie os lançamentos antes de continuar.', 409);
      }
      const matched = matches[0] || null;
      if (matched) {
        const alreadyLinked = await transaction.payrollVacation.findFirst({
          where: { linkedBackupId: matched.backupId, linkedBillId: matched.billId },
          select: { id: true },
        });
        if (alreadyLinked) {
          throw new VacationError('Esta despesa de férias já está vinculada a outro período. Concilie antes de continuar.', 409);
        }
      }
      if (body.confirmCost !== true) {
        throw new VacationError(
          matched
            ? `Vincular ao custo já existente “${matched.name}” sem duplicá-lo?`
            : 'Criar o custo automático do adiantamento de férias?',
          428,
          { confirmationRequired: true, receipt, matchedCost: matched },
        );
      }

      const advancePaid = matched ? matched.paid : body.advanceAlreadyPaid === true;
      const advancePaidAt = advancePaid
        ? new Date(`${matched?.date || receipt.paymentDueDate}T00:00:00.000Z`)
        : null;

      await refreshAffectedPayroll(transaction, {
        unit: entry.payrollImport.unit, employeeKey, startDate, endDate,
      });
      const saved = await transaction.payrollVacation.create({
        data: {
          unit: entry.payrollImport.unit,
          employeeKey,
          employeeName: entry.employeeName,
          startDate,
          endDate,
          advanceAmount: advancePaid ? receipt.net : 0,
          advancePaidAt,
          receipt,
          advanceCostMode: matched ? 'manual' : 'automatic',
          linkedBackupId: matched?.backupId || null,
          linkedBillId: matched?.billId || null,
        },
      });
      return saved;
    });
    return NextResponse.json(vacation, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  const guard = authorize(request);
  if (guard instanceof NextResponse) return guard;
  try {
    const body = await request.json() as Record<string, unknown>;
    const id = typeof body.id === 'string' ? body.id : '';
    const expectedUpdatedAt = parseOptionalExpectedUpdatedAt(body.expectedUpdatedAt);
    if (!id || !expectedUpdatedAt) throw new VacationError('Recarregue o custo antes de confirmar o pagamento.', 428);
    if (body.paymentStatus !== 'paid' && body.paymentStatus !== 'unpaid') {
      throw new VacationError('Status de pagamento inválido.', 400);
    }
    const paymentDate = body.paymentStatus === 'paid' && body.paymentDate !== undefined
      ? parseDate(body.paymentDate) : null;
    const updated = await prisma.$transaction(async transaction => {
      const current = await transaction.payrollVacation.findUnique({ where: { id } });
      if (!current) throw new VacationError('Período de férias não encontrado.', 404);
      guard.enforceUnit(current.unit);
      if ((current.advanceCostMode !== 'automatic' && current.advanceCostMode !== 'manual') || !current.receipt) {
        throw new VacationError('Este período não possui um custo de adiantamento vinculado.', 400);
      }
      if (!matchesExpectedUpdatedAt(current.updatedAt, expectedUpdatedAt)) {
        throw new VacationError('O custo mudou. Recarregue antes de salvar.', 409);
      }
      const receipt = current.receipt as { net?: unknown };
      if (typeof receipt.net !== 'number' || receipt.net <= 0) {
        throw new VacationError('Recibo de férias inválido.', 400);
      }

      if (current.advanceCostMode === 'manual') {
        const expectedBackupUpdatedAt = parseOptionalExpectedUpdatedAt(body.expectedBackupUpdatedAt);
        if (!current.linkedBackupId || current.linkedBillId == null || !expectedBackupUpdatedAt) {
          throw new VacationError('Recarregue a Folha para confirmar o custo manual vinculado.', 428);
        }
        const backup = await transaction.financialBackup.findUnique({
          where: { id: current.linkedBackupId },
          select: { id: true, unit: true, bills: true, updatedAt: true },
        });
        if (!backup || backup.unit !== current.unit) {
          throw new VacationError('O custo vinculado não está mais disponível. Confira em Custos.', 409);
        }
        if (!matchesExpectedUpdatedAt(backup.updatedAt, expectedBackupUpdatedAt)) {
          throw new VacationError('O custo mudou. Recarregue a Folha antes de salvar.', 409);
        }
        let bills: unknown;
        try { bills = JSON.parse(backup.bills); } catch { bills = null; }
        if (!Array.isArray(bills)) throw new VacationError('O custo vinculado está inválido.', 409);
        const billIndex = bills.findIndex(item => item && typeof item === 'object'
          && (item as Record<string, unknown>).id === current.linkedBillId);
        if (billIndex < 0) throw new VacationError('O custo vinculado foi removido. Confira em Custos.', 409);
        const bill = bills[billIndex] as Record<string, unknown>;
        const paymentKey = typeof bill.dueDateManual === 'string' ? bill.dueDateManual : '';
        if (bill.type !== 'variavel' || bill.unit !== current.unit || !paymentKey
          || Math.round(Number(bill.value) * 100) !== Math.round(receipt.net * 100)) {
          throw new VacationError('O custo vinculado foi alterado e precisa ser conciliado em Custos.', 409);
        }
        const payments = bill.payments && typeof bill.payments === 'object' && !Array.isArray(bill.payments)
          ? { ...(bill.payments as Record<string, unknown>) } : {};
        const currentlyPaid = payments[paymentKey] === true;
        const shouldBePaid = body.paymentStatus === 'paid';
        if (currentlyPaid === shouldBePaid) return current;

        await transaction.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${current.unit}), hashtext(${current.employeeKey}))::text`;
        await refreshAffectedPayroll(transaction, current);
        payments[paymentKey] = shouldBePaid;
        const nextBills = bills.map((item, index) => index === billIndex ? { ...bill, payments } : item);
        const backupUpdate = await transaction.financialBackup.updateMany({
          where: { id: backup.id, updatedAt: expectedBackupUpdatedAt },
          data: { bills: JSON.stringify(nextBills), updatedAt: nextPayrollUpdatedAt(backup.updatedAt) },
        });
        if (backupUpdate.count !== 1) throw new VacationError('O custo mudou. Recarregue a Folha antes de salvar.', 409);
        const periodUpdate = await transaction.payrollVacation.updateMany({
          where: { id, updatedAt: expectedUpdatedAt, unit: current.unit },
          data: { updatedAt: nextPayrollUpdatedAt(current.updatedAt) },
        });
        if (periodUpdate.count !== 1) throw new VacationError('O período mudou. Recarregue a Folha.', 409);
        return transaction.payrollVacation.findUniqueOrThrow({ where: { id } });
      }

      const amount = paymentDate ? receipt.net : 0;
      if (current.advanceAmount === amount
        && current.advancePaidAt?.toISOString().slice(0, 10) === paymentDate?.toISOString().slice(0, 10)) return current;
      await transaction.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${current.unit}), hashtext(${current.employeeKey}))::text`;
      await refreshAffectedPayroll(transaction, current);
      const result = await transaction.payrollVacation.updateMany({
        where: { id, updatedAt: expectedUpdatedAt, unit: current.unit },
        data: { advanceAmount: amount, advancePaidAt: paymentDate },
      });
      if (result.count !== 1) throw new VacationError('O custo mudou. Recarregue antes de salvar.', 409);
      return transaction.payrollVacation.findUniqueOrThrow({ where: { id } });
    });
    return NextResponse.json(updated);
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
      if (current.advanceCostMode === 'automatic' && current.advancePaidAt) {
        throw new VacationError('O adiantamento já foi pago. Concilie ou estorne o pagamento antes de remover as férias.', 409);
      }
      if (current.advanceCostMode === 'manual' && current.linkedBackupId && current.linkedBillId != null) {
        const backup = await transaction.financialBackup.findUnique({
          where: { id: current.linkedBackupId },
          select: { unit: true, bills: true },
        });
        if (backup?.unit === current.unit && manualVacationBillPaid(backup.bills, current.linkedBillId)) {
          throw new VacationError('O adiantamento já foi pago em Custos. Concilie ou estorne o pagamento antes de remover as férias.', 409);
        }
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
