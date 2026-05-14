import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUnitGuard, UnitAccessDeniedError, unitAccessDeniedResponse } from '@/lib/unit-guard';

export async function GET(req: NextRequest) {
  const guard = requireUnitGuard(req, { requestedUnit: new URL(req.url).searchParams.get('unit') });
  if (guard instanceof NextResponse) return guard;

  const { searchParams } = new URL(req.url);
  const start = searchParams.get('start');
  const end = searchParams.get('end');
  const profissionalId = searchParams.get('profissionalId');
  const status = searchParams.get('status');
  const procedimento = searchParams.get('procedimento');
  const search = searchParams.get('search');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};
  // UNIT GUARD: Always filter by user's unit (admin can override)
  if (guard.unitFilter) where.unit = guard.unitFilter;
  if (profissionalId) where.profissionalId = profissionalId;
  if (status) where.status = status;
  if (procedimento) where.procedimento = { contains: procedimento };
  if (search) {
    where.OR = [
      { clientName: { contains: search } },
      { procedimento: { contains: search } },
    ];
  }
  if (start && end) {
    where.startTime = { gte: new Date(start), lte: new Date(end) };
  }

  const agendamentos = await prisma.agendamento.findMany({
    where,
    include: { profissional: true },
    orderBy: { startTime: 'asc' },
  });

  return NextResponse.json(agendamentos);
}

export async function POST(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  try {
    const body = await req.json();

    // Auto-create profissional if selecting a system user (id starts with "user-")
    let profId = body.profissionalId;
    if (typeof profId === 'string' && profId.startsWith('user-')) {
      const userName = profId.replace('user-', '');
      let existing = await prisma.profissional.findFirst({ where: { name: userName } });
      if (!existing) {
        const colors = ['#e600a0', '#6366f1', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899'];
        existing = await prisma.profissional.create({
          data: { name: userName, color: colors[Math.floor(Math.random() * colors.length)], unit: guard.createUnit() },
        });
      }
      profId = existing.id;
    }

    const agendamento = await prisma.agendamento.create({
      data: {
        clientName: body.clientName,
        clientPhone: body.clientPhone || null,
        procedimento: body.procedimento,
        profissionalId: profId,
        unit: guard.createUnit(body.unit), // UNIT GUARD: Force JWT unit
        startTime: new Date(body.startTime),
        endTime: new Date(body.endTime),
        status: body.status || 'pendente',
        sala: body.sala || null,
        sessionNumber: body.sessionNumber || null,
        totalSessions: body.totalSessions || null,
        notes: body.notes || null,
      },
      include: { profissional: true },
    });
    return NextResponse.json(agendamento);
  } catch (err: any) {
    console.error('Agenda POST error:', err);
    return NextResponse.json({ error: err?.message || 'Erro ao criar agendamento' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  try {
    const body = await req.json();

    // UNIT GUARD: Check record belongs to user's unit
    const currentAg = await prisma.agendamento.findUnique({ where: { id: body.id } });
    if (!currentAg) return NextResponse.json({ error: 'Agendamento não encontrado' }, { status: 404 });
    try { guard.enforceUnit(currentAg.unit); } catch (e) {
      if (e instanceof UnitAccessDeniedError) return unitAccessDeniedResponse();
      throw e;
    }

    const data: Record<string, unknown> = {};
    if (body.clientName !== undefined) data.clientName = body.clientName;
    if (body.clientPhone !== undefined) data.clientPhone = body.clientPhone;
    if (body.procedimento !== undefined) data.procedimento = body.procedimento;
    if (body.profissionalId !== undefined) {
      let profId = body.profissionalId;
      if (typeof profId === 'string' && profId.startsWith('user-')) {
        const userName = profId.replace('user-', '');
        let existing = await prisma.profissional.findFirst({ where: { name: userName } });
        if (!existing) {
          const colors = ['#e600a0', '#6366f1', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899'];
          existing = await prisma.profissional.create({
            data: { name: userName, color: colors[Math.floor(Math.random() * colors.length)], unit: guard.createUnit() },
          });
        }
        profId = existing.id;
      }
      data.profissionalId = profId;
    }
    // UNIT GUARD: Don't allow changing unit for non-admins
    if (body.unit !== undefined && guard.isAdmin) data.unit = body.unit;
    if (body.startTime !== undefined) data.startTime = new Date(body.startTime);
    if (body.endTime !== undefined) data.endTime = new Date(body.endTime);
    if (body.status !== undefined) data.status = body.status;
    if (body.sala !== undefined) data.sala = body.sala;
    if (body.sessionNumber !== undefined) data.sessionNumber = body.sessionNumber;
    if (body.totalSessions !== undefined) data.totalSessions = body.totalSessions;
    if (body.notes !== undefined) data.notes = body.notes;

    const updated = await prisma.agendamento.update({
      where: { id: body.id },
      data,
      include: { profissional: true },
    });

    // If status changed to 'finalizado', increment completedSessions on matching package
    if (body.status === 'finalizado' && currentAg && currentAg.status !== 'finalizado') {
      try {
        const packages = await prisma.package.findMany({
          where: { clientName: updated.clientName, status: 'ativo' },
        });
        for (const pkg of packages) {
          try {
            const services = JSON.parse(pkg.services) as { name: string; quantity: number }[];
            const hasProc = services.some(s => s.name.toLowerCase() === updated.procedimento.toLowerCase());
            if (hasProc && pkg.completedSessions < pkg.totalSessions) {
              const newCompleted = pkg.completedSessions + 1;
              await prisma.package.update({
                where: { id: pkg.id },
                data: { completedSessions: newCompleted, status: newCompleted >= pkg.totalSessions ? 'concluido' : 'ativo' },
              });
              break;
            }
          } catch { /* JSON parse error — skip */ }
        }
    }

    return NextResponse.json(updated);
  } catch (err: any) {
    console.error('Agenda PUT error:', err);
    return NextResponse.json({ error: err?.message || 'Erro ao atualizar agendamento' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

  try {
    const agendamento = await prisma.agendamento.findUnique({ where: { id }, include: { profissional: true } });
    if (!agendamento) return NextResponse.json({ error: 'Agendamento não encontrado' }, { status: 404 });

    // UNIT GUARD: Check record belongs to user's unit
    try { guard.enforceUnit(agendamento.unit); } catch (e) {
      if (e instanceof UnitAccessDeniedError) return unitAccessDeniedResponse();
      throw e;
    }

    // If agendamento is finalized, check permissions
    if (agendamento.status === 'finalizado') {
      const canExcluirFinalizado = guard.isAdmin || !!(guard.permissions?.excluirFinalizado);
      if (!canExcluirFinalizado) {
        return NextResponse.json(
          { error: 'Este agendamento já possui sessão concluída e só pode ser excluído por um administrador ou usuário com permissão específica.' },
          { status: 403 }
        );
      }

      try {
        await prisma.auditLog.create({
          data: {
            userName: guard.userName, action: 'delete', entity: 'agendamento', entityId: id,
            unit: guard.userUnit,
            details: JSON.stringify({
              type: 'exclusão_sessão_finalizada', clientName: agendamento.clientName,
              procedimento: agendamento.procedimento, profissional: agendamento.profissional?.name,
              startTime: agendamento.startTime, endTime: agendamento.endTime, unit: agendamento.unit,
              deletedBy: guard.userName, deletedByRole: guard.userRole, deletedById: guard.userId,
              deletedAt: new Date().toISOString(),
            }),
          },
        });
      } catch (auditErr) { console.error('Audit log error (non-blocking):', auditErr); }
    }

    await prisma.agendamento.delete({ where: { id } });
    return NextResponse.json({ ok: true, deleted: agendamento });
  } catch (err: any) {
    console.error('Agenda DELETE error:', err);
    return NextResponse.json({ error: err?.message || 'Erro ao excluir agendamento' }, { status: 500 });
  }
}
