import { NextRequest, NextResponse } from 'next/server';
import { requireUnitGuard } from '@/lib/unit-guard';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * POST /api/agenda/auto-finalize
 * Finds all non-finalized appointments whose endTime has passed
 * and marks them as 'finalizado', incrementing package sessions.
 */
export async function POST(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  try {
    const now = new Date();

    // Find all past-due appointments that are NOT finalized/falta/cancelado
    const expiredAppointments = await prisma.agendamento.findMany({
      where: {
        endTime: { lt: now },
        status: { in: ['pendente', 'confirmado', 'em_atendimento'] },
      },
    });

    if (expiredAppointments.length === 0) {
      return NextResponse.json({ finalized: 0 });
    }

    let finalized = 0;

    for (const ag of expiredAppointments) {
      // Update status to finalizado
      await prisma.agendamento.update({
        where: { id: ag.id },
        data: { status: 'finalizado' },
      });

      // Increment completedSessions on matching active package
      try {
        const packages = await prisma.package.findMany({
          where: {
            clientName: ag.clientName,
            status: 'ativo',
          },
        });

        for (const pkg of packages) {
          try {
            const services = JSON.parse(pkg.services) as { name: string; quantity: number }[];
            const hasProc = services.some(
              s => s.name.toLowerCase() === ag.procedimento.toLowerCase()
            );
            if (hasProc && pkg.completedSessions < pkg.totalSessions) {
              const newCompleted = pkg.completedSessions + 1;
              await prisma.package.update({
                where: { id: pkg.id },
                data: {
                  completedSessions: newCompleted,
                  status: newCompleted >= pkg.totalSessions ? 'concluido' : 'ativo',
                },
              });
              break;
            }
          } catch { /* JSON parse error - skip */ }
        }
      } catch (err) {
        console.error('Error updating package for auto-finalize:', err);
      }

      // Schedule satisfaction survey (30 min delay)
      if (ag.clientPhone) {
        try {
          const digits = ag.clientPhone.replace(/\D/g, '');
          const jid = digits.startsWith('55') ? `${digits}@s.whatsapp.net` : `55${digits}@s.whatsapp.net`;

          const existing = await (prisma as any).surveyResponse.findUnique({
            where: { agendamentoId: ag.id },
          });

          if (!existing) {
            const scheduledFor = new Date(Date.now() + 30 * 60 * 1000);
            await (prisma as any).surveyResponse.create({
              data: {
                agendamentoId: ag.id,
                clientName: ag.clientName,
                clientPhone: ag.clientPhone,
                remoteJid: jid,
                unit: ag.unit,
                procedimento: ag.procedimento,
                scheduledFor,
              },
            });
          }
        } catch (surveyErr) {
          console.error('Error scheduling survey (non-blocking):', surveyErr);
        }
      }

      finalized++;
    }

    return NextResponse.json({ finalized });
  } catch (err) {
    console.error('Auto-finalize error:', err);
    return NextResponse.json({ error: 'Auto-finalize failed' }, { status: 500 });
  }
}
