import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const unit = searchParams.get('unit');

    const complaints = await prisma.complaint.findMany({
      where: unit && unit !== 'Todas' ? { unit } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        history: {
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    return NextResponse.json(complaints);
  } catch (error) {
    console.error('Error fetching complaints:', error);
    return NextResponse.json({ error: 'Failed to fetch complaints' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { clientName, unit, category, severity, description, clientDesire, createdBy, createdByName } = body;

    const complaint = await prisma.complaint.create({
      data: {
        clientName,
        unit,
        category,
        severity,
        description,
        clientDesire,
        createdBy,
        createdByName,
        history: {
          create: {
            action: 'created',
            notes: 'Reclamação registrada no sistema.',
            actorId: createdBy,
            actorName: createdByName || 'Sistema'
          }
        }
      },
      include: {
        history: true
      }
    });

    return NextResponse.json(complaint);
  } catch (error) {
    console.error('Error creating complaint:', error);
    return NextResponse.json({ error: 'Failed to create complaint' }, { status: 500 });
  }
}
