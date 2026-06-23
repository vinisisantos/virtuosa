import { NextResponse } from 'next/server';
import crypto from 'crypto';

import { prisma } from "@/lib/db";

const getEvolutionConfig = () => ({
  url: process.env.EVOLUTION_API_URL || 'http://localhost:8080',
  apiKey: process.env.EVOLUTION_API_KEY || '',
});

// PATCH — Fechar/resolver conversa
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { resolution, closeNote, sendGoodbye, sendSurvey, unit } = body;

    const userId = req.headers.get('x-user-id');
    const userName = req.headers.get('x-user-name');

    if (!userId) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    // Buscar conversa com contato e instância
    const conversation = await prisma.whatsAppConversation.findUnique({
      where: { id },
      include: { contact: true, instance: true },
    });

    if (!conversation) {
      return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 });
    }

    // Enviar mensagem de despedida via WhatsApp
    if (sendGoodbye && conversation.instance && conversation.contact) {
      const { url, apiKey } = getEvolutionConfig();
      const clientName = conversation.contact.name || '';
      const greeting = clientName ? `Obrigado ${clientName} pelo contato!` : 'Obrigado pelo contato!';
      const goodbyeMsg = `${greeting} Seu atendimento foi finalizado. Caso precise de algo mais, estamos à disposição. 😊`;
      
      try {
        await fetch(`${url}/message/sendText/${conversation.instance.name}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': apiKey,
          },
          body: JSON.stringify({
            number: conversation.contact.phone,
            text: goodbyeMsg,
          }),
        });
      } catch (e) {
        console.error('[Close] Erro ao enviar despedida:', e);
      }
    }

    // Enviar link de pesquisa (Survey) SEMPRE que fechar o chat
    if (conversation.instance && conversation.contact) {
      const { url, apiKey } = getEvolutionConfig();
      const token = crypto.randomUUID();
      const baseUrl = req.headers.get('x-forwarded-host') || req.headers.get('host') || 'localhost:3000';
      const protocol = req.headers.get('x-forwarded-proto') || 'https';
      const surveyUrl = `${protocol}://${baseUrl}/avaliar/${token}`;
      const surveyMsg = `Obrigado pelo seu atendimento na Virtuosa! ✨ Avalie como foi sua experiência 👉 ${surveyUrl}`;

      try {
        if (sendGoodbye) await new Promise(r => setTimeout(r, 2000)); // Delay para não mandar junto

        await fetch(`${url}/message/sendText/${conversation.instance.name}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': apiKey,
          },
          body: JSON.stringify({
            number: conversation.contact.phone,
            text: surveyMsg,
          }),
        });

        await prisma.satisfactionSurvey.create({
          data: {
            token,
            clientName: conversation.contact.name || conversation.contact.phone,
            clientPhone: conversation.contact.phone,
            score: 0,
            status: 'sent',
            sentAt: new Date(),
            conversationId: id,
            unit: unit || conversation.contact.unit || 'SCS',
            profissionalId: conversation.assignedTo || userId,
            profissional: conversation.assignedToName || userName || 'Equipe',
          }
        });
      } catch (e) {
        console.error('[Close] Erro ao enviar survey:', e);
      }
    }

    // Atualizar conversa no banco
    const updated = await prisma.whatsAppConversation.update({
      where: { id },
      data: {
        status: 'resolved',
        resolution: resolution || 'resolved',
        closedAt: new Date(),
        closedBy: userId,
        closedByName: userName || 'Operador',
        closeNote: closeNote || null,
      },
    });

    return NextResponse.json({ success: true, conversation: updated });
  } catch (error: any) {
    console.error('[Close API Error]:', error);
    return NextResponse.json({ error: 'Erro interno', details: error.message }, { status: 500 });
  }
}
