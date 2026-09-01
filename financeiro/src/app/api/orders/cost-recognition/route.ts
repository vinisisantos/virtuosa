import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
  canManageOrderCostRecognition,
  costRecognitionDateKey,
  parseCostRecognitionDate,
  validateCostRecognitionTarget,
} from '@/lib/automatic-costs';
import {
  requireUnitGuard,
  UnitAccessDeniedError,
  unitAccessDeniedResponse,
} from '@/lib/unit-guard';

export async function PATCH(request: NextRequest) {
  const guard = requireUnitGuard(request);
  if (guard instanceof NextResponse) return guard;

  if (!canManageOrderCostRecognition(guard)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Corpo da requisição inválido' }, { status: 400 });
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Corpo da requisição inválido' }, { status: 400 });
  }

  const { id, costRecognizedAt } = body as Record<string, unknown>;
  if (typeof id !== 'string' || id.trim() === '') {
    return NextResponse.json({ error: 'ID do pedido é obrigatório' }, { status: 400 });
  }

  if (!Object.prototype.hasOwnProperty.call(body, 'costRecognizedAt')) {
    return NextResponse.json({ error: 'Data de lançamento em custos é obrigatória' }, { status: 400 });
  }

  const parsedDate = parseCostRecognitionDate(costRecognizedAt);
  if (!parsedDate.valid) {
    return NextResponse.json({ error: 'Data de lançamento em custos inválida' }, { status: 400 });
  }

  try {
    const order = await prisma.$transaction(async (tx) => {
      const currentOrder = await tx.order.findUnique({
        where: { id: id.trim() },
        select: {
          id: true,
          productName: true,
          totalPrice: true,
          status: true,
          unit: true,
          batchNumber: true,
          costRecognizedAt: true,
        },
      });

      if (!currentOrder) return null;
      guard.enforceUnit(currentOrder.unit);

      const validationMessage = validateCostRecognitionTarget({
        recognizing: Boolean(parsedDate.value),
        totalPrice: currentOrder.totalPrice,
        status: currentOrder.status,
      });
      if (validationMessage) {
        throw new CostRecognitionValidationError(validationMessage);
      }

      const oldValue = costRecognitionDateKey(currentOrder.costRecognizedAt);
      const newValue = costRecognitionDateKey(parsedDate.value);
      if (oldValue === newValue) return currentOrder;

      const updatedOrder = await tx.order.update({
        where: { id: currentOrder.id },
        data: { costRecognizedAt: parsedDate.value },
        select: {
          id: true,
          productName: true,
          totalPrice: true,
          status: true,
          unit: true,
          batchNumber: true,
          costRecognizedAt: true,
        },
      });

      await tx.orderAuditLog.create({
        data: {
          orderId: currentOrder.id,
          action: parsedDate.value ? 'custo_reconhecido' : 'reconhecimento_custo_removido',
          field: 'costRecognizedAt',
          oldValue,
          newValue,
          actorId: guard.userId,
          actorName: guard.userName || 'Usuário',
          productName: currentOrder.productName,
          batchNumber: currentOrder.batchNumber,
          unit: currentOrder.unit,
        },
      });

      return updatedOrder;
    });

    if (!order) {
      return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      order: {
        id: order.id,
        productName: order.productName,
        totalPrice: order.totalPrice,
        status: order.status,
        unit: order.unit,
        costRecognizedAt: order.costRecognizedAt,
      },
    });
  } catch (error) {
    if (error instanceof UnitAccessDeniedError) return unitAccessDeniedResponse(error);
    if (error instanceof CostRecognitionValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('PATCH order cost recognition error:', error);
    return NextResponse.json({ error: 'Erro ao lançar pedido em custos' }, { status: 500 });
  }
}

class CostRecognitionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CostRecognitionValidationError';
  }
}
