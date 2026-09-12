import type { Prisma } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import {
  PayrollWriteConflictError,
  matchesExpectedUpdatedAt,
  nextPayrollUpdatedAt,
  parseOptionalExpectedUpdatedAt,
  payrollWriteConflictPayload,
  touchPayrollImportRevisions,
} from '@/lib/payroll-sync';
import {
  requireUnitGuard,
  UnitAccessDeniedError,
  unitAccessDeniedResponse,
  type UnitGuardResult,
} from '@/lib/unit-guard';

export type PayrollEntryBooleanField =
  | 'hasFgts'
  | 'hasAdiantamento'
  | 'isRecurring'
  | 'hasPenalty';

interface PayrollFlagMutationOptions {
  field: PayrollEntryBooleanField;
  missingFieldsMessage: string;
  failureMessage: string;
}

export function canManagePayroll(user: Pick<UnitGuardResult, 'isAdmin' | 'permissions'>) {
  return user.isAdmin
    || user.permissions?.admin === true
    || user.permissions?.financeiro === true;
}

function writeConflictResponse() {
  return NextResponse.json(payrollWriteConflictPayload(), { status: 409 });
}

function preconditionRequiredResponse() {
  return NextResponse.json({
    error: 'A versão atual da folha é obrigatória. Recarregue os dados antes de salvar.',
    code: 'PAYROLL_VERSION_REQUIRED',
    reloadRequired: true,
  }, { status: 428 });
}

export async function mutatePayrollEntryBooleanFlag(
  request: NextRequest,
  options: PayrollFlagMutationOptions,
) {
  const guard = requireUnitGuard(request);
  if (guard instanceof NextResponse) return guard;
  if (!canManagePayroll(guard)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  try {
    const body = await request.json() as Record<string, unknown>;
    const id = typeof body.id === 'string' ? body.id.trim() : '';
    const value = body[options.field];
    if (!id || typeof value !== 'boolean') {
      return NextResponse.json({ error: options.missingFieldsMessage }, { status: 400 });
    }

    const expectedUpdatedAt = parseOptionalExpectedUpdatedAt(body.expectedUpdatedAt);
    if (expectedUpdatedAt === null) {
      return NextResponse.json({ error: 'Versão da folha inválida' }, { status: 400 });
    }
    // Estas rotas não possuem callers ativos. Exigir a versão evita que um
    // cliente legado reenvie um toggle calculado sobre uma fotografia antiga.
    if (expectedUpdatedAt === undefined) return preconditionRequiredResponse();

    const result = await prisma.$transaction(async transaction => {
      await transaction.$queryRaw`
        SELECT "id" FROM "PayrollEntry" WHERE "id" = ${id} FOR UPDATE
      `;
      const current = await transaction.payrollEntry.findUnique({
        where: { id },
        include: { payrollImport: { select: { unit: true } } },
      });
      if (!current) return null;

      guard.enforceUnit(current.payrollImport.unit);
      if (!matchesExpectedUpdatedAt(current.updatedAt, expectedUpdatedAt)) {
        throw new PayrollWriteConflictError();
      }

      if (current[options.field] === value) {
        const unchangedEntry = { ...current };
        Reflect.deleteProperty(unchangedEntry, 'payrollImport');
        return unchangedEntry;
      }

      const mutationTime = nextPayrollUpdatedAt(current.updatedAt);
      const data = {
        [options.field]: value,
        updatedAt: mutationTime,
      } as Prisma.PayrollEntryUpdateManyMutationInput;
      const updated = await transaction.payrollEntry.updateMany({
        where: {
          id,
          updatedAt: expectedUpdatedAt,
          payrollImport: { unit: current.payrollImport.unit },
        },
        data,
      });
      if (updated.count !== 1) throw new PayrollWriteConflictError();

      await touchPayrollImportRevisions(transaction, [current.payrollImportId]);
      const entry = { ...current };
      Reflect.deleteProperty(entry, 'payrollImport');
      return { ...entry, [options.field]: value, updatedAt: mutationTime };
    });

    if (!result) {
      return NextResponse.json({ error: 'Lançamento da folha não encontrado' }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof PayrollWriteConflictError) return writeConflictResponse();
    if (error instanceof UnitAccessDeniedError) return unitAccessDeniedResponse(error);
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Corpo da requisição inválido' }, { status: 400 });
    }
    console.error(options.failureMessage, error);
    return NextResponse.json({ error: options.failureMessage }, { status: 500 });
  }
}
