import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/* GET — Retrieve the latest backup */
export async function GET() {
  try {
    const backup = await prisma.financialBackup.findFirst({
      orderBy: { updatedAt: 'desc' },
    });
    if (!backup) {
      return NextResponse.json({ exists: false });
    }
    return NextResponse.json({
      exists: true,
      id: backup.id,
      logs: JSON.parse(backup.logs),
      goals: JSON.parse(backup.goals),
      fixed: JSON.parse(backup.fixed),
      bills: JSON.parse(backup.bills),
      isAuto: backup.isAuto,
      updatedAt: backup.updatedAt.toISOString(),
    });
  } catch (err) {
    console.error('Backup GET error:', err);
    return NextResponse.json({ error: 'Falha ao carregar backup' }, { status: 500 });
  }
}

/* POST — Save/update backup (auto-sync or manual) */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { logs, goals, fixed, bills, isAuto = true } = body;

    if (!logs || !goals || !fixed || !bills) {
      return NextResponse.json({ error: 'Dados incompletos' }, { status: 400 });
    }

    // Upsert: keep only 1 auto-backup row, always updating it
    const existing = await prisma.financialBackup.findFirst({
      where: { isAuto: true },
      orderBy: { updatedAt: 'desc' },
    });

    let backup;
    if (existing && isAuto) {
      backup = await prisma.financialBackup.update({
        where: { id: existing.id },
        data: {
          logs: JSON.stringify(logs),
          goals: JSON.stringify(goals),
          fixed: JSON.stringify(fixed),
          bills: JSON.stringify(bills),
          updatedAt: new Date(),
        },
      });
    } else {
      backup = await prisma.financialBackup.create({
        data: {
          logs: JSON.stringify(logs),
          goals: JSON.stringify(goals),
          fixed: JSON.stringify(fixed),
          bills: JSON.stringify(bills),
          isAuto,
        },
      });
    }

    return NextResponse.json({
      success: true,
      id: backup.id,
      updatedAt: backup.updatedAt.toISOString(),
    });
  } catch (err) {
    console.error('Backup POST error:', err);
    return NextResponse.json({ error: 'Falha ao salvar backup' }, { status: 500 });
  }
}

/* DELETE — Clear all backups (admin only) */
export async function DELETE() {
  try {
    await prisma.financialBackup.deleteMany();
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Backup DELETE error:', err);
    return NextResponse.json({ error: 'Falha ao limpar backups' }, { status: 500 });
  }
}
