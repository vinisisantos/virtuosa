import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const unit = searchParams.get('unit');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};
  if (unit) where.unit = unit;

  const surveys = await prisma.satisfactionSurvey.findMany({ where, orderBy: { createdAt: 'desc' }, take: 200 });

  // NPS calculation
  const promoters = surveys.filter(s => s.score >= 9).length;
  const detractors = surveys.filter(s => s.score <= 6).length;
  const total = surveys.length;
  const nps = total > 0 ? Math.round(((promoters - detractors) / total) * 100) : 0;

  // Averages by procedure
  const procMap: Record<string, { scores: number[]; feedbacks: string[] }> = {};
  surveys.forEach(s => {
    const key = s.procedimento || 'Geral';
    if (!procMap[key]) procMap[key] = { scores: [], feedbacks: [] };
    procMap[key].scores.push(s.score);
    if (s.feedback) procMap[key].feedbacks.push(s.feedback);
  });
  const byProcedure = Object.entries(procMap).map(([name, d]) => ({
    name,
    avg: +(d.scores.reduce((a, b) => a + b, 0) / d.scores.length).toFixed(1),
    count: d.scores.length,
    recentFeedback: d.feedbacks.slice(0, 3),
  })).sort((a, b) => b.count - a.count);

  // Distribution
  const distribution = Array.from({ length: 11 }, (_, i) => ({
    score: i,
    count: surveys.filter(s => s.score === i).length,
  }));

  return NextResponse.json({
    surveys: surveys.slice(0, 50),
    stats: { nps, total, promoters, detractors, passives: total - promoters - detractors },
    byProcedure,
    distribution,
  });
}

export async function POST(req: Request) {
  const body = await req.json();
  const survey = await prisma.satisfactionSurvey.create({
    data: {
      clientName: body.clientName,
      clientPhone: body.clientPhone || null,
      score: body.score,
      feedback: body.feedback || null,
      procedimento: body.procedimento || null,
      profissional: body.profissional || null,
      unit: body.unit || 'Barueri',
    },
  });
  return NextResponse.json(survey);
}
