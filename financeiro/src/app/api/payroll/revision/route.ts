import { NextRequest, NextResponse } from 'next/server';
import { canAccessAutomaticCosts, parseCostsPeriod, utcMonthRange } from '@/lib/automatic-costs';
import { prisma } from '@/lib/db';
import { ACTIVE_UNITS } from '@/lib/role-access';
import { buildPayrollRevision } from '@/lib/payroll-sync';
import { requireUnitGuard } from '@/lib/unit-guard';

function noStoreJson(body: Record<string, unknown>) {
  return NextResponse.json(body, {
    headers: { 'Cache-Control': 'private, no-store, max-age=0' },
  });
}

// Leitura pura e pequena usada para detectar alterações em outra tela/dispositivo.
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
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
  if (!canAccessAutomaticCosts(guard)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  const month = Number(searchParams.get('month'));
  const year = Number(searchParams.get('year'));
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

  const rawCostMonth = searchParams.get('costMonth');
  const rawCostYear = searchParams.get('costYear');
  const hasCostPeriod = rawCostMonth !== null || rawCostYear !== null;
  const costPeriod = hasCostPeriod ? parseCostsPeriod(rawCostMonth, rawCostYear) : null;
  if (hasCostPeriod && !costPeriod) {
    return NextResponse.json({ error: 'Período de custos inválido' }, { status: 400 });
  }
  const costRange = costPeriod ? utcMonthRange(costPeriod) : null;

  try {
    const [imports, orders] = await Promise.all([
      prisma.payrollImport.findMany({
        where: {
          competenceMonth: month,
          competenceYear: year,
          ...(guard.unitFilter ? { unit: guard.unitFilter } : {}),
        },
        select: { id: true, unit: true, updatedAt: true },
        orderBy: [{ unit: 'asc' }, { id: 'asc' }],
      }),
      costPeriod
        ? prisma.order.findMany({
            where: {
              costRecognizedAt: {
                gte: costRange!.start,
                lt: costRange!.end,
              },
              totalPrice: { gt: 0 },
              status: { not: 'Cancelado' },
              ...(guard.unitFilter ? { unit: guard.unitFilter } : {}),
            },
            select: { id: true, unit: true, updatedAt: true },
            orderBy: [{ unit: 'asc' }, { id: 'asc' }],
          })
        : Promise.resolve([]),
    ]);

    const revision = buildPayrollRevision([
      ...imports.map(payrollImport => ({
        id: costPeriod ? `payroll:${payrollImport.id}` : payrollImport.id,
        unit: payrollImport.unit,
        updatedAt: payrollImport.updatedAt,
      })),
      ...orders.map(order => ({
        id: `order:${order.id}`,
        unit: order.unit || '(sem unidade)',
        updatedAt: order.updatedAt,
      })),
    ]);

    return noStoreJson({
      ...revision,
      competenceMonth: month,
      competenceYear: year,
      unit: guard.unitFilter || 'all',
    });
  } catch (error) {
    console.error('GET payroll revision error:', error);
    return NextResponse.json({ error: 'Erro ao verificar atualização da folha' }, { status: 500 });
  }
}
