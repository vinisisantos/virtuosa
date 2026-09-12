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
import { calculatePayrollLegalFigures, calculatePayrollTotal } from '@/lib/payroll-adjustments';
import { buildPayrollRevision } from '@/lib/payroll-sync';
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
    const [payrollImports, productOrders] = await Promise.all([
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
              hasPenalty: true,
              adjustments: {
                select: {
                  kind: true,
                  direction: true,
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
    ]);

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
        const salary = calculatePayrollTotal(entry);
        const fgts = calculatePayrollLegalFigures(entry).fgts;

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
      ]),
      payroll,
      payrollCompetence,
      missingPayrollUnits: expectedPayrollUnits.filter(unit => !availablePayrollUnits.has(unit)),
      canManagePayrollPayments,
      productOrders,
      productOrdersTotal: productOrders.reduce((total, order) => total + (order.totalPrice || 0), 0),
    });
  } catch (error) {
    console.error('GET automatic costs error:', error);
    return NextResponse.json({ error: 'Erro ao buscar custos automáticos' }, { status: 500 });
  }
}
