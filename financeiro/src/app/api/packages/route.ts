import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
  calculatePaymentFee,
  normalizeInstallmentRates,
  PAYMENT_FEE_METHODS,
  PaymentFeeMethod,
  PaymentFeeValidationError,
} from '@/lib/payment-fees';
import { requireUnitGuard, UnitAccessDeniedError, unitAccessDeniedResponse } from '@/lib/unit-guard';
import { suppressWhatsAppCallbacksForClosedPackage } from '@/lib/whatsapp/callback-suppression';

const CLOSED_PACKAGE_RECORD_STATUSES = new Set(['ativo', 'concluido']);

/* GET — List packages with filters */
export async function GET(req: NextRequest) {
  const guard = requireUnitGuard(req, { requestedUnit: new URL(req.url).searchParams.get('unit') });
  if (guard instanceof NextResponse) return guard;

  try {
    const url = new URL(req.url);
    const status = url.searchParams.get('status');
    const search = url.searchParams.get('search');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};
    // UNIT GUARD: Filter by JWT unit
    if (guard.unitFilter) where.unit = guard.unitFilter;
    if (status) where.status = status;
    if (search) {
      where.OR = [{ clientName: { contains: search } }];
    }

    const packages = await (prisma as any).package.findMany({ where, orderBy: { createdAt: 'desc' } });

    const stats = {
      total: packages.length,
      ativos: packages.filter((p: any) => p.status === 'ativo').length,
      concluidos: packages.filter((p: any) => p.status === 'concluido').length,
      totalValue: packages.reduce((s: number, p: any) => s + p.totalValue, 0),
      totalPaid: packages.reduce((s: number, p: any) => s + p.paidValue, 0),
    };

    return NextResponse.json({ packages, stats });
  } catch (err) {
    console.error('Packages GET error:', err);
    return NextResponse.json({ error: 'Falha ao carregar pacotes' }, { status: 500 });
  }
}

/* POST — Create package */
export async function POST(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  try {
    const body = await req.json();
    const totalValue = Number(body.totalValue);
    const installments = Number.parseInt(body.installments || '1', 10);
    const paymentMethod = typeof body.paymentMethod === 'string' ? body.paymentMethod : 'pix';
    const unit = guard.createUnit(body.unit);
    const paymentFeeConfigId = typeof body.paymentFeeConfigId === 'string' && body.paymentFeeConfigId
      ? body.paymentFeeConfigId
      : null;

    if (!Number.isFinite(totalValue) || totalValue < 0) {
      return NextResponse.json({ error: 'Valor total inválido.' }, { status: 400 });
    }

    const pkg = await prisma.$transaction(async (tx) => {
      const feeConfig = paymentFeeConfigId
        ? await tx.paymentMethodFeeConfig.findFirst({
          where: { id: paymentFeeConfigId, unit, isActive: true },
        })
        : null;

      if (paymentFeeConfigId && !feeConfig) {
        throw new PaymentFeeValidationError('A configuração de taxa não existe ou pertence a outra unidade.');
      }
      if (feeConfig && feeConfig.method !== paymentMethod) {
        throw new PaymentFeeValidationError('A configuração de taxa não corresponde ao método de pagamento.');
      }
      if (feeConfig && !PAYMENT_FEE_METHODS.includes(paymentMethod as PaymentFeeMethod)) {
        throw new PaymentFeeValidationError('Este método de pagamento não aceita configuração de taxa.');
      }

      const installmentRates = normalizeInstallmentRates(feeConfig?.installmentRates);
      const installmentRate = feeConfig ? (installmentRates[String(installments)] ?? 0) : 0;
      const feeCalculation = calculatePaymentFee({
        baseAmount: totalValue,
        installments,
        fixedFee: feeConfig?.fixedFee ?? 0,
        fixedRate: feeConfig?.fixedRate ?? 0,
        installmentRate,
        feePayer: feeConfig?.feePayer === 'client' ? 'client' : 'clinic',
      });

      const created = await tx.package.create({
        data: {
          clientName: body.clientName,
          clientId: body.clientId || null,
          services: typeof body.services === 'string' ? body.services : JSON.stringify(body.services),
          totalValue: feeCalculation.baseAmount,
          paidValue: parseFloat(body.paidValue || '0'),
          paymentMethod,
          installments,
          paymentFeeConfigId: feeConfig?.id ?? null,
          paymentProvider: feeConfig?.name ?? null,
          paymentBrand: feeConfig?.brand ?? null,
          paymentFixedFee: feeConfig?.fixedFee ?? 0,
          paymentFixedRate: feeConfig?.fixedRate ?? 0,
          paymentInstallmentRate: installmentRate,
          paymentFeePayer: feeConfig?.feePayer === 'client' ? 'client' : 'clinic',
          paymentFeeAmount: feeCalculation.feeAmount,
          chargedValue: feeCalculation.chargedAmount,
          netValue: feeCalculation.netAmount,
          installmentValues: feeCalculation.installmentValues,
          totalSessions: parseInt(body.totalSessions || '1'),
          completedSessions: parseInt(body.completedSessions || '0'),
          status: body.status || 'ativo',
          unit,
          notes: body.notes || null,
        },
      });
      if (created.clientId && CLOSED_PACKAGE_RECORD_STATUSES.has(created.status)) {
        await suppressWhatsAppCallbacksForClosedPackage({
          db: tx,
          clientId: created.clientId,
          unit: created.unit,
        });
      }
      return created;
    });
    return NextResponse.json({ success: true, package: pkg });
  } catch (err) {
    if (err instanceof PaymentFeeValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error('Packages POST error:', err);
    return NextResponse.json({ error: 'Falha ao criar pacote' }, { status: 500 });
  }
}

/* PUT — Update package */
export async function PUT(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  try {
    const body = await req.json();
    const { id, ...data } = body;
    if (!id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 });

    // UNIT GUARD: Validate record belongs to user's unit
    const existing = await prisma.package.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Pacote não encontrado' }, { status: 404 });
    try { guard.enforceUnit(existing.unit); } catch (e) {
      if (e instanceof UnitAccessDeniedError) return unitAccessDeniedResponse();
      throw e;
    }

    if (data.services && typeof data.services !== 'string') data.services = JSON.stringify(data.services);
    if (data.totalValue !== undefined) data.totalValue = parseFloat(data.totalValue);
    if (data.paidValue !== undefined) data.paidValue = parseFloat(data.paidValue);
    if (data.installments) data.installments = parseInt(data.installments);
    if (data.totalSessions) data.totalSessions = parseInt(data.totalSessions);
    if (data.completedSessions !== undefined) data.completedSessions = parseInt(data.completedSessions);
    // UNIT GUARD: Don't allow unit change for non-admins
    if (!guard.isAdmin) delete data.unit;
    delete data.paymentFeeConfigId;
    delete data.paymentProvider;
    delete data.paymentBrand;
    delete data.paymentFixedFee;
    delete data.paymentFixedRate;
    delete data.paymentInstallmentRate;
    delete data.paymentFeePayer;
    delete data.paymentFeeAmount;
    delete data.chargedValue;
    delete data.netValue;
    delete data.installmentValues;

    const hasPaymentFeeSnapshot = Boolean(
      existing.paymentFeeConfigId
      || existing.paymentProvider
      || existing.paymentFeeAmount > 0
      || existing.paymentFixedFee > 0
      || existing.paymentFixedRate > 0
      || existing.paymentInstallmentRate > 0,
    );
    const nextPaymentMethod = typeof data.paymentMethod === 'string' ? data.paymentMethod : existing.paymentMethod;
    const nextInstallments = typeof data.installments === 'number' ? data.installments : existing.installments;
    if (hasPaymentFeeSnapshot && nextPaymentMethod !== existing.paymentMethod) {
      return NextResponse.json({ error: 'O método de uma venda com taxa registrada não pode ser trocado na edição.' }, { status: 400 });
    }
    if (hasPaymentFeeSnapshot && nextInstallments !== existing.installments) {
      return NextResponse.json({ error: 'As parcelas de uma venda com taxa registrada não podem ser trocadas na edição.' }, { status: 400 });
    }

    if (data.totalValue !== undefined || data.installments !== undefined) {
      const feeCalculation = calculatePaymentFee({
        baseAmount: typeof data.totalValue === 'number' ? data.totalValue : existing.totalValue,
        installments: nextInstallments,
        fixedFee: existing.paymentFixedFee,
        fixedRate: existing.paymentFixedRate,
        installmentRate: existing.paymentInstallmentRate,
        feePayer: existing.paymentFeePayer === 'client' ? 'client' : 'clinic',
      });
      data.chargedValue = feeCalculation.chargedAmount;
      data.netValue = feeCalculation.netAmount;
      data.paymentFeeAmount = feeCalculation.feeAmount;
      data.installmentValues = feeCalculation.installmentValues;
    }

    const pkg = await prisma.$transaction(async (tx) => {
      const updated = await tx.package.update({ where: { id }, data });
      if (updated.clientId && CLOSED_PACKAGE_RECORD_STATUSES.has(updated.status)) {
        await suppressWhatsAppCallbacksForClosedPackage({
          db: tx,
          clientId: updated.clientId,
          unit: updated.unit,
        });
      }
      return updated;
    });
    return NextResponse.json({ success: true, package: pkg });
  } catch (err) {
    if (err instanceof PaymentFeeValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error('Packages PUT error:', err);
    return NextResponse.json({ error: 'Falha ao atualizar pacote' }, { status: 500 });
  }
}

/* DELETE — Remove package */
export async function DELETE(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  try {
    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 });

    // UNIT GUARD: Validate record belongs to user's unit
    const existing = await (prisma as any).package.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Pacote não encontrado' }, { status: 404 });
    try { guard.enforceUnit(existing.unit); } catch (e) {
      if (e instanceof UnitAccessDeniedError) return unitAccessDeniedResponse();
      throw e;
    }

    await (prisma as any).package.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Packages DELETE error:', err);
    return NextResponse.json({ error: 'Falha ao remover pacote' }, { status: 500 });
  }
}
