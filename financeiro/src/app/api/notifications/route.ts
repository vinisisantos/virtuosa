import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { notificationWithViewerReadState } from '@/lib/notification-read-state';
import { requireUnitGuard } from '@/lib/unit-guard';

/* GET — List notifications for a user */
export async function GET(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  try {
    const url = new URL(req.url);
    const unreadOnly = url.searchParams.get('unreadOnly') === 'true';
    const parsedLimit = Number.parseInt(url.searchParams.get('limit') || '20', 10);
    const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 100) : 20;

    const globalScope: Prisma.NotificationWhereInput = guard.isAdmin
      ? { userId: null }
      : {
          userId: null,
          OR: [{ unit: guard.userUnit }, { unit: null }],
        };
    const where: Prisma.NotificationWhereInput = unreadOnly
      ? { userId: guard.userId, isRead: false }
      : { OR: [{ userId: guard.userId }, globalScope] };

    const rows = await prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    const notifications = rows.map(notificationWithViewerReadState);

    const unreadCount = await prisma.notification.count({
      // O estado de avisos globais é compartilhado e não representa leitura
      // individual; somente notificações próprias entram neste contador.
      where: { userId: guard.userId, isRead: false },
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
    if (userId && userId !== guard.userId && !guard.isAdmin) {
      return NextResponse.json({ error: 'Você não pode criar notificações para outro usuário' }, { status: 403 });
    }

    const notification = await prisma.notification.create({
      data: {
        userId: userId || (guard.isAdmin ? null : guard.userId),
        type: type || 'info',
        title,
        message,
        icon: icon || 'notifications',
        link,
        unit: guard.createUnit(),
      },
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
      // Avisos globais compartilham um único registro. Somente notificações
      // individuais podem ser marcadas sem afetar a leitura de outra pessoa.
      await prisma.notification.updateMany({
        where: { userId: guard.userId, isRead: false },
        data: { isRead: true },
      });
      return NextResponse.json({ success: true });
    }

    if (body.id) {
      const result = await prisma.notification.updateMany({
        // Avisos globais usam um único registro compartilhado. Marcá-los
        // aqui apagaria o aviso para toda a equipe; somente avisos próprios
        // possuem leitura individual.
        where: { id: body.id, userId: guard.userId },
        data: { isRead: true },
      });
      if (!result.count) {
        return NextResponse.json({ error: 'Notificação não encontrada' }, { status: 404 });
      }
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'ID ou markAllRead obrigatório' }, { status: 400 });
  } catch (err) {
    console.error('Notifications PUT error:', err);
    return NextResponse.json({ error: 'Falha ao atualizar notificação' }, { status: 500 });
  }
}
