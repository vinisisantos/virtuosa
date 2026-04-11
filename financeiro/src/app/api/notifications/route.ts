import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUnitGuard } from '@/lib/unit-guard';

/* GET — List notifications for a user */
export async function GET(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  try {
    const url = new URL(req.url);
    const unreadOnly = url.searchParams.get('unreadOnly') === 'true';
    const limit = parseInt(url.searchParams.get('limit') || '20');

    // UNIT GUARD: Show notifications for this user in their unit (or global)
    const where: any = {
      OR: [
        { userId: guard.userId },
        { userId: null }, // global notifications
      ],
    };
    // Also filter by unit: show only notifications for user's unit or without unit (global)
    if (!guard.isAdmin) {
      where.AND = [
        { OR: [{ unit: guard.userUnit }, { unit: null }] },
      ];
    }
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
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  try {
    const body = await req.json();
    const { userId, type, title, message, icon, link } = body;

    if (!title || !message) return NextResponse.json({ error: 'Título e mensagem obrigatórios' }, { status: 400 });

    const notification = await prisma.notification.create({
      data: { userId, type: type || 'info', title, message, icon: icon || 'notifications', link, unit: guard.createUnit() },
    });

    return NextResponse.json({ success: true, notification });
  } catch (err) {
    console.error('Notifications POST error:', err);
    return NextResponse.json({ error: 'Falha ao criar notificação' }, { status: 500 });
  }
}

/* PUT — Mark as read (single or all) */
export async function PUT(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  try {
    const body = await req.json();

    if (body.markAllRead) {
      // UNIT GUARD: Only mark own notifications as read
      const where: any = {
        OR: [{ userId: guard.userId }, { userId: null }],
      };
      if (!guard.isAdmin) {
        where.AND = [{ OR: [{ unit: guard.userUnit }, { unit: null }] }];
      }
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
