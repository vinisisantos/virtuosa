import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    const survey = await prisma.satisfactionSurvey.findUnique({
      where: { token },
    });

    if (!survey) {
      return NextResponse.json(
        { error: 'Avaliação não encontrada.' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      clientName: survey.clientName,
      profissional: survey.profissional,
      status: survey.status,
    });
  } catch (error) {
    console.error('[API Survey Token] GET Error:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor.' },
      { status: 500 }
    );
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const body = await req.json();
    const { score, comment } = body;

    if (typeof score !== 'number' || score < 1 || score > 5) {
      return NextResponse.json(
        { error: 'A nota deve ser um número entre 1 e 5.' },
        { status: 400 }
      );
    }

    const survey = await prisma.satisfactionSurvey.findUnique({
      where: { token },
    });

    if (!survey) {
      return NextResponse.json(
        { error: 'Avaliação não encontrada.' },
        { status: 404 }
      );
    }

    if (survey.status !== 'sent') {
      return NextResponse.json(
        { error: 'Esta avaliação já foi respondida.' },
        { status: 400 }
      );
    }

    const updatedSurvey = await prisma.satisfactionSurvey.update({
      where: { token },
      data: {
        score,
        feedback: comment || null,
        status: 'answered',
        answeredAt: new Date(),
      },
    });

    return NextResponse.json({ success: true, survey: updatedSurvey });
  } catch (error) {
    console.error('[API Survey Token] POST Error:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor.' },
      { status: 500 }
    );
  }
}
