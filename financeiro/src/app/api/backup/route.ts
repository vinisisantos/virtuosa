import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { canAccessAutomaticCosts, canManageAutomaticCosts } from '@/lib/automatic-costs';
import { requireUnitGuard } from '@/lib/unit-guard';

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
    const existing = await prisma.financialBackup.findFirst({
      where: { isAuto: true, unit: unitValue },
      orderBy: { updatedAt: 'desc' },
    });

    let backup;
    if (existing && isAuto) {
      if (typeof expectedUpdatedAt !== 'string') {
        return NextResponse.json({
          error: 'A versão atual do financeiro é obrigatória para sincronizar.',
          code: 'FINANCIAL_BACKUP_VERSION_REQUIRED',
          reloadRequired: true,
        }, { status: 428 });
      }

      const expectedRevision = new Date(expectedUpdatedAt);
      if (Number.isNaN(expectedRevision.getTime())) {
        return NextResponse.json({ error: 'Versão do financeiro inválida.' }, { status: 400 });
      }

      const nextUpdatedAt = new Date();
      const updated = await prisma.financialBackup.updateMany({
        where: { id: existing.id, updatedAt: expectedRevision },
        data: {
          logs: JSON.stringify(logs), goals: JSON.stringify(goals),
          fixed: JSON.stringify(fixed), bills: JSON.stringify(bills),
          updatedAt: nextUpdatedAt,
        },
      });
      if (updated.count !== 1) {
        return NextResponse.json({
          error: 'Os dados financeiros foram atualizados em outro dispositivo.',
          code: 'FINANCIAL_BACKUP_VERSION_CONFLICT',
          reloadRequired: true,
        }, { status: 409 });
      }
      backup = { id: existing.id, updatedAt: nextUpdatedAt };
    } else {
      backup = await prisma.financialBackup.create({
        data: {
          logs: JSON.stringify(logs), goals: JSON.stringify(goals),
          fixed: JSON.stringify(fixed), bills: JSON.stringify(bills),
          isAuto, unit: unitValue,
        },
      });
    }

    return NextResponse.json({ success: true, id: backup.id, updatedAt: backup.updatedAt.toISOString() });
  } catch (err) {
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
