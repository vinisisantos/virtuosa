import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// ─── Mega API Webhook ───
// Receives messages from Mega API (flat structure, no event wrapper)
// Normalizes data and processes identically to Evolution webhook

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
  if (message.documentWithCaptionMessage?.message?.documentMessage?.fileName) {
    return { body: `📄 ${message.documentWithCaptionMessage.message.documentMessage.fileName}`, type: 'documentMessage' };
  }
  if (message.stickerMessage) return { body: '🏷️ Figurinha', type: 'stickerMessage' };
  if (message.contactMessage?.displayName) return { body: `👤 ${message.contactMessage.displayName}`, type: 'contactMessage' };
  if (message.locationMessage) return { body: '📍 Localização', type: 'locationMessage' };
  if (message.reactionMessage?.text) return { body: message.reactionMessage.text, type: 'reactionMessage' };
  if (message.protocolMessage) return { body: '', type: 'protocolMessage' };
  if (message.senderKeyDistributionMessage) return { body: '', type: 'system' };
  // Ephemeral message wrapper
  if (message.ephemeralMessage?.message) return extractBodyFromMessage(message.ephemeralMessage.message);
  // Poll
  if (message.pollCreationMessageV3) return { body: `📊 ${message.pollCreationMessageV3.name || 'Enquete'}`, type: 'pollCreationMessage' };
  // List response
  if (message.listResponseMessage) return { body: message.listResponseMessage.title || 'Resposta de lista', type: 'listResponseMessage' };
  // Button reply
  if (message.templateButtonReplyMessage) return { body: message.templateButtonReplyMessage.selectedDisplayText || 'Resposta de botão', type: 'templateButtonReplyMessage' };

  return { body: '', type: 'unknown' };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // ─── Mega API webhook structure (flat, no event wrapper) ───
    // {
    //   instance_key: "megastart-xxx",
    //   jid: "556181926137@s.whatsapp.net",
    //   messageType: "conversation",
    //   key: { remoteJid: "...", fromMe: false, id: "..." },
    //   messageTimestamp: 1730154730,
    //   pushName: "User Name",
    //   broadcast: false,
    //   message: { conversation: "Hello" }
    // }

    const instanceKey = body.instance_key;
    const key = body.key;
    const remoteJid = key?.remoteJid;
    const fromMe = key?.fromMe || false;
    const rawPushName = body.pushName || '';
    // Sanitize: Mega API sometimes sends the string "null" instead of actual null
    const pushName = (rawPushName && rawPushName !== 'null' && rawPushName.trim()) ? rawPushName.trim() : '';
    const messageTimestamp = body.messageTimestamp;
    const message = body.message;

    // Skip if no remoteJid or it's a group/status/newsletter message
    if (!remoteJid || remoteJid.includes('@g.us') || remoteJid.includes('status@') || remoteJid.includes('@newsletter')) {
      return NextResponse.json({ status: 'skipped', reason: 'group_or_status_or_newsletter' });
    }

    // Extract body
    const { body: msgBody, type: msgType } = extractBodyFromMessage(message);

    // Skip protocol/system messages
    if (msgType === 'protocolMessage' || msgType === 'system') {
      return NextResponse.json({ status: 'skipped', reason: 'system_message' });
    }

    // ─── Detect Click-to-WhatsApp Ad (externalAdReply) ───
    let adTitle: string | undefined;
    let adBody: string | undefined;
    let adSourceUrl: string | undefined;
    let isFromAd = false;

    const contextInfo =
      message?.extendedTextMessage?.contextInfo ||
      message?.imageMessage?.contextInfo ||
      message?.videoMessage?.contextInfo ||
      message?.contextInfo;

    const externalAdReply = contextInfo?.externalAdReply;
    if (externalAdReply) {
      isFromAd = true;
      adTitle = externalAdReply.title || undefined;
      adBody = externalAdReply.body || undefined;
      adSourceUrl = externalAdReply.sourceUrl || externalAdReply.url || undefined;
      console.log(`[Mega Webhook] 📢 Ad detected: "${adBody || adTitle}" from ${adSourceUrl || 'unknown'} | ${remoteJid}`);
    }

    // Parse timestamp
    const msgTimestamp = messageTimestamp
      ? new Date(typeof messageTimestamp === 'number' ? messageTimestamp * 1000 : messageTimestamp)
      : new Date();

    // Resolve instance name from instance_key
    const instanceName = instanceKey || 'virtuosa';

    // Resolve unit from EvolutionConfig (so chats appear in the right unit)
    let unit = 'Barueri'; // default fallback
    try {
      const evoConfig = await (prisma as any).evolutionConfig.findFirst({
        where: { instanceName },
        select: { unit: true },
      });
      if (evoConfig?.unit) unit = evoConfig.unit;
    } catch { /* use default */ }

    // ─── Extract phone number from JID ───
    let phoneNumber: string | null = null;
    if (remoteJid.includes('@s.whatsapp.net')) {
      phoneNumber = remoteJid.split('@')[0];
    }

    // ─── Extract media metadata for later download ───
    const imageMsg = message?.imageMessage;
    const videoMsg = message?.videoMessage;
    const audioMsg = message?.audioMessage;
    const docMsg = message?.documentMessage || message?.documentWithCaptionMessage?.message?.documentMessage;
    const stickerMsg = message?.stickerMessage;
    const mediaSource = imageMsg || videoMsg || audioMsg || docMsg || stickerMsg;
    const hasMedia = !!mediaSource;
    const mimetype = mediaSource?.mimetype || null;
    const fileName = docMsg?.fileName || null;
    const mediaKey = mediaSource?.mediaKey || null;
    const directPath = mediaSource?.directPath || null;
    const mediaUrlField = mediaSource?.url || null;
    const caption = imageMsg?.caption || videoMsg?.caption || null;
    const audioDuration = audioMsg?.seconds || null;
    const audioPtt = audioMsg?.ptt || false;

    // Extract thumbnail
    let thumbnail: string | null = null;
    const thumbSource = imageMsg || videoMsg || stickerMsg;
    if (thumbSource?.jpegThumbnail) {
      const tb = thumbSource.jpegThumbnail;
      thumbnail = typeof tb === 'string'
        ? (tb.startsWith('data:') ? tb : `data:image/jpeg;base64,${tb}`)
        : null;
    }

    // ─── Save message to EvolutionMessage table (persistent history) ───
    const messageKeyId = key?.id;
    if (messageKeyId) {
      try {
        await (prisma as any).evolutionMessage.upsert({
          where: {
            remoteJid_keyId: { remoteJid, keyId: messageKeyId },
          },
          create: {
            remoteJid,
            instanceName,
            keyId: messageKeyId,
            fromMe,
            pushName: pushName || null,
            body: msgBody || null,
            type: msgType,
            timestamp: msgTimestamp,
            status: fromMe ? 'sent' : 'delivered',
            hasMedia,
            mimetype,
            fileName,
            mediaKey,
            directPath,
            mediaUrl: mediaUrlField,
            thumbnail,
            caption,
            audioDuration,
            audioPtt,
            adTitle: isFromAd ? adTitle : null,
            adBody: isFromAd ? (adBody || null) : null,
            adSourceUrl: isFromAd ? (adSourceUrl || null) : null,
          },
          update: {
            // Only update status (e.g. sent → delivered → read)
            status: fromMe ? 'sent' : 'delivered',
          },
        });
      } catch (msgErr) {
        console.error('[Mega Webhook] Error saving message:', msgErr);
      }
    }

    // Upsert the chat cache
    const cacheData: any = {
      lastMsgBody: msgBody || null,
      lastMsgType: msgType,
      lastMsgFromMe: fromMe,
      lastMsgAt: msgTimestamp,
      ...(pushName && !fromMe ? { pushName } : {}),
    };

    // Auto-reopen finalized conversations when new incoming message arrives
    if (!fromMe) {
      try {
        const existing = await prisma.evolutionChatCache.findUnique({
          where: { remoteJid },
          select: { status: true },
        });
        if (existing?.status === 'finalizada') {
          cacheData.status = 'aberta';
          cacheData.closedAt = null;
          console.log(`[Mega Webhook] ↩️ Reopened finalized conversation: ${remoteJid}`);
        }
      } catch { /* continue */ }
    } else {
      try {
        const existing = await prisma.evolutionChatCache.findUnique({
          where: { remoteJid },
          select: { status: true },
        });
        if (existing?.status === 'aberta') {
          cacheData.status = 'em_andamento';
        }
      } catch { /* continue */ }
    }

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
        instanceName,
        unit,
        pushName: fromMe ? undefined : (pushName || undefined),
        ...(phoneNumber ? { phoneNumber } : {}),
        ...cacheData,
        ...adFields,
        unreadCount: fromMe ? 0 : 1,
      },
      update: {
        ...cacheData,
        ...(isFromAd ? adFields : {}),
        ...(phoneNumber ? { phoneNumber } : {}),
        unreadCount: fromMe ? 0 : { increment: 1 },
      },
    });

    // ─── Auto-create Lead in CRM (fire-and-forget) ───
    if (isFromAd && !fromMe) {
      (async () => {
        try {
          let phone: string | null = null;
          if (remoteJid.includes('@s.whatsapp.net')) {
            phone = '+' + remoteJid.split('@')[0];
          }

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
            console.log('[Mega Webhook] Ad lead without phone, skipping:', remoteJid);
            return;
          }

          let cleanPhone = phone.replace(/\D/g, '');
          if (cleanPhone.length === 10 || cleanPhone.length === 11) {
            cleanPhone = '55' + cleanPhone;
          }
          const normalizedPhone = '+' + cleanPhone;
          const phoneDigits = cleanPhone.slice(-11);

          const campaignName = adBody || adTitle || 'Campanha Meta Ads';

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
            let unit = 'Barueri';
            try {
              const evoConfig = await (prisma as any).evolutionConfig.findFirst({
                where: { instanceName },
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

          await prisma.evolutionChatCache.update({
            where: { remoteJid },
            data: { clientId },
          });

          const existingPipeline = await prisma.salesPipeline.findFirst({
            where: {
              clientId,
              stage: { notIn: ['fechado', 'perdido'] },
            },
          });

          if (!existingPipeline) {
            let unit = 'Barueri';
            try {
              const evoConfig = await (prisma as any).evolutionConfig.findFirst({
                where: { instanceName },
              });
              if (evoConfig?.unit) unit = evoConfig.unit;
            } catch { /* use default */ }

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

          await prisma.auditLog.create({
            data: {
              userName: 'Sistema',
              action: 'create',
              entity: 'whatsapp_ad_lead',
              entityId: clientId,
              details: `Lead de campanha Click-to-WhatsApp: ${contactName} | Phone: ${normalizedPhone} | Campanha: ${campaignName} | ${existingClient ? 'Cliente existente' : 'Novo cliente criado'}`,
            },
          });

          console.log(`[Mega Webhook] ✅ Ad lead processed: ${contactName} → ${campaignName}`);
        } catch (err) {
          console.error('[Mega Webhook] Error processing ad lead:', err);
        }
      })();
    }

    // ─── Survey Response Capture ───
    if (!fromMe && msgBody) {
      try {
        const trimmed = msgBody.trim();
        const ratingMatch = trimmed.match(/^([1-5])$/);

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

          await (prisma as any).surveyResponse.update({
            where: { id: pendingSurvey.id },
            data: {
              rating,
              answeredAt: new Date(),
              status: 'answered',
            },
          });

          console.log(`[Survey] ${pendingSurvey.clientName} rated ${rating}/5`);

          // Send auto-reply using Mega API provider
          try {
            const config = await (prisma as any).evolutionConfig.findFirst({
              where: { instanceName },
            });

            if (config?.apiUrl && config?.apiKey) {
              const { buildProviderConfig, sendText } = await import('@/lib/whatsapp-provider');
              const providerConfig = buildProviderConfig(config);
              
              if (providerConfig) {
                const sendNumber = remoteJid.includes('@lid')
                  ? remoteJid : remoteJid.replace('@s.whatsapp.net', '');

                let replyText = '';
                if (rating <= 2) {
                  replyText = `Sentimos muito por isso, ${pendingSurvey.clientName.split(' ')[0]}! 😔\nPode nos contar o que aconteceu? Sua opinião é muito importante para melhorarmos.`;
                  console.warn(`⚠️ [Survey ALERT] LOW RATING (${rating}/5) from ${pendingSurvey.clientName} - ${pendingSurvey.procedimento} - Unit: ${pendingSurvey.unit}`);
                } else if (rating === 3) {
                  replyText = `Obrigada pelo feedback, ${pendingSurvey.clientName.split(' ')[0]}! 🙏\nQuer nos contar como podemos melhorar? Sua opinião é muito valiosa!`;
                } else {
                  replyText = `Que maravilha! Muito obrigada, ${pendingSurvey.clientName.split(' ')[0]}! 😊💜\nFicamos felizes que tenha gostado! Esperamos você em breve!`;
                }

                if (replyText) {
                  await sendText(providerConfig, sendNumber, replyText);
                }
              }
            }
          } catch (replyErr) {
            console.error('[Survey] Error sending auto-reply:', replyErr);
          }
        }

        // Save comment for recently answered survey
        if (!ratingMatch && !pendingSurvey) {
          const recentAnswered = await (prisma as any).surveyResponse.findFirst({
            where: {
              remoteJid,
              status: 'answered',
              rating: { not: null },
              comment: null,
              answeredAt: { gte: new Date(Date.now() - 10 * 60 * 1000) },
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

    console.log(`[Mega Webhook] ${fromMe ? '→' : '←'} ${remoteJid}: ${msgBody?.substring(0, 50) || msgType}`);

    return NextResponse.json({ status: 'ok' });
  } catch (error) {
    console.error('[Mega Webhook] Error:', error);
    // Always return 200 to avoid webhook retries
    return NextResponse.json({ status: 'error', message: error instanceof Error ? error.message : 'Unknown' });
  }
}

// GET — Health check
export async function GET() {
  return NextResponse.json({
    status: 'active',
    webhook: 'mega-api',
    timestamp: new Date().toISOString(),
  });
}
