import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/**
 * GET /api/surveys — Dashboard data for satisfaction surveys
 * Query params: unit, from, to, profissional
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const unit = searchParams.get('unit');
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const profissional = searchParams.get('profissional');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};
  if (unit) where.unit = unit;
  if (profissional) where.profissional = { contains: profissional };
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(from);
    if (to) where.createdAt.lte = new Date(to);
  }

  try {
    // All surveys with filters
    const surveys = await (prisma as any).surveyResponse.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    // Aggregation stats
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const answered = surveys.filter((s: any) => s.status === 'answered' && s.rating);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const totalSent = surveys.filter((s: any) => s.status !== 'scheduled').length;
    const avgRating = answered.length > 0
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? answered.reduce((sum: number, s: any) => sum + (s.rating || 0), 0) / answered.length
      : 0;

    // Distribution by rating
    const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const s of answered) {
      if (s.rating && s.rating >= 1 && s.rating <= 5) {
        distribution[s.rating]++;
      }
    }

    // By professional
    const byProfissional: Record<string, { total: number; sum: number; avg: number }> = {};
    for (const s of answered) {
      const name = s.profissional || 'Outros';
      if (!byProfissional[name]) byProfissional[name] = { total: 0, sum: 0, avg: 0 };
      byProfissional[name].total++;
      byProfissional[name].sum += s.rating || 0;
    }
    for (const key of Object.keys(byProfissional)) {
      byProfissional[key].avg = byProfissional[key].sum / byProfissional[key].total;
    }

    // By procedure
    const byProcedimento: Record<string, { total: number; sum: number; avg: number }> = {};
    for (const s of answered) {
      const proc = s.procedimento || 'Outros';
      if (!byProcedimento[proc]) byProcedimento[proc] = { total: 0, sum: 0, avg: 0 };
      byProcedimento[proc].total++;
      byProcedimento[proc].sum += s.rating || 0;
    }
    for (const key of Object.keys(byProcedimento)) {
      byProcedimento[key].avg = byProcedimento[key].sum / byProcedimento[key].total;
    }

    // Recent surveys with details
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recent = surveys.slice(0, 50).map((s: any) => ({
      id: s.id,
      clientName: s.clientName,
      procedimento: s.procedimento,
      profissional: s.profissional,
      rating: s.rating,
      comment: s.comment,
      status: s.status,
      unit: s.unit,
      sentAt: s.sentAt,
      answeredAt: s.answeredAt,
      createdAt: s.createdAt,
    }));

    return NextResponse.json({
      stats: {
        totalSurveys: surveys.length,
        totalSent,
        totalAnswered: answered.length,
        responseRate: totalSent > 0 ? ((answered.length / totalSent) * 100).toFixed(1) : '0',
        avgRating: avgRating.toFixed(1),
        distribution,
      },
      byProfissional,
      byProcedimento,
      recent,
    });
  } catch (error) {
    console.error('[Surveys API] Error:', error);
    return NextResponse.json({ error: 'Erro ao buscar avaliações' }, { status: 500 });
  }
}
