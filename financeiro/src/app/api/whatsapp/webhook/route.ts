import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// GET — Webhook verification (Meta sends this to verify your endpoint)
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;

  if (!VERIFY_TOKEN) {
    console.warn('[WhatsApp Webhook] WHATSAPP_VERIFY_TOKEN not configured');
    return NextResponse.json({ error: 'Not configured' }, { status: 503 });
  }

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('[WhatsApp Webhook] Verified successfully');
    return new Response(challenge, { status: 200 });
  }

  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

// POST — Receive incoming messages from WhatsApp
export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Meta sends notifications with this structure
    const entry = body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    if (!value) {
      return NextResponse.json({ status: 'ignored' });
    }

    // Handle incoming messages
    if (value.messages) {
      for (const msg of value.messages) {
        const waId = msg.from; // Phone number without +
        const contactInfo = value.contacts?.[0];
        const contactName = contactInfo?.profile?.name || 'Desconhecido';
        const msgType = msg.type || 'text';
        const msgBody = msg.text?.body || msg.caption || '';
        const msgId = msg.id;
        const timestamp = msg.timestamp ? new Date(parseInt(msg.timestamp) * 1000) : new Date();

        // Detect if it came from a Meta ad (Click-to-WhatsApp)
        const referral = msg.referral;
        const source = referral ? 'meta_ads' : 'organic';
        const adName = referral?.headline || referral?.source_url || null;

        // Find or create conversation
        let conversation = await prisma.whatsAppConversation.findUnique({
          where: { waId },
        });

        if (!conversation) {
          // Try to match to existing CRM client by phone
          const phone = '+' + waId;
          const cleanPhone = waId.replace('55', '').slice(-11);
          const client = await prisma.client.findFirst({
            where: {
              OR: [
                { phone: { contains: cleanPhone } },
                { phone: { contains: waId } },
              ],
              isActive: true,
            },
          });

          conversation = await prisma.whatsAppConversation.create({
            data: {
              waId,
              contactName,
              contactPhone: phone,
              clientId: client?.id || null,
              source,
              adName,
              status: 'aberta',
            },
          });

          // If no CRM client exists, auto-create one as a lead
          if (!client) {
            await prisma.client.create({
              data: {
                name: contactName,
                phone,
                source: source === 'meta_ads' ? 'whatsapp' : 'whatsapp',
                stage: 'entrada',
                unit: 'Barueri',
                tags: source === 'meta_ads' ? 'Meta Ads,WhatsApp' : 'WhatsApp',
              },
            });
          }
        }

        // Save the message
        await prisma.whatsAppMessage.upsert({
          where: { waMessageId: msgId },
          create: {
            conversationId: conversation.id,
            waMessageId: msgId,
            direction: 'inbound',
            type: msgType,
            body: msgBody,
            mediaUrl: msg.image?.id || msg.document?.id || msg.audio?.id || msg.video?.id || null,
            mediaType: msg.image?.mime_type || msg.document?.mime_type || null,
            timestamp,
          },
          update: {}, // dedup: don't update if exists
        });

        // Update conversation
        await prisma.whatsAppConversation.update({
          where: { id: conversation.id },
          data: {
            lastMessageAt: timestamp,
            unreadCount: { increment: 1 },
            contactName, // update name in case it changed
          },
        });
      }
    }

    // Handle status updates (delivered, read, etc.)
    if (value.statuses) {
      for (const status of value.statuses) {
        const msgId = status.id;
        const statusStr = status.status; // sent, delivered, read, failed
        await prisma.whatsAppMessage.updateMany({
          where: { waMessageId: msgId },
          data: { status: statusStr },
        });
      }
    }

    return NextResponse.json({ status: 'ok' });
  } catch (error) {
    console.error('[WhatsApp Webhook] Error:', error);
    return NextResponse.json({ status: 'ok' }); // Always return 200 to Meta
  }
}
