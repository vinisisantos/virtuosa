import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { canAccessAutomaticCosts, canManageAutomaticCosts } from '@/lib/automatic-costs';
import { requireUnitGuard } from '@/lib/unit-guard';
import { nextPayrollUpdatedAt } from '@/lib/payroll-sync';
import {
  changedManualVacationPaymentPeriods,
  refreshManualVacationPayrollRevisions,
  VacationPayrollAlreadyPaidError,
} from '@/lib/payroll-vacation-server';

class BackupWriteError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/* GET — Retrieve the latest backup for user's unit */
export async function GET(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;
  if (!canAccessAutomaticCosts(guard)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  try {
    // O snapshot contém o conjunto financeiro usado pelo perfil. Ler e gravar
    // sempre a mesma unidade canônica evita que administradores com unidade
    // "Todas" alternem acidentalmente entre backups de filiais diferentes.
    const backupUnit = guard.createUnit();
    const backup = await prisma.financialBackup.findFirst({
      where: { unit: backupUnit },
      orderBy: { updatedAt: 'desc' },
    });
    if (!backup) {
      return NextResponse.json(
        { exists: false },
        { headers: { 'Cache-Control': 'private, no-store, max-age=0' } },
      );
    }

    return NextResponse.json({
      exists: true, id: backup.id,
      logs: JSON.parse(backup.logs), goals: JSON.parse(backup.goals),
      fixed: JSON.parse(backup.fixed), bills: JSON.parse(backup.bills),
      isAuto: backup.isAuto, updatedAt: backup.updatedAt.toISOString(),
    }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
  } catch (err) {
    console.error('Backup GET error:', err);
    return NextResponse.json({ error: 'Falha ao carregar backup' }, { status: 500 });
  }
}

/* POST — Save/update backup (auto-sync or manual) */
export async function POST(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;
  if (!canManageAutomaticCosts(guard)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { logs, goals, fixed, bills, isAuto = true, expectedUpdatedAt } = body;
    if (!logs || !goals || !fixed || !bills) {
      return NextResponse.json({ error: 'Dados incompletos' }, { status: 400 });
    }

    const unitValue = guard.createUnit();

    // UNIT GUARD: Upsert per unit — each unit gets its own backup
    const backup = await prisma.$transaction(async transaction => {
      const existing = await transaction.financialBackup.findFirst({
        where: { isAuto: true, unit: unitValue },
        orderBy: { updatedAt: 'desc' },
        select: { id: true, bills: true, updatedAt: true },
      });

      if (existing && isAuto) {
        if (typeof expectedUpdatedAt !== 'string') {
          throw new BackupWriteError(
            'A versão atual do financeiro é obrigatória para sincronizar.',
            428,
            'FINANCIAL_BACKUP_VERSION_REQUIRED',
          );
        }

        const expectedRevision = new Date(expectedUpdatedAt);
        if (Number.isNaN(expectedRevision.getTime())) {
          throw new BackupWriteError('Versão do financeiro inválida.', 400);
        }

        const nextUpdatedAt = nextPayrollUpdatedAt(existing.updatedAt);
        const billsJson = JSON.stringify(bills);
        const linkedManualPeriods = existing.bills === billsJson ? [] : await transaction.payrollVacation.findMany({
          where: {
            unit: unitValue,
            advanceCostMode: 'manual',
            linkedBackupId: existing.id,
          },
          select: {
            id: true, unit: true, employeeKey: true, employeeName: true,
            startDate: true, endDate: true, advanceCostMode: true,
            advanceAmount: true, advancePaidAt: true, linkedBackupId: true, linkedBillId: true,
          },
        });
        const changedPeriods = changedManualVacationPaymentPeriods(linkedManualPeriods, existing.bills, bills);
        if (changedPeriods.length > 0) {
          await refreshManualVacationPayrollRevisions(transaction, changedPeriods);
        }

        const updated = await transaction.financialBackup.updateMany({
          where: { id: existing.id, updatedAt: expectedRevision },
          data: {
            logs: JSON.stringify(logs), goals: JSON.stringify(goals),
            fixed: JSON.stringify(fixed), bills: billsJson, updatedAt: nextUpdatedAt,
          },
        });
        if (updated.count !== 1) {
          throw new BackupWriteError(
            'Os dados financeiros foram atualizados em outro dispositivo.',
            409,
            'FINANCIAL_BACKUP_VERSION_CONFLICT',
          );
        }
        return { id: existing.id, updatedAt: nextUpdatedAt };
      }

      return transaction.financialBackup.create({
        data: {
          logs: JSON.stringify(logs), goals: JSON.stringify(goals),
          fixed: JSON.stringify(fixed), bills: JSON.stringify(bills),
          isAuto, unit: unitValue,
        },
      });
    });

    return NextResponse.json({ success: true, id: backup.id, updatedAt: backup.updatedAt.toISOString() });
  } catch (err) {
    if (err instanceof BackupWriteError) {
      return NextResponse.json({
        error: err.message,
        ...(err.code ? { code: err.code } : {}),
        ...(err.status === 409 ? { reloadRequired: true } : {}),
      }, { status: err.status });
    }
    if (err instanceof VacationPayrollAlreadyPaidError) {
      return NextResponse.json({
        error: err.message,
        code: 'VACATION_PAYROLL_ALREADY_PAID',
      }, { status: 409 });
    }
    console.error('Backup POST error:', err);
    return NextResponse.json({ error: 'Falha ao salvar backup' }, { status: 500 });
  }
}

/* DELETE — Clear backups (admin only, per unit) */
export async function DELETE(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  if (!guard.isAdmin) return NextResponse.json({ error: 'Apenas administradores' }, { status: 403 });

  try {
    const backupUnit = guard.createUnit();
    await prisma.financialBackup.deleteMany({
      where: { unit: backupUnit },
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Backup DELETE error:', err);
    return NextResponse.json({ error: 'Falha ao limpar backups' }, { status: 500 });
  }
}
