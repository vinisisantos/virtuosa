import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/* GET — List notifications for a user */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const userId = url.searchParams.get('userId');
    const unreadOnly = url.searchParams.get('unreadOnly') === 'true';
    const limit = parseInt(url.searchParams.get('limit') || '20');

    const where: any = {};
    if (userId) where.OR = [{ userId }, { userId: null }];
    if (unreadOnly) where.isRead = false;

    const notifications = await prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    const unreadCount = await prisma.notification.count({
      where: { ...where, isRead: false },
    });

    return NextResponse.json({ notifications, unreadCount });
  } catch (err) {
    console.error('Notifications GET error:', err);
    return NextResponse.json({ error: 'Falha ao carregar notificações' }, { status: 500 });
  }
}

/* POST — Create a notification */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, type, title, message, icon, link } = body;

    if (!title || !message) return NextResponse.json({ error: 'Título e mensagem obrigatórios' }, { status: 400 });

    const notification = await prisma.notification.create({
      data: { userId, type: type || 'info', title, message, icon: icon || 'notifications', link },
    });

    return NextResponse.json({ success: true, notification });
  } catch (err) {
    console.error('Notifications POST error:', err);
    return NextResponse.json({ error: 'Falha ao criar notificação' }, { status: 500 });
  }
}

/* PUT — Mark as read (single or all) */
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();

    if (body.markAllRead) {
      const where: any = {};
      if (body.userId) where.OR = [{ userId: body.userId }, { userId: null }];
      await prisma.notification.updateMany({ where, data: { isRead: true } });
      return NextResponse.json({ success: true });
    }

    if (body.id) {
      await prisma.notification.update({ where: { id: body.id }, data: { isRead: true } });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'ID ou markAllRead obrigatório' }, { status: 400 });
  } catch (err) {
    console.error('Notifications PUT error:', err);
    return NextResponse.json({ error: 'Falha ao atualizar notificação' }, { status: 500 });
  }
}
