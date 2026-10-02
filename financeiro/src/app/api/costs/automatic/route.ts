import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
  automaticPayrollPaymentTotals,
  canAccessAutomaticCosts,
  canManageAutomaticCosts,
  parseCostsPeriod,
  previousCompetence,
  utcMonthRange,
} from '@/lib/automatic-costs';
import { AUTOMATIC_TRANSPORT_LABEL, calculatePayrollLegalFigures, calculatePayrollTotal } from '@/lib/payroll-adjustments';
import { calculateCombinedVacationPayroll } from '@/lib/payroll-vacation-calculation';
import { linkedVacationPaymentState, storedVacationReceipt, vacationAdvancePaid } from '@/lib/payroll-vacation-server';
import { getPayrollTaxConfig } from '@/lib/payroll-tax-config';
import { buildPayrollRevision } from '@/lib/payroll-sync';
import { calculateVacationImpact, payrollVacationScopeKey } from '@/lib/payroll-vacations';
import type { VacationReceipt } from '@/lib/payroll-vacation-calculation';
import { ACTIVE_UNITS } from '@/lib/role-access';
import { requireUnitGuard } from '@/lib/unit-guard';

type PayrollUnitSummary = {
  unit: string;
  salaryTotal: number;
  fgtsTotal: number;
  total: number;
  employeeCount: number;
};

type PayrollEntrySummary = {
  id: string;
  employeeName: string;
  unit: string;
  salary: number;
  fgts: number;
  total: number;
  paymentStatus: string;
  paymentDate: Date | null;
  updatedAt: Date;
};

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const requestedUnit = searchParams.get('unit');
  const guard = requireUnitGuard(request, { requestedUnit });
  if (guard instanceof NextResponse) return guard;

  if (!canAccessAutomaticCosts(guard)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  const canManagePayrollPayments = canManageAutomaticCosts(guard);

  if (
    requestedUnit
    && requestedUnit !== 'all'
    && requestedUnit !== 'Todas'
    && !ACTIVE_UNITS.includes(requestedUnit as (typeof ACTIVE_UNITS)[number])
  ) {
    return NextResponse.json({ error: 'Unidade inválida' }, { status: 400 });
  }

  const period = parseCostsPeriod(searchParams.get('month'), searchParams.get('year'));
  if (!period) {
    return NextResponse.json({ error: 'Mês e ano válidos são obrigatórios' }, { status: 400 });
  }

  const payrollCompetence = previousCompetence(period);
  const recognitionRange = utcMonthRange(period);
  const hasGlobalAdminAccess = guard.isAdmin || guard.permissions?.admin === true;
  const effectiveUnitFilter = hasGlobalAdminAccess
    ? (requestedUnit && ACTIVE_UNITS.includes(requestedUnit as (typeof ACTIVE_UNITS)[number])
        ? requestedUnit
        : undefined)
    : guard.unitFilter;
  const unitWhere = effectiveUnitFilter ? { unit: effectiveUnitFilter } : {};

  try {
    const payrollRange = utcMonthRange(payrollCompetence);
    const [payrollImports, productOrders, vacations, advancePeriods] = await Promise.all([
      prisma.payrollImport.findMany({
        where: {
          competenceMonth: payrollCompetence.month,
          competenceYear: payrollCompetence.year,
          ...unitWhere,
        },
        select: {
          id: true,
          unit: true,
          updatedAt: true,
          entries: {
            select: {
              id: true,
              employeeName: true,
              netSalary: true,
              baseSalary: true,
              bonus: true,
              paymentStatus: true,
              paymentDate: true,
              updatedAt: true,
              employmentType: true,
              hasFgts: true,
              hazardPayRate: true,
              hazardPayBase: true,
              transportActualCost: true,
              hasPenalty: true,
              adjustments: {
                select: {
                  kind: true,
                  direction: true,
                  label: true,
                  quantity: true,
                  amount: true,
                },
              },
            },
          },
        },
      }),
      prisma.order.findMany({
        where: {
          costRecognizedAt: {
            gte: recognitionRange.start,
            lt: recognitionRange.end,
          },
          totalPrice: { gt: 0 },
          status: { not: 'Cancelado' },
          ...unitWhere,
        },
        select: {
          id: true,
          productName: true,
          totalPrice: true,
          costRecognizedAt: true,
          status: true,
          unit: true,
          updatedAt: true,
        },
        orderBy: [
          { costRecognizedAt: 'asc' },
          { productName: 'asc' },
        ],
      }),
      prisma.payrollVacation.findMany({
        where: {
          ...unitWhere,
          startDate: { lt: payrollRange.end },
          endDate: { gte: payrollRange.start },
        },
        select: {
          id: true, unit: true, employeeKey: true, employeeName: true,
          startDate: true, endDate: true, advanceAmount: true,
          advancePaidAt: true, receipt: true, advanceCostMode: true,
          linkedBackupId: true, linkedBillId: true, updatedAt: true,
        },
      }),
      prisma.payrollVacation.findMany({
        where: {
          ...unitWhere,
          advanceCostMode: 'automatic',
          OR: [
            { startDate: { gte: new Date(recognitionRange.start.getTime() + 2 * 86_400_000), lt: new Date(recognitionRange.end.getTime() + 2 * 86_400_000) } },
            { advancePaidAt: { gte: recognitionRange.start, lt: recognitionRange.end } },
          ],
        },
        select: {
          id: true, employeeName: true, unit: true, startDate: true, endDate: true, receipt: true,
          advanceAmount: true, advancePaidAt: true, updatedAt: true,
        },
      }),
    ]);

    const vacationAdvances = advancePeriods.flatMap(period => {
      const receipt = period.receipt as VacationReceipt | null;
      if (!receipt || typeof receipt.net !== 'number' || !receipt.paymentDueDate) return [];
      const date = period.advancePaidAt?.toISOString().slice(0, 10) || receipt.paymentDueDate;
      if (date < recognitionRange.start.toISOString().slice(0, 10)
        || date >= recognitionRange.end.toISOString().slice(0, 10)) return [];
      return [{
        id: period.id, employeeName: period.employeeName, unit: period.unit,
        startDate: period.startDate.toISOString().slice(0, 10),
        endDate: period.endDate.toISOString().slice(0, 10),
        amount: receipt.net, date, isPaid: Boolean(period.advancePaidAt), updatedAt: period.updatedAt,
      }];
    });

    const hasReceipts = vacations.some(vacation => storedVacationReceipt(vacation.receipt) !== null);
    const [taxConfig, linkedPayments] = await Promise.all([
      hasReceipts ? getPayrollTaxConfig(payrollCompetence.year) : Promise.resolve(null),
      linkedVacationPaymentState(vacations),
    ]);
    const vacationsByEmployee = new Map<string, typeof vacations>();
    for (const vacation of vacations) {
      const key = payrollVacationScopeKey(vacation.unit, vacation.employeeKey);
      const current = vacationsByEmployee.get(key) || [];
      current.push(vacation);
      vacationsByEmployee.set(key, current);
    }

    const payrollUnits = new Map<string, PayrollUnitSummary>();
    let salaryTotal = 0;
    let fgtsTotal = 0;
    let paidTotal = 0;
    let pendingTotal = 0;
    let paidSalaryTotal = 0;
    let pendingSalaryTotal = 0;
    let paidFgtsTotal = 0;
    let pendingFgtsTotal = 0;
    let employeeCount = 0;
    const payrollEntries: PayrollEntrySummary[] = [];

    for (const payrollImport of payrollImports) {
      const unitSummary = payrollUnits.get(payrollImport.unit) || {
        unit: payrollImport.unit,
        salaryTotal: 0,
        fgtsTotal: 0,
        total: 0,
        employeeCount: 0,
      };

      for (const entry of payrollImport.entries) {
        const periods = entry.employmentType === 'CLT'
          ? vacationsByEmployee.get(payrollVacationScopeKey(payrollImport.unit, entry.employeeName)) || []
          : [];
        const normalizedPeriods = periods.map(period => ({
          ...period,
          advanceAmount: storedVacationReceipt(period.receipt) && vacationAdvancePaid(period, linkedPayments)
            ? storedVacationReceipt(period.receipt)!.net : period.advanceAmount,
        }));
        const vacation = calculateVacationImpact(
          normalizedPeriods,
          payrollCompetence.month,
          payrollCompetence.year,
          calculatePayrollLegalFigures(entry).grossSalary,
        );
        const receipts = periods.map(period => ({
          receipt: storedVacationReceipt(period.receipt),
          advancePaid: vacationAdvancePaid(period, linkedPayments),
        }));
        const vacationPayroll = taxConfig && receipts.length > 0 && receipts.every(period => period.receipt)
          ? calculateCombinedVacationPayroll({
              periods: receipts as Array<{ receipt: NonNullable<(typeof receipts)[number]['receipt']>; advancePaid: boolean }>,
              competenceMonth: payrollCompetence.month,
              competenceYear: payrollCompetence.year,
              baseSalary: calculatePayrollLegalFigures(entry).grossSalary,
              bonus: entry.bonus || 0,
              transportEnabled: entry.adjustments.some(adjustment => adjustment.kind === 'transport'
                && adjustment.label === AUTOMATIC_TRANSPORT_LABEL),
              actualTransportCost: entry.transportActualCost,
              inssBrackets: taxConfig.inssBrackets,
              irrfTable: taxConfig.irrfTable,
            }) : null;
        const valuedEntry = { ...entry, vacation, vacationPayroll };
        const salary = calculatePayrollTotal(valuedEntry);
        const fgts = calculatePayrollLegalFigures(valuedEntry).fgts;

        salaryTotal += salary;
        fgtsTotal += fgts;
        employeeCount += 1;
        const paymentTotals = automaticPayrollPaymentTotals({
          salary,
          fgts,
          paymentStatus: entry.paymentStatus,
        });
        paidTotal += paymentTotals.paidTotal;
        pendingTotal += paymentTotals.pendingTotal;
        paidSalaryTotal += paymentTotals.paidSalaryTotal;
        pendingSalaryTotal += paymentTotals.pendingSalaryTotal;
        paidFgtsTotal += paymentTotals.paidFgtsTotal;
        pendingFgtsTotal += paymentTotals.pendingFgtsTotal;

        if (canManagePayrollPayments) {
          payrollEntries.push({
            id: entry.id,
            employeeName: entry.employeeName,
            unit: payrollImport.unit,
            salary,
            fgts,
            total: salary + fgts,
            paymentStatus: entry.paymentStatus,
            paymentDate: entry.paymentDate,
            updatedAt: entry.updatedAt,
          });
        }

        unitSummary.salaryTotal += salary;
        unitSummary.fgtsTotal += fgts;
        unitSummary.total += salary + fgts;
        unitSummary.employeeCount += 1;
      }

      payrollUnits.set(payrollImport.unit, unitSummary);
    }

    const payroll = employeeCount > 0
      ? {
          competenceMonth: payrollCompetence.month,
          competenceYear: payrollCompetence.year,
          salaryTotal,
          fgtsTotal,
          total: salaryTotal + fgtsTotal,
          employeeCount,
          paidTotal,
          pendingTotal,
          paidSalaryTotal,
          pendingSalaryTotal,
          paidFgtsTotal,
          pendingFgtsTotal,
          units: Array.from(payrollUnits.values()).sort((a, b) => a.unit.localeCompare(b.unit, 'pt-BR')),
          entries: payrollEntries.sort((a, b) => (
            a.unit.localeCompare(b.unit, 'pt-BR')
            || a.employeeName.localeCompare(b.employeeName, 'pt-BR')
          )),
        }
      : null;

    const availablePayrollUnits = new Set(payrollImports.map(payrollImport => payrollImport.unit));
    const expectedPayrollUnits = effectiveUnitFilter ? [effectiveUnitFilter] : [...ACTIVE_UNITS];

    return NextResponse.json({
      payrollRevision: buildPayrollRevision(payrollImports),
      automaticCostsRevision: buildPayrollRevision([
        ...payrollImports.map(payrollImport => ({
          id: `payroll:${payrollImport.id}`,
          unit: payrollImport.unit,
          updatedAt: payrollImport.updatedAt,
        })),
        ...productOrders.map(order => ({
          id: `order:${order.id}`,
          unit: order.unit || '(sem unidade)',
          updatedAt: order.updatedAt,
        })),
        ...vacationAdvances.map(advance => ({
          id: `vacation-advance:${advance.id}`,
          unit: advance.unit,
          updatedAt: advance.updatedAt,
        })),
      ]),
      payroll,
      payrollCompetence,
      missingPayrollUnits: expectedPayrollUnits.filter(unit => !availablePayrollUnits.has(unit)),
      canManagePayrollPayments,
      productOrders,
      productOrdersTotal: productOrders.reduce((total, order) => total + (order.totalPrice || 0), 0),
      vacationAdvances,
    });
  } catch (error) {
    console.error('GET automatic costs error:', error);
    return NextResponse.json({ error: 'Erro ao buscar custos automáticos' }, { status: 500 });
  }
}
