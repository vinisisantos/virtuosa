import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
  normalizeInstallmentRates,
  PAYMENT_FEE_METHODS,
  PAYMENT_FEE_PAYERS,
  PaymentFeeMethod,
  PaymentFeePayer,
} from '@/lib/payment-fees';
import { requireUnitGuard, UnitAccessDeniedError, unitAccessDeniedResponse } from '@/lib/unit-guard';

function parseNonNegativeNumber(value: unknown, label: string) {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${label} inválido.`);
  return Math.round((parsed + Number.EPSILON) * 10_000) / 10_000;
}

function parseConfigBody(body: Record<string, unknown>) {
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 80) : '';
  const method = typeof body.method === 'string' ? body.method : '';
  const brand = typeof body.brand === 'string' ? body.brand.trim().slice(0, 50) : '';
  const feePayer = typeof body.feePayer === 'string' ? body.feePayer : '';
  const fixedFee = parseNonNegativeNumber(body.fixedFee ?? 0, 'Taxa fixa em reais');
  const fixedRate = parseNonNegativeNumber(body.fixedRate ?? 0, 'Taxa fixa percentual');
  const installmentRates = normalizeInstallmentRates(body.installmentRates);

  if (!name) throw new Error('Informe o nome da operadora ou máquina.');
  if (!PAYMENT_FEE_METHODS.includes(method as PaymentFeeMethod)) {
    throw new Error('Método de pagamento inválido.');
  }
  if (!PAYMENT_FEE_PAYERS.includes(feePayer as PaymentFeePayer)) {
    throw new Error('Responsável pela taxa inválido.');
  }
  for (const rate of Object.values(installmentRates)) {
    if (fixedRate + rate >= 100) throw new Error('A soma das taxas percentuais deve ser menor que 100%.');
  }

  return {
    name,
    method,
    brand: brand || null,
    fixedFee,
    fixedRate,
    installmentRates,
    feePayer,
  };
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const guard = requireUnitGuard(req, { requestedUnit: url.searchParams.get('unit') });
  if (guard instanceof NextResponse) return guard;

  const method = url.searchParams.get('method');
  const where: Record<string, unknown> = { isActive: true };
  if (guard.unitFilter) where.unit = guard.unitFilter;
  if (method && PAYMENT_FEE_METHODS.includes(method as PaymentFeeMethod)) where.method = method;

  const configurations = await prisma.paymentMethodFeeConfig.findMany({
    where,
    select: {
      id: true,
      name: true,
      method: true,
      brand: true,
      unit: true,
      fixedFee: true,
      fixedRate: true,
      installmentRates: true,
      feePayer: true,
      isActive: true,
    },
    orderBy: [{ name: 'asc' }, { brand: 'asc' }],
  });

  return NextResponse.json({ configurations });
}

export async function POST(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  try {
    const body = await req.json() as Record<string, unknown>;
    const data = parseConfigBody(body);
    const configuration = await prisma.paymentMethodFeeConfig.create({
      data: {
        ...data,
        unit: guard.createUnit(typeof body.unit === 'string' ? body.unit : null),
      },
    });
    return NextResponse.json({ configuration }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao salvar configuração.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PUT(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  try {
    const body = await req.json() as Record<string, unknown>;
    const id = typeof body.id === 'string' ? body.id : '';
    if (!id) return NextResponse.json({ error: 'ID obrigatório.' }, { status: 400 });

    const existing = await prisma.paymentMethodFeeConfig.findUnique({
      where: { id },
      select: { unit: true },
    });
    if (!existing) return NextResponse.json({ error: 'Configuração não encontrada.' }, { status: 404 });
    try {
      guard.enforceUnit(existing.unit);
    } catch (error) {
      if (error instanceof UnitAccessDeniedError) return unitAccessDeniedResponse();
      throw error;
    }

    const configuration = await prisma.paymentMethodFeeConfig.update({
      where: { id },
      data: parseConfigBody(body),
    });
    return NextResponse.json({ configuration });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao atualizar configuração.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'ID obrigatório.' }, { status: 400 });

  const existing = await prisma.paymentMethodFeeConfig.findUnique({
    where: { id },
    select: { unit: true },
  });
  if (!existing) return NextResponse.json({ error: 'Configuração não encontrada.' }, { status: 404 });
  try {
    guard.enforceUnit(existing.unit);
  } catch (error) {
    if (error instanceof UnitAccessDeniedError) return unitAccessDeniedResponse();
    throw error;
  }

  await prisma.paymentMethodFeeConfig.update({ where: { id }, data: { isActive: false } });
  return NextResponse.json({ success: true });
}
