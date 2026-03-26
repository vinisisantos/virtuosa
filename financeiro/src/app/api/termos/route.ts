import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const unit = searchParams.get('unit');

    const history = await prisma.termoHistory.findMany({
      where: unit ? { unit } : undefined,
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(history);
  } catch (error) {
    console.error('Failed to fetch termos history:', error);
    return NextResponse.json(
      { error: 'Failed to fetch history' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { templateName, clientName, unit, docType, html } = body;

    if (!templateName || !unit) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const record = await prisma.termoHistory.create({
      data: {
        templateName,
        clientName: clientName || 'Cliente',
        unit,
        docType: docType || 'Termo',
        html: html || '',
      },
    });

    return NextResponse.json(record, { status: 201 });
  } catch (error) {
    console.error('Failed to save termo history:', error);
    return NextResponse.json(
      { error: 'Failed to save record' },
      { status: 500 }
    );
  }
}
