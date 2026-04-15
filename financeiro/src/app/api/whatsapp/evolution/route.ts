import { NextRequest, NextResponse } from 'next/server';
import { requireUnitGuard } from '@/lib/unit-guard';
import { prisma } from '@/lib/db';

// Format phone number in Brazilian style: +55 11 91234-5678
function formatBrazilPhone(raw: string): string {
  // Remove any non-digit characters
  const digits = raw.replace(/\D/g, '');
  
  // Brazilian number: country code 55 + DDD (2 digits) + number (8-9 digits)
  if (digits.startsWith('55') && digits.length >= 12) {
    const ddd = digits.slice(2, 4);
    const number = digits.slice(4);
    
    if (number.length === 9) {
      // Mobile: +55 11 91234-5678
      return `+55 ${ddd} ${number.slice(0, 5)}-${number.slice(5)}`;
    } else if (number.length === 8) {
      // Landline: +55 11 1234-5678
      return `+55 ${ddd} ${number.slice(0, 4)}-${number.slice(4)}`;
    }
  }
  
  // Non-BR or short number: just add + and group
  if (digits.length > 6) {
    return `+${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4)}`;
  }
  
  return raw || 'Desconhecido';
}

// Helper to get Evolution API config
async function getConfig(unit: string) {
  const config = await (prisma as any).evolutionConfig.findUnique({ where: { unit } });
  if (!config?.apiUrl || !config?.apiKey) return null;
  return {
    baseUrl: config.apiUrl.replace(/\/$/, ''),
    headers: { 'apikey': config.apiKey, 'Content-Type': 'application/json' },
    instanceName: config.instanceName || 'virtuosa',
  };
}

// GET — Fetch chats list, messages, or media
export async function GET(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  const { searchParams } = new URL(req.url);
  const unit = searchParams.get('unit') || 'Barueri';
  const action = searchParams.get('action'); // 'chats' | 'messages' | 'media'
  const remoteJid = searchParams.get('remoteJid');
  const page = parseInt(searchParams.get('page') || '1');

  try {
    const config = await getConfig(unit);
    if (!config) {
      return NextResponse.json({ error: 'Evolution API não configurada', code: 'NOT_CONFIGURED' }, { status: 400 });
    }

    // List all chats
    if (action === 'chats' || !action) {
      // ─── 1. Fetch chats from Evolution API ───
      const chatRes = await fetch(`${config.baseUrl}/chat/findChats/${config.instanceName}`, {
        method: 'POST',
        headers: config.headers,
        body: JSON.stringify({}),
      });
      const chatData = await chatRes.json();
      const chats = Array.isArray(chatData) ? chatData : [];

      // ─── 2. Fetch contacts for name resolution ───
      let contactNameMap: Record<string, string> = {};
      try {
        const contactRes = await fetch(`${config.baseUrl}/chat/findContacts/${config.instanceName}`, {
          method: 'POST',
          headers: config.headers,
          body: JSON.stringify({}),
        });
        const contacts = await contactRes.json();
        if (Array.isArray(contacts)) {
          for (const c of contacts) {
            if (c.pushName && c.remoteJid) {
              contactNameMap[c.remoteJid] = c.pushName;
            }
          }
        }
      } catch { /* contacts fetch failed, continue without names */ }

      // ─── 3. Load cached data (unread counts, names, phone numbers) ───
      let cacheMap: Record<string, {
        lastMsgBody: string | null; lastMsgFromMe: boolean; unreadCount: number;
        lastMsgAt: Date; pushName: string | null; customName: string | null;
        phoneNumber: string | null;
      }> = {};
      try {
        const cached = await (prisma as any).evolutionChatCache.findMany({
          where: { instanceName: config.instanceName },
        });
        for (const c of cached) {
          cacheMap[c.remoteJid] = {
            lastMsgBody: c.lastMsgBody,
            lastMsgFromMe: c.lastMsgFromMe,
            unreadCount: c.unreadCount,
            lastMsgAt: c.lastMsgAt,
            pushName: c.pushName,
            customName: c.customName,
            phoneNumber: c.phoneNumber,
          };
        }
      } catch { /* cache not available */ }

      // ─── 4. Process chats: filter, deduplicate, enrich ───
      const seenJids = new Set<string>(); // Track JIDs to prevent duplicates

      const filtered = chats
        .filter((c: any) => {
          const jid = c.remoteJid || '';
          return !jid.includes('status@') && !jid.includes('@g.us');
        })
        .sort((a: any, b: any) => {
          const dateA = new Date(a.updatedAt || 0).getTime();
          const dateB = new Date(b.updatedAt || 0).getTime();
          return dateB - dateA;
        })
        .filter((c: any) => {
          const jid = c.remoteJid || '';
          // Get the alternative JID (links @lid ↔ @s.whatsapp.net)
          const altJid = c.lastMessage?.key?.remoteJidAlt || '';

          // If we already have this JID or its alt version, skip (deduplicate)
          if (seenJids.has(jid)) return false;
          if (altJid && seenJids.has(altJid)) return false;

          // Mark both as seen
          seenJids.add(jid);
          if (altJid) seenJids.add(altJid);
          return true;
        })
        .map((c: any) => {
          const cache = cacheMap[c.remoteJid];
          const lastMsg = c.lastMessage;
          const altJid = lastMsg?.key?.remoteJidAlt || '';

          // ─── Phone number resolution ───
          // Priority: cached phone > alt JID phone > JID phone
          const phoneFromAlt = altJid?.includes('@s.whatsapp.net') ? altJid.split('@')[0] : '';
          const phoneFromJid = c.remoteJid?.includes('@s.whatsapp.net') ? c.remoteJid.split('@')[0] : '';
          const rawPhone = cache?.phoneNumber || phoneFromAlt || phoneFromJid || '';

          // ─── Name resolution (priority order) ───
          // 0. Custom name saved by user in CRM (highest priority)
          // 1. Contact name from findContacts
          // 2. pushName from lastMessage (only if NOT fromMe)
          // 3. pushName from chat object
          // 4. pushName from webhook cache
          // 5. Contact name using alt JID
          // 6. Formatted phone number (always available for @s.whatsapp.net, resolved for @lid)
          const msgPushName = (!lastMsg?.key?.fromMe && lastMsg?.pushName) ? lastMsg.pushName : '';

          const name =
            cache?.customName ||
            contactNameMap[c.remoteJid] ||
            msgPushName ||
            c.pushName ||
            cache?.pushName ||
            (altJid ? contactNameMap[altJid] : '') ||
            (rawPhone ? formatBrazilPhone(rawPhone) : '');

          // ─── Last message preview ───
          let lastMsgBody = cache?.lastMsgBody || '';
          let lastMsgFromMe = cache?.lastMsgFromMe || false;
          if (lastMsg?.message) {
            const msg = lastMsg.message;
            lastMsgFromMe = lastMsg.key?.fromMe || false;
            if (msg.conversation) lastMsgBody = msg.conversation;
            else if (msg.extendedTextMessage?.text) lastMsgBody = msg.extendedTextMessage.text;
            else if (msg.imageMessage) lastMsgBody = msg.imageMessage.caption ? `📷 ${msg.imageMessage.caption}` : '📷 Foto';
            else if (msg.videoMessage) lastMsgBody = msg.videoMessage.caption ? `🎥 ${msg.videoMessage.caption}` : '🎥 Vídeo';
            else if (msg.audioMessage) lastMsgBody = '🎵 Áudio';
            else if (msg.documentMessage) lastMsgBody = `📄 ${msg.documentMessage?.fileName || 'Documento'}`;
            else if (msg.stickerMessage) lastMsgBody = '🏷️ Figurinha';
            else if (msg.contactMessage) lastMsgBody = `👤 ${msg.contactMessage?.displayName || 'Contato'}`;
            else if (msg.locationMessage) lastMsgBody = '📍 Localização';
          }

          return {
            id: c.id,
            remoteJid: c.remoteJid,
            name: name || 'Desconhecido',
            phone: rawPhone || null,
            profilePic: c.profilePicUrl || null,
            updatedAt: c.updatedAt,
            unreadCount: cache?.unreadCount || 0,
            lastMsgBody,
            lastMsgFromMe,
          };
        });

      // ─── 5. Background: resolve @lid contacts to real phone numbers ───
      // For contacts showing as 'Desconhecido' OR that lack a cached phone number
      const needsResolution = filtered.filter(c =>
        c.remoteJid.includes('@lid') && (!c.phone || c.name === 'Desconhecido')
      );
      if (needsResolution.length > 0) {
        // Fire and forget: resolve via fetchProfile (extracts wid = real phone)
        (async () => {
          for (const chat of needsResolution.slice(0, 30)) {
            try {
              const profileRes = await fetch(`${config.baseUrl}/chat/fetchProfile/${config.instanceName}`, {
                method: 'POST',
                headers: config.headers,
                body: JSON.stringify({ number: chat.remoteJid }),
              });
              const profile = await profileRes.json();

              // Extract real phone number from profile response
              // Evolution API returns wid (e.g. "5511999999999@s.whatsapp.net") or number
              const wid = profile?.wid || profile?.id || '';
              const resolvedPhone = wid.includes('@s.whatsapp.net')
                ? wid.split('@')[0]
                : (profile?.number || profile?.phone || '');

              const resolvedName = profile?.name ||
                profile?.pushName ||
                (profile?.description ? profile.description.slice(0, 50) : '') || '';

              // Save both phone number and name to cache
              const updateData: any = {};
              if (resolvedPhone) updateData.phoneNumber = resolvedPhone;
              if (resolvedName) updateData.pushName = resolvedName;

              if (Object.keys(updateData).length > 0) {
                await (prisma as any).evolutionChatCache.upsert({
                  where: { remoteJid: chat.remoteJid },
                  create: {
                    remoteJid: chat.remoteJid,
                    instanceName: config.instanceName,
                    ...updateData,
                  },
                  update: updateData,
                });
              }
            } catch { /* skip failed profiles */ }
          }
        })();
      }

      return NextResponse.json({ chats: filtered, total: filtered.length });
    }

    // Get messages for a specific chat
    if (action === 'messages' && remoteJid) {
      const res = await fetch(`${config.baseUrl}/chat/findMessages/${config.instanceName}`, {
        method: 'POST',
        headers: config.headers,
        body: JSON.stringify({
          where: { key: { remoteJid } },
          page,
          offset: 50,
        }),
      });
      const data = await res.json();
      const records = data?.messages?.records || [];

      const messages = records.map((m: any) => {
        const msg = m.message || {};
        const audioMsg = msg.audioMessage;
        const imageMsg = msg.imageMessage;
        const videoMsg = msg.videoMessage;
        const docMsg = msg.documentMessage;
        const stickerMsg = msg.stickerMessage;
        const templateMsg = msg.templateMessage;

        // Extract thumbnail as base64 data URI for images/videos/stickers
        let thumbnail: string | null = null;
        const thumbSource = imageMsg || videoMsg || stickerMsg;
        if (thumbSource?.jpegThumbnail) {
          const tb = thumbSource.jpegThumbnail;
          thumbnail = tb.startsWith('/') || tb.startsWith('data:')
            ? (tb.startsWith('data:') ? tb : `data:image/jpeg;base64,${tb}`)
            : `data:image/jpeg;base64,${tb}`;
        }

        return {
          id: m.id || m.key?.id,
          keyId: m.key?.id,
          fromMe: m.key?.fromMe || false,
          remoteJid: m.key?.remoteJid,
          pushName: m.pushName || '',
          type: m.messageType || 'conversation',
          body: extractMessageBody(m),
          timestamp: m.messageTimestamp ? new Date(m.messageTimestamp * 1000).toISOString() : m.createdAt,
          status: m.status || 'DELIVERED',
          // Media metadata
          audioDuration: audioMsg?.seconds || null,
          audioPtt: audioMsg?.ptt || false,
          mimetype: audioMsg?.mimetype || imageMsg?.mimetype || videoMsg?.mimetype || docMsg?.mimetype || null,
          hasMedia: !!(audioMsg || imageMsg || videoMsg || docMsg || stickerMsg),
          thumbnail,
          caption: imageMsg?.caption || videoMsg?.caption || null,
          fileName: docMsg?.fileName || null,
          imageWidth: imageMsg?.width || videoMsg?.width || null,
          imageHeight: imageMsg?.height || videoMsg?.height || null,
          videoSeconds: videoMsg?.seconds || null,
        };
      });

      // Reset unread count in cache when user opens conversation
      try {
        await (prisma as any).evolutionChatCache.updateMany({
          where: { remoteJid },
          data: { unreadCount: 0 },
        });
      } catch { /* cache table may not exist yet */ }

      return NextResponse.json({
        messages: messages.reverse(), // oldest first
        total: data?.messages?.total || messages.length,
        pages: data?.messages?.pages || 1,
        currentPage: data?.messages?.currentPage || page,
      });
    }

    // Download media from a message
    if (action === 'media' && remoteJid) {
      const messageId = searchParams.get('messageId');
      const fromMe = searchParams.get('fromMe') === 'true';
      if (!messageId) {
        return NextResponse.json({ error: 'messageId obrigatório' }, { status: 400 });
      }
      try {
        const mediaRes = await fetch(`${config.baseUrl}/chat/getBase64FromMediaMessage/${config.instanceName}`, {
          method: 'POST',
          headers: config.headers,
          body: JSON.stringify({
            message: { key: { remoteJid, fromMe, id: messageId } },
            convertToMp4: false,
          }),
        });
        const mediaData = await mediaRes.json();
        if (mediaData?.base64) {
          return NextResponse.json({
            base64: mediaData.base64,
            mimetype: mediaData.mimetype || 'application/octet-stream',
          });
        }
        return NextResponse.json({ error: 'Mídia não disponível' }, { status: 404 });
      } catch (err) {
        console.error('[Evolution] media download error:', err);
        return NextResponse.json({ error: 'Erro ao baixar mídia' }, { status: 502 });
      }
    }

    return NextResponse.json({ error: 'Ação inválida. Use action=chats, messages ou media' }, { status: 400 });
  } catch (error) {
    console.error('[Evolution] GET error:', error);
    return NextResponse.json({ error: 'Erro ao conectar com Evolution API' }, { status: 502 });
  }
}

// POST — Send a message
export async function POST(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  try {
    const body = await req.json();
    const { unit, remoteJid, message, mediaUrl, mediaType, audioBase64, mediaBase64, mimetype, fileName, caption } = body;
    const configUnit = unit || 'Barueri';

    const config = await getConfig(configUnit);
    if (!config) {
      return NextResponse.json({ error: 'Evolution API não configurada' }, { status: 400 });
    }

    // Normalize number: keep @lid intact (v2.3.7+), strip @s.whatsapp.net
    const sendNumber = remoteJid?.includes('@lid')
      ? remoteJid
      : remoteJid?.replace('@s.whatsapp.net', '') || remoteJid;

    // Send audio from base64 recording
    if (audioBase64) {
      const res = await fetch(`${config.baseUrl}/message/sendWhatsAppAudio/${config.instanceName}`, {
        method: 'POST',
        headers: config.headers,
        body: JSON.stringify({
          number: sendNumber,
          encoding: true,
          audio: audioBase64,
        }),
      });
      const data = await res.json();
      if (!res.ok || data?.status === 'error' || data?.statusCode >= 400) {
        console.error('[Evolution] sendAudio failed:', res.status, data);
        return NextResponse.json({ success: false, error: data?.message || data?.error || 'Erro ao enviar áudio' }, { status: 400 });
      }
      return NextResponse.json({ success: true, data });
    }

    // Send text message
    if (message && !mediaUrl) {
      // For @lid contacts, send with full JID (Evolution v2.3.7+ supports it)
      // For @s.whatsapp.net, strip the suffix (API accepts just the number)
      const phoneNumber = sendNumber;

      const res = await fetch(`${config.baseUrl}/message/sendText/${config.instanceName}`, {
        method: 'POST',
        headers: config.headers,
        body: JSON.stringify({
          number: phoneNumber,
          text: message,
        }),
      });
      let data: any;
      try {
        data = await res.json();
      } catch {
        console.error('[Evolution] sendText non-JSON response:', res.status);
        return NextResponse.json({ success: false, error: `Evolution API retornou status ${res.status}` }, { status: 502 });
      }
      if (!res.ok || data?.status === 'error' || (data?.statusCode !== undefined && data?.statusCode >= 400)) {
        console.error('[Evolution] sendText failed:', res.status, JSON.stringify(data));
        const errDetail = [data?.message, data?.error].filter(Boolean).join(' — ') || `Erro ${res.status}`;
        return NextResponse.json({ success: false, error: errDetail }, { status: 400 });
      }
      return NextResponse.json({ success: true, data });
    }

    // Send media from base64 (image/video/document from CRM upload)
    if (mediaBase64) {
      // Evolution API expects raw base64 without the data URI prefix
      const cleanBase64 = mediaBase64.includes(',') ? mediaBase64.split(',')[1] : mediaBase64;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mediaBody: any = {
        number: sendNumber,
        mediatype: mediaType || 'image',
        media: cleanBase64,
        caption: caption || message || '',
      };
      if (fileName) mediaBody.fileName = fileName;
      if (mimetype) mediaBody.mimetype = mimetype;

      const res = await fetch(`${config.baseUrl}/message/sendMedia/${config.instanceName}`, {
        method: 'POST',
        headers: config.headers,
        body: JSON.stringify(mediaBody),
      });
      let data: any;
      try {
        data = await res.json();
      } catch {
        console.error('[Evolution] sendMedia non-JSON response:', res.status);
        return NextResponse.json({ success: false, error: `Evolution API retornou status ${res.status}` }, { status: 502 });
      }
      if (!res.ok || data?.status === 'error' || (data?.statusCode !== undefined && data?.statusCode >= 400)) {
        console.error('[Evolution] sendMedia base64 failed:', res.status, JSON.stringify(data));
        const errDetail = [data?.message, data?.error, ...(Array.isArray(data?.response?.message) ? data.response.message : [])].filter(Boolean).join(' — ') || `Erro ${res.status}`;
        return NextResponse.json({ success: false, error: errDetail }, { status: 400 });
      }
      return NextResponse.json({ success: true, data });
    }

    // Send media from URL
    if (mediaUrl) {
      const endpoint = mediaType === 'audio' ? 'sendWhatsAppAudio' : 'sendMedia';
      const res = await fetch(`${config.baseUrl}/message/${endpoint}/${config.instanceName}`, {
        method: 'POST',
        headers: config.headers,
        body: JSON.stringify({
          number: sendNumber,
          media: mediaUrl,
          caption: message || '',
        }),
      });
      const data = await res.json();
      if (!res.ok || data?.status === 'error' || data?.statusCode >= 400) {
        console.error('[Evolution] sendMedia failed:', res.status, data);
        return NextResponse.json({ success: false, error: data?.message || data?.error || 'Erro ao enviar mídia' }, { status: 400 });
      }
      return NextResponse.json({ success: true, data });
    }

    return NextResponse.json({ error: 'Mensagem ou mídia obrigatória' }, { status: 400 });
  } catch (error) {
    console.error('[Evolution] POST send error:', error);
    return NextResponse.json({ error: 'Erro ao enviar mensagem' }, { status: 502 });
  }
}

// Helper to extract message text from various message types
function extractMessageBody(msg: any): string {
  const m = msg.message || {};
  if (m.conversation) return m.conversation;
  if (m.extendedTextMessage?.text) return m.extendedTextMessage.text;
  // For media: return caption if present, otherwise short label (UI renders media separately)
  if (m.imageMessage?.caption) return m.imageMessage.caption;
  if (m.imageMessage) return '';
  if (m.videoMessage?.caption) return m.videoMessage.caption;
  if (m.videoMessage) return '';
  if (m.audioMessage) return '🎵 Áudio';
  if (m.documentMessage?.fileName) return m.documentMessage.fileName;
  if (m.documentMessage) return '';
  if (m.stickerMessage) return '';
  if (m.contactMessage?.displayName) return `👤 ${m.contactMessage.displayName}`;
  if (m.locationMessage) return '📍 Localização';
  if (m.reactionMessage?.text) return `${m.reactionMessage.text}`;
  if (m.protocolMessage) return '';
  if (m.senderKeyDistributionMessage) return '';
  // Template messages — extract body text
  if (m.templateMessage) {
    const tpl = m.templateMessage;
    const hydrated = tpl.hydratedTemplate;
    if (hydrated?.hydratedContentText) return hydrated.hydratedContentText;
    if (hydrated?.hydratedTitleText) return hydrated.hydratedTitleText;
    return 'Mensagem de template';
  }
  return msg.messageType || '';
}

// PATCH — Rename a contact
export async function PATCH(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  try {
    const body = await req.json();
    const { remoteJid, customName, unit } = body;

    if (!remoteJid) {
      return NextResponse.json({ error: 'remoteJid obrigatório' }, { status: 400 });
    }

    // Resolve instanceName from config instead of hardcoding
    const configUnit = unit || 'Barueri';
    const config = await getConfig(configUnit);
    const instanceName = config?.instanceName || 'virtuosa';

    // Upsert the cache entry with the custom name
    await (prisma as any).evolutionChatCache.upsert({
      where: { remoteJid },
      create: {
        remoteJid,
        customName: customName?.trim() || null,
        instanceName,
      },
      update: {
        customName: customName?.trim() || null,
      },
    });

    return NextResponse.json({ success: true, customName: customName?.trim() || null });
  } catch (error) {
    console.error('[Evolution] PATCH error:', error);
    return NextResponse.json({ error: 'Erro ao renomear contato' }, { status: 500 });
  }
}
