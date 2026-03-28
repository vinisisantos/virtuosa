import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/* GET — List activity logs (with pagination and filters) */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const entityType = url.searchParams.get('entityType');
    const action = url.searchParams.get('action');
    const userId = url.searchParams.get('userId');
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');

    const where: any = {};
    if (entityType) where.entityType = entityType;
    if (action) where.action = action;
    if (userId) where.userId = userId;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to + 'T23:59:59Z');
    }

    const [logs, total] = await Promise.all([
      prisma.activityLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.activityLog.count({ where }),
    ]);

    return NextResponse.json({ logs, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('ActivityLog GET error:', err);
    return NextResponse.json({ error: 'Falha ao carregar logs' }, { status: 500 });
  }
}

/* POST — Create a new activity log entry */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, userName, action, entityType, entityId, description, metadata, unit } = body;

    if (!userName || !action || !entityType || !description) {
      return NextResponse.json({ error: 'Dados obrigatórios ausentes' }, { status: 400 });
    }

    const log = await prisma.activityLog.create({
      data: {
        userId, userName, action, entityType, entityId,
        description,
        metadata: metadata ? JSON.stringify(metadata) : null,
        unit,
      },
    });

    return NextResponse.json({ success: true, id: log.id });
  } catch (err) {
    console.error('ActivityLog POST error:', err);
    return NextResponse.json({ error: 'Falha ao salvar log' }, { status: 500 });
  }
}
