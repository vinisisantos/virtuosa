import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// PATCH — Reabrir conversa
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = req.headers.get('x-user-id');

    if (!userId) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { assignedTo, assignedToName } = body;

    const dataUpdate: any = {
      status: 'open',
      reopenedAt: new Date(),
      reopenCount: { increment: 1 },
    };

    if (assignedTo) {
      dataUpdate.assignedTo = assignedTo;
      dataUpdate.assignedToName = assignedToName || 'Operador';
    }

    const updated = await prisma.whatsAppConversation.update({
      where: { id },
      data: dataUpdate,
    });

    return NextResponse.json({ success: true, conversation: updated });
  } catch (error: any) {
    console.error('[Reopen API Error]:', error);
    return NextResponse.json({ error: 'Erro interno', details: error.message }, { status: 500 });
  }
}
