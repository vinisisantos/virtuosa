import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUnitGuard } from '@/lib/unit-guard';

/* GET — Retrieve the latest backup for user's unit */
export async function GET(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  try {
    // UNIT GUARD: Filter backup by unit
    const backup = await prisma.financialBackup.findFirst({
      where: guard.unitFilter ? { unit: guard.unitFilter } : undefined,
      orderBy: { updatedAt: 'desc' },
    });
    if (!backup) return NextResponse.json({ exists: false });

    return NextResponse.json({
      exists: true, id: backup.id,
      logs: JSON.parse(backup.logs), goals: JSON.parse(backup.goals),
      fixed: JSON.parse(backup.fixed), bills: JSON.parse(backup.bills),
      isAuto: backup.isAuto, updatedAt: backup.updatedAt.toISOString(),
    });
  } catch (err) {
    console.error('Backup GET error:', err);
    return NextResponse.json({ error: 'Falha ao carregar backup' }, { status: 500 });
  }
}

/* POST — Save/update backup (auto-sync or manual) */
export async function POST(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  try {
    const body = await req.json();
    const { logs, goals, fixed, bills, isAuto = true } = body;
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
      backup = await prisma.financialBackup.update({
        where: { id: existing.id },
        data: {
          logs: JSON.stringify(logs), goals: JSON.stringify(goals),
          fixed: JSON.stringify(fixed), bills: JSON.stringify(bills),
          updatedAt: new Date(),
        },
      });
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
    await prisma.financialBackup.deleteMany({
      where: guard.unitFilter ? { unit: guard.unitFilter } : undefined,
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Backup DELETE error:', err);
    return NextResponse.json({ error: 'Falha ao limpar backups' }, { status: 500 });
  }
}
