import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');
  const entity = searchParams.get('entity');
  const limit = parseInt(searchParams.get('limit') || '100');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};
  if (action) where.action = action;
  if (entity) where.entity = entity;

  try {
    const entries = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return NextResponse.json({ entries });
  } catch {
    // If table doesn't exist yet, return empty
    return NextResponse.json({ entries: [] });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const entry = await prisma.auditLog.create({
      data: {
        userName: body.userName || 'Sistema',
        action: body.action, // create, update, delete, login, status
        entity: body.entity, // agendamento, client, stock, user
        entityId: body.entityId || '',
        details: body.details || '',
      },
    });
    return NextResponse.json(entry);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
