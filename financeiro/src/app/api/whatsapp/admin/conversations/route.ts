import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// GET /api/whatsapp/admin/conversations?userId=xxx&status=open
export async function GET(req: Request) {
  try {
    const role = req.headers.get('x-user-role');
    if (role !== 'ADMINISTRADOR') {
      return NextResponse.json({ error: 'Acesso restrito a administradores' }, { status: 403 });
    }

    const url = new URL(req.url);
    const targetUserId = url.searchParams.get('userId');
    const status = url.searchParams.get('status');

    if (!targetUserId) {
      return NextResponse.json({ error: 'userId é obrigatório' }, { status: 400 });
    }

    // Buscar instância do usuário alvo
    const instance = await prisma.whatsAppInstance.findFirst({
      where: { userId: targetUserId },
    });

    if (!instance) {
      return NextResponse.json({ error: 'Usuário não possui instância WhatsApp' }, { status: 404 });
    }

    const where: any = { instanceId: instance.id };
    if (status) where.status = status;

    const conversations = await prisma.whatsAppConversation.findMany({
      where,
      include: {
        contact: true,
        messages: {
          orderBy: { timestamp: 'desc' },
          take: 1,
        },
      },
      orderBy: { lastMessageAt: 'desc' },
    });

    return NextResponse.json(conversations);
  } catch (error: any) {
    console.error('[Admin Conversations]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
