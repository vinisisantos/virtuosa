import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// Send a message via WhatsApp Business API
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { conversationId, message, operatorName, type, mediaUrl } = body;

    if (!conversationId || !message) {
      return NextResponse.json({ error: 'conversationId and message required' }, { status: 400 });
    }

    // Get credentials from MetaConfig, fallback to env
    let whatsappToken = process.env.WHATSAPP_TOKEN;
    let phoneId = process.env.WHATSAPP_PHONE_ID;

    try {
      const config = await prisma.metaConfig.findFirst({ where: { isActive: true } });
      if (config?.accessToken) whatsappToken = config.accessToken;
      if (config?.phoneNumberId) phoneId = config.phoneNumberId;
    } catch { /* use env fallback */ }

    const conversation = await prisma.whatsAppConversation.findUnique({ where: { id: conversationId } });
    if (!conversation) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });

    if (!whatsappToken || !phoneId) {
      // Save to DB for testing without API
      const saved = await prisma.whatsAppMessage.create({
        data: {
          conversationId,
          direction: 'outbound',
          type: type || 'text',
          body: message,
          sentBy: operatorName || 'Sistema',
          status: 'pending_config',
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
        warning: 'WhatsApp API não configurada — mensagem salva localmente. Configure a Meta API em Configurações.',
      });
    }

    // Build message payload
    let messagePayload: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      to: conversation.waId,
      type: type || 'text',
    };

    if (type === 'image' && mediaUrl) {
      messagePayload.image = { link: mediaUrl, caption: message };
    } else if (type === 'document' && mediaUrl) {
      messagePayload.document = { link: mediaUrl, caption: message };
    } else {
      messagePayload.text = { body: message };
    }

    // Send via WhatsApp Cloud API
    const waResponse = await fetch(
      `https://graph.facebook.com/v21.0/${phoneId}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${whatsappToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messagePayload),
      }
    );

    const waData = await waResponse.json();

    if (!waResponse.ok) {
      console.error('[WhatsApp Send] API Error:', waData);

      // Log the error
      await prisma.webhookLog.create({
        data: {
          source: 'meta_message',
          eventType: 'send_error',
          payload: JSON.stringify({ conversationId, message, error: waData }),
          status: 'error',
          errorMessage: waData?.error?.message || 'Send failed',
        },
      });

      return NextResponse.json({ error: 'Failed to send', details: waData }, { status: 500 });
    }

    const waMessageId = waData.messages?.[0]?.id || null;

    // Save outbound message
    const saved = await prisma.whatsAppMessage.create({
      data: {
        conversationId,
        waMessageId,
        direction: 'outbound',
        type: type || 'text',
        body: message,
        mediaUrl: mediaUrl || null,
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
