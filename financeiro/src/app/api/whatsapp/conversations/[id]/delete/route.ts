import { NextResponse } from 'next/server';

import { prisma } from "@/lib/db";

// DELETE — Excluir conversa (apenas ADMINISTRADOR)
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userRole = req.headers.get('x-user-role');

    if (userRole !== 'ADMINISTRADOR') {
      return NextResponse.json({ error: 'Acesso negado. Apenas administradores podem excluir conversas.' }, { status: 403 });
    }

    // Verificar se a conversa existe
    const conversation = await prisma.whatsAppConversation.findUnique({
      where: { id },
    });

    if (!conversation) {
      return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 });
    }

    // Excluir mensagens primeiro (FK constraint)
    await prisma.whatsAppMessage.deleteMany({
      where: { conversationId: id },
    });

    // Excluir a conversa
    await prisma.whatsAppConversation.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[Delete Conversation Error]:', error);
    return NextResponse.json({ error: 'Erro interno', details: error.message }, { status: 500 });
  }
}
