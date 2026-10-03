import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { canAccessOrders } from '@/lib/automatic-costs';
import { requireUnitGuard } from '@/lib/unit-guard';

const validViews = new Set(['detailed', 'compact']);

function preferenceKey(userId: string) {
  return `orders_view:${userId}`;
}

function authorizedUser(request: NextRequest) {
  const guard = requireUnitGuard(request);
  if (guard instanceof NextResponse) return guard;
  if (!canAccessOrders(guard)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }
  return guard;
}

export async function GET(request: NextRequest) {
  const user = authorizedUser(request);
  if (user instanceof NextResponse) return user;

  try {
    const setting = await prisma.appSetting.findUnique({
      where: { key: preferenceKey(user.userId) },
      select: { value: true },
    });
    const view = setting && validViews.has(setting.value) ? setting.value : 'detailed';
    return NextResponse.json({ view });
  } catch (error) {
    console.error('GET orders view preference error:', error);
    return NextResponse.json({ error: 'Não foi possível carregar a visualização' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const user = authorizedUser(request);
  if (user instanceof NextResponse) return user;

  const body = await request.json().catch(() => null);
  if (!validViews.has(body?.view)) {
    return NextResponse.json({ error: 'Visualização inválida' }, { status: 400 });
  }

  try {
    await prisma.appSetting.upsert({
      where: { key: preferenceKey(user.userId) },
      create: { key: preferenceKey(user.userId), value: body.view },
      update: { value: body.view },
    });
    return NextResponse.json({ view: body.view });
  } catch (error) {
    console.error('PATCH orders view preference error:', error);
    return NextResponse.json({ error: 'Não foi possível salvar a visualização' }, { status: 500 });
  }
}
