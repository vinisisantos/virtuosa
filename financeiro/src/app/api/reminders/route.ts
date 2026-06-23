import { NextRequest, NextResponse } from 'next/server';
import { requireUnitGuard } from '@/lib/unit-guard';

import { prisma } from "@/lib/db";

// GET: Find upcoming appointments (next 24h) and return reminder data
// POST: Send reminders (create notifications + return WhatsApp links)
export async function GET(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  try {
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const upcoming = await prisma.agendamento.findMany({
      where: {
        startTime: { gte: now, lte: tomorrow },
        status: { in: ['pendente', 'confirmado'] },
      },
      include: { profissional: true },
      orderBy: { startTime: 'asc' },
    });

    const reminders = upcoming.map(a => {
      const start = new Date(a.startTime);
      const hoursUntil = Math.round((start.getTime() - now.getTime()) / (1000 * 60 * 60));
      const phone = a.clientPhone?.replace(/\D/g, '') || '';
      const phoneNum = phone.startsWith('55') ? phone : `55${phone}`;
      const time = start.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      const date = start.toLocaleDateString('pt-BR');
      const msg = encodeURIComponent(
        `Olá ${a.clientName.split(' ')[0]}! 😊\n\n` +
        `Lembramos que você tem um agendamento amanhã:\n\n` +
        `📋 ${a.procedimento}\n` +
        `📅 ${date} às ${time}\n` +
        `👩‍⚕️ ${a.profissional.name}\n` +
        `📍 ${a.unit}\n\n` +
        `Confirme sua presença respondendo esta mensagem. ✨\n` +
        `Virtuosa Estética 💖`
      );
      return {
        id: a.id,
        clientName: a.clientName,
        clientPhone: a.clientPhone,
        procedimento: a.procedimento,
        profissional: a.profissional.name,
        startTime: a.startTime,
        unit: a.unit,
        status: a.status,
        hoursUntil,
        whatsappLink: phone ? `https://wa.me/${phoneNum}?text=${msg}` : null,
      };
    });

    return NextResponse.json({ reminders, total: reminders.length });
  } catch (error: any) {
    return NextResponse.json({ reminders: [], error: error.message });
  }
}

export async function POST(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  try {
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const upcoming = await prisma.agendamento.findMany({
      where: {
        startTime: { gte: now, lte: tomorrow },
        status: { in: ['pendente', 'confirmado'] },
      },
      include: { profissional: true },
    });

    // Create notifications for each
    let created = 0;
    for (const a of upcoming) {
      const start = new Date(a.startTime);
      const time = start.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      await prisma.notification.create({
        data: {
          userId: 'system',
          type: 'reminder',
          title: `Lembrete: ${a.clientName}`,
          message: `${a.procedimento} às ${time} com ${a.profissional.name}`,
          link: '/agenda',
        },
      });
      created++;
    }

    return NextResponse.json({ success: true, sent: created });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message });
  }
}
