import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Send a message via WhatsApp Business API
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { conversationId, message, operatorName } = body;

    if (!conversationId || !message) {
      return NextResponse.json({ error: 'conversationId and message required' }, { status: 400 });
    }

    const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
    const PHONE_ID = process.env.WHATSAPP_PHONE_ID;

    if (!WHATSAPP_TOKEN || !PHONE_ID) {
      // Save to DB anyway for testing without API
      const conversation = await prisma.whatsAppConversation.findUnique({ where: { id: conversationId } });
      if (!conversation) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });

      const saved = await prisma.whatsAppMessage.create({
        data: {
          conversationId,
          direction: 'outbound',
          type: 'text',
          body: message,
          sentBy: operatorName || 'Sistema',
          status: 'pending_config', // Mark as pending until API is configured
          timestamp: new Date(),
        },
      });

      await prisma.whatsAppConversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: new Date(), status: 'em_andamento' },
      });

      return NextResponse.json({
        success: true,
        messageId: saved.id,
        warning: 'WhatsApp API not configured — message saved locally only. Configure WHATSAPP_TOKEN and WHATSAPP_PHONE_ID to send via WhatsApp.',
      });
    }

    // Get conversation to find the recipient
    const conversation = await prisma.whatsAppConversation.findUnique({ where: { id: conversationId } });
    if (!conversation) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });

    // Send via WhatsApp Cloud API
    const waResponse = await fetch(
      `https://graph.facebook.com/v21.0/${PHONE_ID}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: conversation.waId,
          type: 'text',
          text: { body: message },
        }),
      }
    );

    const waData = await waResponse.json();

    if (!waResponse.ok) {
      console.error('[WhatsApp Send] API Error:', waData);
      return NextResponse.json({ error: 'Failed to send', details: waData }, { status: 500 });
    }

    const waMessageId = waData.messages?.[0]?.id || null;

    // Save outbound message
    const saved = await prisma.whatsAppMessage.create({
      data: {
        conversationId,
        waMessageId,
        direction: 'outbound',
        type: 'text',
        body: message,
        sentBy: operatorName || 'Sistema',
        status: 'sent',
        timestamp: new Date(),
      },
    });

    // Update conversation
    await prisma.whatsAppConversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date(), status: 'em_andamento' },
    });

    return NextResponse.json({ success: true, messageId: saved.id, waMessageId });
  } catch (error) {
    console.error('[WhatsApp Send] Error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
