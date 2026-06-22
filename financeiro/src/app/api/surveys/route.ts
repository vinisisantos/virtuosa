import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const unit = searchParams.get('unit');
    const from = searchParams.get('from'); // ISO string

    const where: any = {};
    if (unit && unit !== 'Todas') {
      where.unit = unit;
    }
    if (from) {
      where.createdAt = { gte: new Date(from) };
    }

    const surveys = await prisma.satisfactionSurvey.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    const totalSurveys = surveys.length;
    const answeredSurveys = surveys.filter((s) => s.status === 'answered' && s.score > 0);
    const totalSent = surveys.filter((s) => s.status === 'sent' || s.status === 'answered').length;
    const totalAnswered = answeredSurveys.length;

    const responseRate = totalSent > 0 ? ((totalAnswered / totalSent) * 100).toFixed(1) : '0.0';
    
    let avgRating = 0;
    if (totalAnswered > 0) {
      const sum = answeredSurveys.reduce((acc, curr) => acc + curr.score, 0);
      avgRating = sum / totalAnswered;
    }

    const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    answeredSurveys.forEach((s) => {
      // Assuming score is 1-5. If score > 5, cap it or adjust logic (NPS 0-10 to 1-5).
      const score = Math.min(Math.max(s.score, 1), 5);
      distribution[score] = (distribution[score] || 0) + 1;
    });

    const stats = {
      totalSurveys,
      totalSent,
      totalAnswered,
      responseRate,
      avgRating: avgRating.toFixed(1),
      distribution,
    };

    // By Profissional
    const byProf: Record<string, { total: number; sum: number; avg: number }> = {};
    const byProc: Record<string, { total: number; sum: number; avg: number }> = {};

    answeredSurveys.forEach((s) => {
      if (s.profissional) {
        if (!byProf[s.profissional]) byProf[s.profissional] = { total: 0, sum: 0, avg: 0 };
        byProf[s.profissional].total += 1;
        byProf[s.profissional].sum += s.score;
        byProf[s.profissional].avg = byProf[s.profissional].sum / byProf[s.profissional].total;
      }
      if (s.procedimento) {
        if (!byProc[s.procedimento]) byProc[s.procedimento] = { total: 0, sum: 0, avg: 0 };
        byProc[s.procedimento].total += 1;
        byProc[s.procedimento].sum += s.score;
        byProc[s.procedimento].avg = byProc[s.procedimento].sum / byProc[s.procedimento].total;
      }
    });

    // Formatting for UI
    const recent = surveys.slice(0, 50).map((s) => ({
      id: s.id,
      clientName: s.clientName,
      procedimento: s.procedimento || 'Atendimento Geral',
      profissional: s.profissional || 'Equipe',
      rating: s.score > 0 ? s.score : null,
      comment: s.feedback || null,
      status: s.status,
      unit: s.unit,
      sentAt: s.sentAt ? s.sentAt.toISOString() : null,
      answeredAt: s.answeredAt ? s.answeredAt.toISOString() : null,
      createdAt: s.createdAt.toISOString(),
    }));

    return NextResponse.json({
      stats,
      recent,
      byProfissional: byProf,
      byProcedimento: byProc,
    });
  } catch (error) {
    console.error('[API Surveys] GET Error:', error);
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
  }
}
