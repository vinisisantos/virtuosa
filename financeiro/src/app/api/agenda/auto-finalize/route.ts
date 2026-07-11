import { NextRequest, NextResponse } from 'next/server';
import { requireUnitGuard } from '@/lib/unit-guard';
import { prisma } from "@/lib/db";
import { incrementPackageSession, withSerializableRetry } from '@/lib/agenda/finalization';

const ELIGIBLE_STATUSES = ['pendente', 'confirmado', 'em_atendimento'];

/**
 * POST /api/agenda/auto-finalize
 * Finds all non-evaluation appointments whose endTime has passed
 * and marks them as 'finalizado', incrementing package sessions.
 */
export async function POST(req: NextRequest) {
  const requestedUnit = new URL(req.url).searchParams.get('unit');
  const guard = requireUnitGuard(req, { requestedUnit });
  if (guard instanceof NextResponse) return guard;
  if (!guard.isAdmin && guard.permissions?.agenda !== true) {
    return NextResponse.json({ error: 'Sem permissão para acessar a agenda.' }, { status: 403 });
  }

  try {
    const now = new Date();

    // Avaliações dependem de desfecho manual no CRM; o relógio não pode marcar comparecimento.
    const expiredAppointments = await prisma.agendamento.findMany({
      where: {
        ...(guard.unitFilter ? { unit: guard.unitFilter } : {}),
        endTime: { lt: now },
        status: { in: ELIGIBLE_STATUSES },
        NOT: {
          procedimento: { contains: 'Avalia', mode: 'insensitive' },
        },
      },
      select: {
        id: true,
        clientName: true,
        procedimento: true,
        unit: true,
      },
    });

    if (expiredAppointments.length === 0) {
      return NextResponse.json({ finalized: 0 });
    }

    let finalized = 0;

    for (const ag of expiredAppointments) {
      try {
        const didFinalize = await withSerializableRetry(async (tx) => {
          const claimed = await tx.agendamento.updateMany({
            where: {
              id: ag.id,
              unit: ag.unit,
              endTime: { lt: now },
              status: { in: ELIGIBLE_STATUSES },
              NOT: {
                procedimento: { contains: 'Avalia', mode: 'insensitive' },
              },
            },
            data: { status: 'finalizado' },
          });

          if (claimed.count !== 1) return false;
          await incrementPackageSession(tx, ag);
          return true;
        });

        if (didFinalize) finalized += 1;
      } catch (error) {
        console.error(`Auto-finalize error for appointment ${ag.id}:`, error);
      }
    }

    return NextResponse.json({ finalized });
  } catch (err) {
    console.error('Auto-finalize error:', err);
    return NextResponse.json({ error: 'Auto-finalize failed' }, { status: 500 });
  }
}
