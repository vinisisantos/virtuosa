import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// ─── Evolution API Webhook ───
// Receives MESSAGES_UPSERT events from Evolution API
// Updates the EvolutionChatCache table with last message preview + unread count

// Helper to extract message body text from various message types
function extractBodyFromMessage(message: any): { body: string; type: string } {
  if (!message) return { body: '', type: 'unknown' };

  if (message.conversation) return { body: message.conversation, type: 'conversation' };
  if (message.extendedTextMessage?.text) return { body: message.extendedTextMessage.text, type: 'extendedTextMessage' };
  if (message.imageMessage?.caption) return { body: `📷 ${message.imageMessage.caption}`, type: 'imageMessage' };
  if (message.imageMessage) return { body: '📷 Foto', type: 'imageMessage' };
  if (message.videoMessage?.caption) return { body: `🎥 ${message.videoMessage.caption}`, type: 'videoMessage' };
  if (message.videoMessage) return { body: '🎥 Vídeo', type: 'videoMessage' };
  if (message.audioMessage) return { body: '🎵 Áudio', type: 'audioMessage' };
  if (message.documentMessage?.fileName) return { body: `📄 ${message.documentMessage.fileName}`, type: 'documentMessage' };
  if (message.documentMessage) return { body: '📄 Documento', type: 'documentMessage' };
  if (message.stickerMessage) return { body: '🏷️ Figurinha', type: 'stickerMessage' };
  if (message.contactMessage?.displayName) return { body: `👤 ${message.contactMessage.displayName}`, type: 'contactMessage' };
  if (message.locationMessage) return { body: '📍 Localização', type: 'locationMessage' };
  if (message.reactionMessage?.text) return { body: message.reactionMessage.text, type: 'reactionMessage' };
  if (message.protocolMessage) return { body: '', type: 'protocolMessage' };
  if (message.senderKeyDistributionMessage) return { body: '', type: 'system' };

  return { body: '', type: 'unknown' };
}

export async function POST(req: Request) {
  try {
    // ─── Validate webhook origin ───
    const webhookSecret = process.env.EVOLUTION_WEBHOOK_SECRET;
    if (webhookSecret) {
      const authHeader = req.headers.get('authorization');
      const apiKeyHeader = req.headers.get('apikey');
      if (authHeader !== `Bearer ${webhookSecret}` && apiKeyHeader !== webhookSecret) {
        console.warn('[Evolution Webhook] Unauthorized request blocked');
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const body = await req.json();

    // Evolution API webhook structure:
    // { event: "messages.upsert", instance: "virtuosa", data: { ... }, ... }
    const event = body.event;
    const instance = body.instance;
    const data = body.data;

    // Only handle message events
    if (event !== 'messages.upsert' || !data) {
      return NextResponse.json({ status: 'ignored', event });
    }

    // Extract message info from the data
    const key = data.key;
    const remoteJid = key?.remoteJid;
    const fromMe = key?.fromMe || false;
    const pushName = data.pushName || '';
    const messageTimestamp = data.messageTimestamp;
    const message = data.message;

    // Skip group messages, status broadcasts, and system messages
    if (!remoteJid || remoteJid.includes('@g.us') || remoteJid.includes('status@')) {
      return NextResponse.json({ status: 'skipped', reason: 'group_or_status' });
    }

    // Extract body
    const { body: msgBody, type: msgType } = extractBodyFromMessage(message);

    // Skip protocol/system messages with no body
    if (msgType === 'protocolMessage' || msgType === 'system') {
      return NextResponse.json({ status: 'skipped', reason: 'system_message' });
    }

    // ─── Detect Click-to-WhatsApp Ad (externalAdReply) ───
    // When someone clicks a Meta ad "Converse conosco" / "Saiba Mais",
    // the message arrives with contextInfo.externalAdReply containing the ad data
    let adTitle: string | undefined;
    let adBody: string | undefined;
    let adSourceUrl: string | undefined;
    let isFromAd = false;

    const contextInfo =
      message?.extendedTextMessage?.contextInfo ||
      message?.imageMessage?.contextInfo ||
      message?.videoMessage?.contextInfo ||
      message?.conversation?.contextInfo ||
      message?.contextInfo;

    const externalAdReply = contextInfo?.externalAdReply;
    if (externalAdReply) {
      isFromAd = true;
      adTitle = externalAdReply.title || undefined;
      adBody = externalAdReply.body || undefined;
      adSourceUrl = externalAdReply.sourceUrl || externalAdReply.url || undefined;
      console.log(`[Evolution Webhook] 📢 Ad detected: "${adBody || adTitle}" from ${adSourceUrl || 'unknown'} | ${remoteJid}`);
    }

    // Parse timestamp
    const msgTimestamp = messageTimestamp
      ? new Date(typeof messageTimestamp === 'number' ? messageTimestamp * 1000 : messageTimestamp)
      : new Date();

    // Upsert the chat cache (include ad data if present)
    const cacheData: any = {
      lastMsgBody: msgBody || null,
      lastMsgType: msgType,
      lastMsgFromMe: fromMe,
      lastMsgAt: msgTimestamp,
      ...(pushName && !fromMe ? { pushName } : {}),
    };
    // Only set ad fields if this is the first ad message (don't overwrite on subsequent messages)
    const adFields = isFromAd ? {
      adTitle,
      adBody,
      adSourceUrl,
      isLead: true,
    } : {};

    await prisma.evolutionChatCache.upsert({
      where: { remoteJid },
      create: {
        remoteJid,
        instanceName: instance || 'virtuosa',
        pushName: fromMe ? undefined : (pushName || undefined),
        ...cacheData,
        ...adFields,
        unreadCount: fromMe ? 0 : 1,
      },
      update: {
        ...cacheData,
        // Only set ad data if it's an ad message AND cache doesn't already have ad data
        ...(isFromAd ? adFields : {}),
        unreadCount: fromMe ? 0 : { increment: 1 },
      },
    });

    // ─── Auto-create Lead in CRM (fire-and-forget) ───
    // When a Click-to-WhatsApp ad message arrives from a new contact
    if (isFromAd && !fromMe) {
      (async () => {
        try {
          // Resolve phone number from remoteJid
          let phone: string | null = null;
          if (remoteJid.includes('@s.whatsapp.net')) {
            phone = '+' + remoteJid.split('@')[0];
          }

          // If @lid, try to get cached phone
          if (!phone && remoteJid.includes('@lid')) {
            const cached = await prisma.evolutionChatCache.findUnique({
              where: { remoteJid },
              select: { phoneNumber: true },
            });
            if (cached?.phoneNumber) {
              phone = cached.phoneNumber.startsWith('+') ? cached.phoneNumber : '+' + cached.phoneNumber;
            }
          }

          if (!phone) {
            console.log('[Evolution Webhook] Ad lead without phone, skipping auto-register:', remoteJid);
            return;
          }

          // Normalize phone: ensure +55 prefix for Brazilian numbers
          let cleanPhone = phone.replace(/\D/g, '');
          if (cleanPhone.length === 10 || cleanPhone.length === 11) {
            cleanPhone = '55' + cleanPhone;
          }
          const normalizedPhone = '+' + cleanPhone;
          const phoneDigits = cleanPhone.slice(-11); // Last 11 digits for matching

          // Build campaign name from ad data
          const campaignName = adBody || adTitle || 'Campanha Meta Ads';

          // Check if client already exists by phone
          let existingClient = await prisma.client.findFirst({
            where: {
              OR: [
                { phone: { contains: phoneDigits } },
                { phone: { contains: normalizedPhone } },
              ],
              isActive: true,
            },
          });

          let clientId: string;
          const contactName = pushName || 'Lead WhatsApp';

          if (existingClient) {
            clientId = existingClient.id;
            // Update tags to include campaign
            const currentTags = existingClient.tags || '';
            let newTags = currentTags;
            if (!currentTags.includes('Meta Ads')) {
              newTags = currentTags ? currentTags + ',Meta Ads' : 'Meta Ads';
            }
            await prisma.client.update({
              where: { id: clientId },
              data: {
                tags: newTags,
                source: existingClient.source || 'instagram',
              },
            });
          } else {
            // Create new client
            // Determine unit from Evolution config
            let unit = 'Barueri';
            try {
              const evoConfig = await (prisma as any).evolutionConfig.findFirst({
                where: { instanceName: instance || 'virtuosa' },
              });
              if (evoConfig?.unit) unit = evoConfig.unit;
            } catch { /* use default */ }

            const newClient = await prisma.client.create({
              data: {
                name: contactName,
                phone: normalizedPhone,
                source: 'instagram',
                stage: 'entrada',
                unit,
                tags: 'Meta Ads',
              },
            });
            clientId = newClient.id;
          }

          // Update cache with clientId
          await prisma.evolutionChatCache.update({
            where: { remoteJid },
            data: { clientId },
          });

          // Check if pipeline entry already exists for this client
          const existingPipeline = await prisma.salesPipeline.findFirst({
            where: {
              clientId,
              stage: { notIn: ['fechado', 'perdido'] },
            },
          });

          if (!existingPipeline) {
            // Determine unit
            let unit = 'Barueri';
            try {
              const evoConfig = await (prisma as any).evolutionConfig.findFirst({
                where: { instanceName: instance || 'virtuosa' },
              });
              if (evoConfig?.unit) unit = evoConfig.unit;
            } catch { /* use default */ }

            // Try round-robin assignment
            let assignedTo: string | undefined;
            let assignedName: string | undefined;
            try {
              const { assignLeadToOperator } = await import('@/lib/lead-assigner');
              const assignment = await assignLeadToOperator(unit);
              if (assignment) {
                assignedTo = assignment.userId;
                assignedName = assignment.userName;
              }
            } catch { /* no assignment */ }

            await prisma.salesPipeline.create({
              data: {
                clientId,
                clientName: contactName,
                stage: 'novo_lead',
                source: 'meta_ads',
                assignedTo,
                assignedName,
                unit,
                notes: `📢 Campanha: ${campaignName}${adSourceUrl ? ` | Via: ${adSourceUrl}` : ''}`,
              },
            });
          }

          // Audit log
          await prisma.auditLog.create({
            data: {
              userName: 'Sistema',
              action: 'create',
              entity: 'whatsapp_ad_lead',
              entityId: clientId,
              details: `Lead de campanha Click-to-WhatsApp: ${contactName} | Phone: ${normalizedPhone} | Campanha: ${campaignName} | ${existingClient ? 'Cliente existente' : 'Novo cliente criado'}`,
            },
          });

          console.log(`[Evolution Webhook] ✅ Ad lead processed: ${contactName} → ${campaignName}`);
        } catch (err) {
          console.error('[Evolution Webhook] Error processing ad lead:', err);
        }
      })();
    }

    // ─── Survey Response Capture ───
    // Check if this is a response to a satisfaction survey
    if (!fromMe && msgBody) {
      try {
        const trimmed = msgBody.trim();
        const ratingMatch = trimmed.match(/^([1-5])$/);

        // Find pending/sent survey for this remoteJid
        const pendingSurvey = await (prisma as any).surveyResponse.findFirst({
          where: {
            remoteJid,
            status: { in: ['sent'] },
            rating: null,
          },
          orderBy: { sentAt: 'desc' },
        });

        if (pendingSurvey && ratingMatch) {
          const rating = parseInt(ratingMatch[1]);

          // Save the rating
          await (prisma as any).surveyResponse.update({
            where: { id: pendingSurvey.id },
            data: {
              rating,
              answeredAt: new Date(),
              status: 'answered',
            },
          });

          console.log(`[Survey] ${pendingSurvey.clientName} rated ${rating}/5`);

          // Send auto-reply based on rating
          try {
            const config = await (prisma as any).evolutionConfig.findUnique({
              where: { unit: pendingSurvey.unit },
            });

            if (config?.apiUrl && config?.apiKey) {
              const baseUrl = (config.apiUrl as string).replace(/\/$/, '');
              const headers = { 'apikey': config.apiKey as string, 'Content-Type': 'application/json' };
              const instName = config.instanceName || 'virtuosa';

              const sendNumber = remoteJid.includes('@lid')
                ? remoteJid : remoteJid.replace('@s.whatsapp.net', '');

              let replyText = '';
              if (rating <= 2) {
                replyText = `Sentimos muito por isso, ${pendingSurvey.clientName.split(' ')[0]}! 😔\nPode nos contar o que aconteceu? Sua opinião é muito importante para melhorarmos.`;

                // ─── Low rating notification ───
                // Notify admin/manager via console (can be extended to push notification)
                console.warn(`⚠️ [Survey ALERT] LOW RATING (${rating}/5) from ${pendingSurvey.clientName} - ${pendingSurvey.procedimento} - Unit: ${pendingSurvey.unit}`);
              } else if (rating === 3) {
                replyText = `Obrigada pelo feedback, ${pendingSurvey.clientName.split(' ')[0]}! 🙏\nQuer nos contar como podemos melhorar? Sua opinião é muito valiosa!`;
              } else {
                replyText = `Que maravilha! Muito obrigada, ${pendingSurvey.clientName.split(' ')[0]}! 😊💜\nFicamos felizes que tenha gostado! Esperamos você em breve!`;
              }

              if (replyText) {
                await fetch(`${baseUrl}/message/sendText/${instName}`, {
                  method: 'POST',
                  headers,
                  body: JSON.stringify({ number: sendNumber, text: replyText }),
                });
              }
            }
          } catch (replyErr) {
            console.error('[Survey] Error sending auto-reply:', replyErr);
          }
        }

        // If there's a recently answered survey and this is text (not a number),
        // save as comment
        if (!ratingMatch && !pendingSurvey) {
          const recentAnswered = await (prisma as any).surveyResponse.findFirst({
            where: {
              remoteJid,
              status: 'answered',
              rating: { not: null },
              comment: null,
              answeredAt: { gte: new Date(Date.now() - 10 * 60 * 1000) }, // within 10 min
            },
            orderBy: { answeredAt: 'desc' },
          });

          if (recentAnswered && trimmed.length > 2) {
            await (prisma as any).surveyResponse.update({
              where: { id: recentAnswered.id },
              data: { comment: trimmed },
            });
            console.log(`[Survey] Comment from ${recentAnswered.clientName}: "${trimmed.substring(0, 50)}"`);
          }
        }
      } catch (surveyErr) {
        console.error('[Survey Webhook] Error handling survey response:', surveyErr);
      }
    }

    console.log(`[Evolution Webhook] ${fromMe ? '→' : '←'} ${remoteJid}: ${msgBody?.substring(0, 50) || msgType}`);

    return NextResponse.json({ status: 'ok' });
  } catch (error) {
    console.error('[Evolution Webhook] Error:', error);
    // Always return 200 to avoid webhook retries
    return NextResponse.json({ status: 'error', message: error instanceof Error ? error.message : 'Unknown' });
  }
}

// GET — Health check for the webhook
export async function GET() {
  return NextResponse.json({
    status: 'active',
    webhook: 'evolution',
    timestamp: new Date().toISOString(),
  });
}
