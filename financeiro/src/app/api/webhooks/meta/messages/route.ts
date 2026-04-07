import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// GET — Webhook verification for messages endpoint
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  let verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
  try {
    const config = await prisma.metaConfig.findFirst({ where: { isActive: true } });
    if (config?.verifyToken) verifyToken = config.verifyToken;
  } catch { /* use env fallback */ }

  if (!verifyToken) {
    return NextResponse.json({ error: 'Not configured' }, { status: 503 });
  }

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('[Meta Messages Webhook] Verified successfully');
    return new Response(challenge, { status: 200 });
  }

  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

// POST — Receive incoming messages and status updates from Meta / WhatsApp
export async function POST(req: Request) {
  let rawPayload = '';
  try {
    rawPayload = await req.text();
    const body = JSON.parse(rawPayload);

    const entry = body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    if (!value) {
      return NextResponse.json({ status: 'ignored' });
    }

    // Determine event type
    const eventType = value.messages ? 'messages' : value.statuses ? 'statuses' : 'unknown';

    // Log webhook
    const webhookLog = await prisma.webhookLog.create({
      data: {
        source: 'meta_message',
        eventType,
        payload: rawPayload,
        status: 'processing',
      },
    });

    try {
      // Handle incoming messages
      if (value.messages) {
        for (const msg of value.messages) {
          const waId = msg.from;
          const contactInfo = value.contacts?.[0];
          const contactName = contactInfo?.profile?.name || 'Desconhecido';
          const msgType = msg.type || 'text';
          const msgBody = msg.text?.body || msg.caption || '';
          const msgId = msg.id;
          const timestamp = msg.timestamp ? new Date(parseInt(msg.timestamp) * 1000) : new Date();

          // Detect Meta Ads referral
          const referral = msg.referral;
          const source = referral ? 'meta_ads' : 'organic';
          const adName = referral?.headline || referral?.source_url || null;

          // Find or create conversation
          let conversation = await prisma.whatsAppConversation.findUnique({
            where: { waId },
          });

          if (!conversation) {
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

            // Auto-create CRM client if not exists
            if (!client) {
              const newClient = await prisma.client.create({
                data: {
                  name: contactName,
                  phone,
                  source: source === 'meta_ads' ? 'whatsapp' : 'whatsapp',
                  stage: 'entrada',
                  unit: 'Barueri',
                  tags: source === 'meta_ads' ? 'Meta Ads,WhatsApp' : 'WhatsApp',
                },
              });

              // Link to conversation
              await prisma.whatsAppConversation.update({
                where: { id: conversation.id },
                data: { clientId: newClient.id },
              });
            }
          }

          // Save message (dedup by waMessageId)
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
            update: {},
          });

          // Update conversation
          await prisma.whatsAppConversation.update({
            where: { id: conversation.id },
            data: {
              lastMessageAt: timestamp,
              unreadCount: { increment: 1 },
              contactName,
            },
          });
        }
      }

      // Handle status updates
      if (value.statuses) {
        for (const status of value.statuses) {
          const msgId = status.id;
          const statusStr = status.status;
          await prisma.whatsAppMessage.updateMany({
            where: { waMessageId: msgId },
            data: { status: statusStr },
          });
        }
      }

      // Mark webhook as processed
      await prisma.webhookLog.update({
        where: { id: webhookLog.id },
        data: { status: 'processed', processedAt: new Date() },
      });
    } catch (processingError) {
      await prisma.webhookLog.update({
        where: { id: webhookLog.id },
        data: {
          status: 'error',
          errorMessage: processingError instanceof Error ? processingError.message : 'Processing error',
        },
      });
    }

    return NextResponse.json({ status: 'ok' });
  } catch (error) {
    console.error('[Meta Messages Webhook] Error:', error);
    try {
      await prisma.webhookLog.create({
        data: {
          source: 'meta_message',
          eventType: 'unknown',
          payload: rawPayload || null,
          status: 'error',
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        },
      });
    } catch { /* ignore */ }

    return NextResponse.json({ status: 'ok' });
  }
}
