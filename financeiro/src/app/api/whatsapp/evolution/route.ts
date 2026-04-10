import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

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

// GET — Fetch chats list or messages for a specific chat
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const unit = searchParams.get('unit') || 'Barueri';
  const action = searchParams.get('action'); // 'chats' | 'messages'
  const remoteJid = searchParams.get('remoteJid');
  const page = parseInt(searchParams.get('page') || '1');

  try {
    const config = await getConfig(unit);
    if (!config) {
      return NextResponse.json({ error: 'Evolution API não configurada' }, { status: 400 });
    }

    // List all chats
    if (action === 'chats' || !action) {
      const res = await fetch(`${config.baseUrl}/chat/findChats/${config.instanceName}`, {
        method: 'POST',
        headers: config.headers,
        body: JSON.stringify({}),
      });
      const data = await res.json();
      const chats = Array.isArray(data) ? data : [];

      // Load cached previews from webhook data
      let cacheMap: Record<string, { lastMsgBody: string | null; lastMsgFromMe: boolean; unreadCount: number; lastMsgAt: Date }> = {};
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
          };
        }
      } catch { /* cache table may not exist yet */ }

      // Filter only individual chats (not groups), sort by most recent
      const filtered = chats
        .filter((c: any) => {
          const jid = c.remoteJid || '';
          return !jid.includes('status@') && !jid.includes('@g.us');
        })
        .sort((a: any, b: any) => {
          // Prefer cache timestamp for sorting (more accurate)
          const dateA = cacheMap[a.remoteJid]?.lastMsgAt?.getTime() || new Date(a.updatedAt || 0).getTime();
          const dateB = cacheMap[b.remoteJid]?.lastMsgAt?.getTime() || new Date(b.updatedAt || 0).getTime();
          return dateB - dateA;
        })
        .map((c: any) => {
          const cache = cacheMap[c.remoteJid];
          return {
            id: c.id,
            remoteJid: c.remoteJid,
            name: c.pushName || cache?.lastMsgBody ? (c.pushName || c.remoteJid?.split('@')[0]) : 'Desconhecido',
            profilePic: c.profilePicUrl || null,
            updatedAt: cache?.lastMsgAt?.toISOString() || c.updatedAt,
            unreadCount: cache?.unreadCount || 0,
            lastMsgBody: cache?.lastMsgBody || '',
            lastMsgFromMe: cache?.lastMsgFromMe || false,
          };
        });

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
          hasMedia: !!(audioMsg || imageMsg || videoMsg || docMsg),
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

    return NextResponse.json({ error: 'Ação inválida. Use action=chats ou action=messages' }, { status: 400 });
  } catch (error) {
    console.error('[Evolution] GET error:', error);
    return NextResponse.json({ error: 'Erro ao conectar com Evolution API' }, { status: 502 });
  }
}

// POST — Send a message
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { unit, remoteJid, message, mediaUrl, mediaType, audioBase64 } = body;
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

    // Send media message
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
  if (m.imageMessage?.caption) return `📷 ${m.imageMessage.caption}`;
  if (m.imageMessage) return '📷 Imagem';
  if (m.videoMessage?.caption) return `🎥 ${m.videoMessage.caption}`;
  if (m.videoMessage) return '🎥 Vídeo';
  if (m.audioMessage) return '🎵 Áudio';
  if (m.documentMessage?.fileName) return `📄 ${m.documentMessage.fileName}`;
  if (m.documentMessage) return '📄 Documento';
  if (m.stickerMessage) return '🏷️ Sticker';
  if (m.contactMessage?.displayName) return `👤 ${m.contactMessage.displayName}`;
  if (m.locationMessage) return '📍 Localização';
  if (m.reactionMessage?.text) return `${m.reactionMessage.text}`;
  if (m.protocolMessage) return '';
  if (m.senderKeyDistributionMessage) return '';
  return msg.messageType || '';
}
