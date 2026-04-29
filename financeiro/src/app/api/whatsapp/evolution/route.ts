import { NextRequest, NextResponse } from 'next/server';
import { requireUnitGuard } from '@/lib/unit-guard';
import { prisma } from '@/lib/db';
import crypto from 'crypto';
import * as wp from '@/lib/whatsapp-provider';

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

// Helper to get WhatsApp API config (supports Evolution and Mega API)
async function getConfig(unit: string, instanceName?: string) {
  let config: any = null;
  if (instanceName) {
    config = await (prisma as any).evolutionConfig.findUnique({
      where: { unit_instanceName: { unit, instanceName } },
    });
  } else {
    config = await (prisma as any).evolutionConfig.findFirst({ where: { unit } });
  }
  if (!config?.apiUrl || !config?.apiKey) return null;

  const providerType = (config.providerType || 'evolution') as 'evolution' | 'mega';
  let baseUrl = config.apiUrl.replace(/\/$/, '');
  if (providerType === 'mega' && !baseUrl.startsWith('http')) {
    baseUrl = `https://${baseUrl}`;
  }

  return {
    providerType,
    baseUrl,
    headers: providerType === 'mega'
      ? { 'Authorization': `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' } as Record<string, string>
      : { 'apikey': config.apiKey, 'Content-Type': 'application/json' } as Record<string, string>,
    instanceName: config.instanceName || 'virtuosa',
    label: config.label || config.instanceName || 'Principal',
    apiKey: config.apiKey,
  };
}

// GET — Fetch chats list, messages, or media
export async function GET(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  const { searchParams } = new URL(req.url);
  const unit = searchParams.get('unit') || 'Barueri';
  const action = searchParams.get('action'); // 'chats' | 'messages' | 'media' | 'instances'
  const remoteJid = searchParams.get('remoteJid');
  const page = parseInt(searchParams.get('page') || '1');
  const instanceParam = searchParams.get('instance') || undefined;

  try {
    // ─── List all instances for this unit ───
    if (action === 'instances') {
      const instances = await (prisma as any).evolutionConfig.findMany({
        where: { unit },
        select: {
          id: true, instanceName: true, label: true, isConnected: true,
          phoneNumber: true, profileName: true, lastConnected: true,
        },
        orderBy: { createdAt: 'asc' },
      });
      return NextResponse.json({ instances });
    }

    // ─── List ALL instances across ALL units (for admin panel) ───
    if (action === 'all_instances') {
      const instances = await (prisma as any).evolutionConfig.findMany({
        select: {
          id: true, instanceName: true, label: true, unit: true,
          isConnected: true, phoneNumber: true, profileName: true,
        },
        orderBy: [{ unit: 'asc' }, { createdAt: 'asc' }],
      });
      return NextResponse.json({ instances });
    }

    const config = await getConfig(unit, instanceParam);
    if (!config) {
      return NextResponse.json({ error: 'Evolution API não configurada', code: 'NOT_CONFIGURED' }, { status: 400 });
    }

    // List all chats
    if (action === 'chats' || !action) {
      // ─── 1. Fetch chats from API (Evolution only — Mega API has no chat listing) ───
      let chats: any[] = [];
      let contactNameMap: Record<string, string> = {};

      if (config.providerType !== 'mega') {
        const chatRes = await fetch(`${config.baseUrl}/chat/findChats/${config.instanceName}`, {
          method: 'POST',
          headers: config.headers,
          body: JSON.stringify({}),
        });
        const chatData = await chatRes.json();
        chats = Array.isArray(chatData) ? chatData : [];

        // Fetch contacts for name resolution (Evolution only)
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
      }

      // ─── 2. Load cached data (unread counts, names, phone numbers) ───
      let cacheMap: Record<string, {
        lastMsgBody: string | null; lastMsgFromMe: boolean; unreadCount: number;
        lastMsgAt: Date; pushName: string | null; customName: string | null;
        phoneNumber: string | null; profilePicUrl: string | null;
        lastMsgType: string | null;
        adTitle: string | null; adBody: string | null; adSourceUrl: string | null;
        isLead: boolean; clientId: string | null;
        status: string; closedAt: Date | null;
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
            profilePicUrl: c.profilePicUrl || null,
            lastMsgType: c.lastMsgType || null,
            adTitle: c.adTitle || null,
            adBody: c.adBody || null,
            adSourceUrl: c.adSourceUrl || null,
            isLead: c.isLead || false,
            clientId: c.clientId || null,
            status: c.status || 'aberta',
            closedAt: c.closedAt || null,
          };
        }
      } catch { /* cache not available */ }

      // ─── 4. Load hidden chats (excluded by user) ───
      let hiddenJids = new Set<string>();
      try {
        const hidden: any[] = await (prisma as any).$queryRawUnsafe(
          `SELECT "remoteJid" FROM "HiddenChat" WHERE unit = $1`,
          unit
        );
        for (const h of hidden) {
          const raw = h.remoteJid || '';
          hiddenJids.add(raw);
          // Also add normalized versions for flexible matching
          const digits = raw.replace(/@.*$/, '');
          hiddenJids.add(digits);
          hiddenJids.add(digits + '@s.whatsapp.net');
          hiddenJids.add(digits + '@lid');
        }
      } catch (e) { console.warn('[HiddenChat] load error:', e); }

      // ─── 5. Process chats ───
      // For Mega API: build chat list entirely from cache (no API listing available)
      if (config.providerType === 'mega') {
        const allChats = Object.entries(cacheMap)
          .filter(([jid]) => {
            const jidDigits = jid.replace(/@.*$/, '');
            return !jid.includes('status@') && !jid.includes('@g.us') && !jid.includes('@newsletter') && !hiddenJids.has(jid) && !hiddenJids.has(jidDigits);
          })
          .sort(([, a], [, b]) => new Date(b.lastMsgAt).getTime() - new Date(a.lastMsgAt).getTime())
          .map(([jid, cache]) => {
            const phoneFromJid = jid.includes('@s.whatsapp.net') ? jid.split('@')[0] : '';
            const rawPhone = cache.phoneNumber || phoneFromJid || '';
            // Name resolution priority: customName > pushName > formatted phone > LID partial ID
            let name = cache.customName || cache.pushName || '';
            if (!name && rawPhone) {
              name = formatBrazilPhone(rawPhone);
            } else if (!name && jid.includes('@lid')) {
              const lidId = jid.split('@')[0];
              name = `Contato #${lidId.slice(-4)}`;
            } else if (!name) {
              name = 'Desconhecido';
            }

            return {
              id: jid,
              remoteJid: jid,
              name,
              phone: rawPhone || null,
              profilePic: cache.profilePicUrl || null,
              updatedAt: cache.lastMsgAt,
              unreadCount: cache.unreadCount || 0,
              lastMsgBody: cache.lastMsgBody || '',
              lastMsgFromMe: cache.lastMsgFromMe || false,
              lastMsgType: cache.lastMsgType || null,
              adTitle: cache.adTitle || null,
              adBody: cache.adBody || null,
              adSourceUrl: cache.adSourceUrl || null,
              isLead: cache.isLead || false,
              clientId: cache.clientId || null,
              status: cache.status || 'aberta',
              closedAt: cache.closedAt || null,
            };
          });

        // ─── Deduplicate: merge LID + Phone JID pairs for the same contact ───
        // If same pushName appears on both a @lid and @s.whatsapp.net JID, keep the most recent one
        const seenNames = new Map<string, number>(); // name -> index
        const cacheChats: typeof allChats = [];
        for (const chat of allChats) {
          // Only deduplicate when name is a real pushName (not generated like "Contato #XXXX" or phone number)
          const isPushName = chat.name && !chat.name.startsWith('Contato #') && !chat.name.startsWith('(') && !chat.name.startsWith('+');
          if (isPushName && seenNames.has(chat.name)) {
            // Duplicate found — merge unread counts into the one we already have
            const existingIdx = seenNames.get(chat.name)!;
            cacheChats[existingIdx].unreadCount += chat.unreadCount;
            continue;
          }
          if (isPushName) {
            seenNames.set(chat.name, cacheChats.length);
          }
          cacheChats.push(chat);
        }

        // ─── Background: fetch profile pictures for contacts without one ───
        const needsPic = cacheChats.filter(c => !c.profilePic);
        if (needsPic.length > 0) {
          (async () => {
            for (const chat of needsPic.slice(0, 15)) {
              try {
                // Use JID directly for LID contacts, phone for normal contacts
                const toParam = chat.remoteJid.includes('@lid')
                  ? chat.remoteJid
                  : (chat.phone || chat.remoteJid);
                const picRes = await fetch(
                  `${config.baseUrl}/rest/instance/getProfilePicture/${config.instanceName}?to=${encodeURIComponent(toParam)}`,
                  { headers: config.headers }
                );
                const picData = await picRes.json();
                const picUrl = picData?.data || picData?.profilePictureUrl || picData?.profilePicUrl || picData?.imgUrl || picData?.url || null;
                if (picUrl && typeof picUrl === 'string' && picUrl.startsWith('http')) {
                  await (prisma as any).evolutionChatCache.update({
                    where: { remoteJid: chat.remoteJid },
                    data: { profilePicUrl: picUrl },
                  });
                }
              } catch { /* skip */ }
            }
          })();
        }

        // ─── Background: resolve names for LID contacts missing pushName ───
        const needsName = cacheChats.filter(c => c.name === 'Desconhecido' && c.remoteJid.includes('@lid'));
        if (needsName.length > 0) {
          (async () => {
            try {
              // Try to find pushNames from received messages
              const jids = needsName.map(c => c.remoteJid);
              const msgNames: any[] = await (prisma as any).evolutionMessage.findMany({
                where: {
                  remoteJid: { in: jids },
                  fromMe: false,
                  pushName: { not: null },
                },
                distinct: ['remoteJid'],
                select: { remoteJid: true, pushName: true },
              });
              for (const mn of msgNames) {
                if (mn.pushName && mn.pushName !== 'null' && mn.pushName.trim()) {
                  await (prisma as any).evolutionChatCache.update({
                    where: { remoteJid: mn.remoteJid },
                    data: { pushName: mn.pushName },
                  });
                }
              }
            } catch { /* skip */ }
          })();
        }

        return NextResponse.json({ chats: cacheChats, total: cacheChats.length });
      }

      // ─── Evolution API: filter, deduplicate, enrich from API data ───
      const seenJids = new Set<string>();

      const filtered = chats
        .filter((c: any) => {
          const jid = c.remoteJid || '';
          const jidDigits = jid.replace(/@.*$/, '');
          return !jid.includes('status@') && !jid.includes('@g.us') && !hiddenJids.has(jid) && !hiddenJids.has(jidDigits);
        })
        .sort((a: any, b: any) => {
          const dateA = new Date(a.updatedAt || 0).getTime();
          const dateB = new Date(b.updatedAt || 0).getTime();
          return dateB - dateA;
        })
        .filter((c: any) => {
          const jid = c.remoteJid || '';
          const altJid = c.lastMessage?.key?.remoteJidAlt || '';
          if (seenJids.has(jid)) return false;
          if (altJid && seenJids.has(altJid)) return false;
          seenJids.add(jid);
          if (altJid) seenJids.add(altJid);
          return true;
        })
        .map((c: any) => {
          const cache = cacheMap[c.remoteJid];
          const lastMsg = c.lastMessage;
          const altJid = lastMsg?.key?.remoteJidAlt || '';

          const phoneFromAlt = altJid?.includes('@s.whatsapp.net') ? altJid.split('@')[0] : '';
          const phoneFromJid = c.remoteJid?.includes('@s.whatsapp.net') ? c.remoteJid.split('@')[0] : '';
          const rawPhone = cache?.phoneNumber || phoneFromAlt || phoneFromJid || '';

          const msgPushName = (!lastMsg?.key?.fromMe && lastMsg?.pushName) ? lastMsg.pushName : '';
          const name =
            cache?.customName ||
            contactNameMap[c.remoteJid] ||
            msgPushName ||
            c.pushName ||
            cache?.pushName ||
            (altJid ? contactNameMap[altJid] : '') ||
            (rawPhone ? formatBrazilPhone(rawPhone) : '');

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
            adTitle: cache?.adTitle || null,
            adBody: cache?.adBody || null,
            adSourceUrl: cache?.adSourceUrl || null,
            isLead: cache?.isLead || false,
            clientId: cache?.clientId || null,
            status: cache?.status || 'aberta',
            closedAt: cache?.closedAt || null,
          };
        });

      // ─── Background: resolve @lid contacts (Evolution only) ───
      const needsResolution = filtered.filter(c =>
        c.remoteJid.includes('@lid') && (!c.phone || c.name === 'Desconhecido')
      );
      if (needsResolution.length > 0) {
        (async () => {
          for (const chat of needsResolution.slice(0, 30)) {
            try {
              const profileRes = await fetch(`${config.baseUrl}/chat/fetchProfile/${config.instanceName}`, {
                method: 'POST',
                headers: config.headers,
                body: JSON.stringify({ number: chat.remoteJid }),
              });
              const profile = await profileRes.json();
              const wid = profile?.wid || profile?.id || '';
              const resolvedPhone = wid.includes('@s.whatsapp.net')
                ? wid.split('@')[0]
                : (profile?.number || profile?.phone || '');
              const resolvedName = profile?.name ||
                profile?.pushName ||
                (profile?.description ? profile.description.slice(0, 50) : '') || '';
              const updateData: any = {};
              if (resolvedPhone) updateData.phoneNumber = resolvedPhone;
              if (resolvedName) updateData.pushName = resolvedName;
              if (Object.keys(updateData).length > 0) {
                await (prisma as any).evolutionChatCache.upsert({
                  where: { remoteJid: chat.remoteJid },
                  create: { remoteJid: chat.remoteJid, instanceName: config.instanceName, ...updateData },
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
      // Mega API: read messages from local EvolutionMessage table (stored via webhook)
      if (config.providerType === 'mega') {
        try {
          await (prisma as any).evolutionChatCache.updateMany({
            where: { remoteJid },
            data: { unreadCount: 0 },
          });
        } catch { /* ignore */ }

        const pageSize = 50;
        const skip = (page - 1) * pageSize;

        try {
          const [dbMessages, totalCount] = await Promise.all([
            (prisma as any).evolutionMessage.findMany({
              where: { remoteJid },
              orderBy: { timestamp: 'desc' },
              take: pageSize,
              skip,
            }),
            (prisma as any).evolutionMessage.count({ where: { remoteJid } }),
          ]);

          const messages = dbMessages.reverse().map((m: any) => ({
            id: m.id,
            keyId: m.keyId,
            fromMe: m.fromMe,
            remoteJid: m.remoteJid,
            pushName: m.pushName || '',
            type: m.type || 'conversation',
            body: m.body || m.caption || '',
            timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : m.timestamp,
            status: m.status || 'delivered',
            audioDuration: m.audioDuration || null,
            audioPtt: m.audioPtt || false,
            mimetype: m.mimetype || null,
            hasMedia: m.hasMedia || false,
            thumbnail: m.thumbnail || null,
            caption: m.caption || null,
            fileName: m.fileName || null,
            mediaKey: m.mediaKey || null,
            directPath: m.directPath || null,
            mediaUrl: m.mediaUrl || null,
            adReply: m.adTitle || m.adBody ? {
              title: m.adTitle || undefined,
              body: m.adBody || undefined,
              sourceUrl: m.adSourceUrl || undefined,
            } : null,
          }));

          return NextResponse.json({
            messages,
            total: totalCount,
            pages: Math.ceil(totalCount / pageSize),
            currentPage: page,
          });
        } catch (dbErr) {
          console.error('[Mega] Error reading messages from DB:', dbErr);
          return NextResponse.json({
            messages: [],
            total: 0,
            pages: 1,
            currentPage: page,
          });
        }
      }

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

        let thumbnail: string | null = null;
        const thumbSource = imageMsg || videoMsg || stickerMsg;
        if (thumbSource?.jpegThumbnail) {
          const tb = thumbSource.jpegThumbnail;
          thumbnail = tb.startsWith('/') || tb.startsWith('data:')
            ? (tb.startsWith('data:') ? tb : `data:image/jpeg;base64,${tb}`)
            : `data:image/jpeg;base64,${tb}`;
        }

        let adReply: { title?: string; body?: string; sourceUrl?: string; thumbnailUrl?: string } | null = null;
        const ctxInfo =
          msg.extendedTextMessage?.contextInfo ||
          msg.imageMessage?.contextInfo ||
          msg.videoMessage?.contextInfo ||
          msg.contextInfo;
        if (ctxInfo?.externalAdReply) {
          const ear = ctxInfo.externalAdReply;
          adReply = {
            title: ear.title || undefined,
            body: ear.body || undefined,
            sourceUrl: ear.sourceUrl || ear.url || undefined,
            thumbnailUrl: ear.thumbnailUrl || undefined,
          };
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
          adReply,
        };
      });

      try {
        await (prisma as any).evolutionChatCache.updateMany({
          where: { remoteJid },
          data: { unreadCount: 0 },
        });
      } catch { /* cache table may not exist yet */ }

      return NextResponse.json({
        messages: messages.reverse(),
        total: data?.messages?.total || messages.length,
        pages: data?.messages?.pages || 1,
        currentPage: data?.messages?.currentPage || page,
      });
    }

    // Download media from a message
    if (action === 'media' && remoteJid) {
      const messageId = searchParams.get('messageId');
      const fromMe = searchParams.get('fromMe') === 'true';

      if (config.providerType === 'mega') {
        // Mega API: POST /rest/instance/downloadMediaMessage/{key}
        const mediaKey = searchParams.get('mediaKey');
        const directPath = searchParams.get('directPath');
        const mediaUrl = searchParams.get('mediaUrl');
        const mediaMimetype = searchParams.get('mimetype');
        const messageType = searchParams.get('messageType');
        try {
          const mediaRes = await fetch(`${config.baseUrl}/rest/instance/downloadMediaMessage/${config.instanceName}`, {
            method: 'POST',
            headers: config.headers,
            body: JSON.stringify({
              messageKeys: {
                mediaKey: mediaKey || '',
                directPath: directPath || '',
                url: mediaUrl || '',
                mimetype: mediaMimetype || 'application/octet-stream',
                messageType: messageType || 'document',
              },
            }),
          });
          const mediaData = await mediaRes.json();
          if (mediaData?.base64) {
            return NextResponse.json({
              base64: mediaData.base64,
              mimetype: mediaData.mimetype || mediaMimetype || 'application/octet-stream',
            });
          }
          return NextResponse.json({ error: 'Mídia não disponível' }, { status: 404 });
        } catch (err) {
          console.error('[Mega] media download error:', err);
          return NextResponse.json({ error: 'Erro ao baixar mídia' }, { status: 502 });
        }
      }

      // Evolution API
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
    const { unit, instance, remoteJid, message, mediaUrl, mediaType, audioBase64, mediaBase64, mimetype, fileName, caption } = body;
    const configUnit = unit || 'Barueri';

    const config = await getConfig(configUnit, instance || undefined);
    if (!config) {
      return NextResponse.json({ error: 'WhatsApp API não configurada' }, { status: 400 });
    }

    // Normalize number
    const sendNumber = remoteJid?.includes('@lid')
      ? remoteJid
      : remoteJid?.replace('@s.whatsapp.net', '') || remoteJid;

    // ─── Mega API: use provider abstraction ───
    if (config.providerType === 'mega') {
      const providerConfig = wp.buildProviderConfig({
        providerType: 'mega', apiUrl: config.baseUrl, apiKey: config.apiKey,
        instanceName: config.instanceName, label: config.label,
      });
      if (!providerConfig) {
        return NextResponse.json({ error: 'Mega API config inválida' }, { status: 400 });
      }

      try {
        let data: any;

        if (audioBase64) {
          data = await wp.sendAudioPtt(providerConfig, sendNumber, audioBase64, true);
        } else if (message && !mediaUrl && !mediaBase64) {
          data = await wp.sendText(providerConfig, sendNumber, message);
        } else if (mediaBase64) {
          const cleanBase64 = mediaBase64.includes(',') ? mediaBase64.split(',')[1] : mediaBase64;
          data = await wp.sendMediaBase64(providerConfig, sendNumber, cleanBase64, {
            type: mediaType || 'image', caption: caption || message || '',
            mimeType: mimetype, fileName,
          });
        } else if (mediaUrl) {
          data = await wp.sendMediaUrl(providerConfig, sendNumber, mediaUrl, {
            type: mediaType || 'document', caption: message || '',
            mimeType: mimetype, fileName,
          });
        } else {
          return NextResponse.json({ error: 'Mensagem ou mídia obrigatória' }, { status: 400 });
        }

        if (data?.error) {
          console.error('[Mega] send failed:', JSON.stringify(data));
          return NextResponse.json({ success: false, error: data.message || data.error || 'Erro ao enviar' }, { status: 400 });
        }

        // Save outbound message to EvolutionMessage table
        const outKeyId = data?.key?.id || data?.messageId || `out_${Date.now()}`;
        const outJid = remoteJid || `${sendNumber}@s.whatsapp.net`;
        try {
          let outBody = message || caption || '';
          let outType = 'conversation';
          let outHasMedia = false;
          let outMimetype: string | null = null;
          let outFileName: string | null = null;

          if (audioBase64) {
            outType = 'audioMessage';
            outHasMedia = true;
            outMimetype = 'audio/ogg; codecs=opus';
            outBody = '';
          } else if (mediaBase64 || mediaUrl) {
            outHasMedia = true;
            outMimetype = mimetype || null;
            outFileName = fileName || null;
            if (mediaType === 'image') outType = 'imageMessage';
            else if (mediaType === 'video') outType = 'videoMessage';
            else if (mediaType === 'audio') outType = 'audioMessage';
            else outType = 'documentMessage';
          }

          await (prisma as any).evolutionMessage.upsert({
            where: { remoteJid_keyId: { remoteJid: outJid, keyId: outKeyId } },
            create: {
              remoteJid: outJid,
              instanceName: config.instanceName,
              keyId: outKeyId,
              fromMe: true,
              body: outBody || null,
              type: outType,
              timestamp: new Date(),
              status: 'sent',
              hasMedia: outHasMedia,
              mimetype: outMimetype,
              fileName: outFileName,
              caption: caption || null,
            },
            update: { status: 'sent' },
          });
        } catch (saveErr) {
          console.error('[Mega] Error saving outbound message:', saveErr);
        }

        return NextResponse.json({ success: true, data });
      } catch (err) {
        console.error('[Mega] POST send error:', err);
        return NextResponse.json({ error: 'Erro ao enviar via Mega API' }, { status: 502 });
      }
    }

    // ─── Evolution API: original implementation ───
    if (audioBase64) {
      const res = await fetch(`${config.baseUrl}/message/sendWhatsAppAudio/${config.instanceName}`, {
        method: 'POST', headers: config.headers,
        body: JSON.stringify({ number: sendNumber, encoding: true, audio: audioBase64 }),
      });
      const data = await res.json();
      if (!res.ok || data?.status === 'error' || data?.statusCode >= 400) {
        console.error('[Evolution] sendAudio failed:', res.status, data);
        return NextResponse.json({ success: false, error: data?.message || data?.error || 'Erro ao enviar áudio' }, { status: 400 });
      }
      return NextResponse.json({ success: true, data });
    }

    if (message && !mediaUrl) {
      const res = await fetch(`${config.baseUrl}/message/sendText/${config.instanceName}`, {
        method: 'POST', headers: config.headers,
        body: JSON.stringify({ number: sendNumber, text: message }),
      });
      let data: any;
      try { data = await res.json(); } catch {
        return NextResponse.json({ success: false, error: `Evolution API retornou status ${res.status}` }, { status: 502 });
      }
      if (!res.ok || data?.status === 'error' || (data?.statusCode !== undefined && data?.statusCode >= 400)) {
        const errDetail = [data?.message, data?.error].filter(Boolean).join(' — ') || `Erro ${res.status}`;
        return NextResponse.json({ success: false, error: errDetail }, { status: 400 });
      }
      return NextResponse.json({ success: true, data });
    }

    if (mediaBase64) {
      const cleanBase64 = mediaBase64.includes(',') ? mediaBase64.split(',')[1] : mediaBase64;
      const mediaBody: any = {
        number: sendNumber, mediatype: mediaType || 'image',
        media: cleanBase64, caption: caption || message || '',
      };
      if (fileName) mediaBody.fileName = fileName;
      if (mimetype) mediaBody.mimetype = mimetype;
      const res = await fetch(`${config.baseUrl}/message/sendMedia/${config.instanceName}`, {
        method: 'POST', headers: config.headers, body: JSON.stringify(mediaBody),
      });
      let data: any;
      try { data = await res.json(); } catch {
        return NextResponse.json({ success: false, error: `Evolution API retornou status ${res.status}` }, { status: 502 });
      }
      if (!res.ok || data?.status === 'error' || (data?.statusCode !== undefined && data?.statusCode >= 400)) {
        const errDetail = [data?.message, data?.error, ...(Array.isArray(data?.response?.message) ? data.response.message : [])].filter(Boolean).join(' — ') || `Erro ${res.status}`;
        return NextResponse.json({ success: false, error: errDetail }, { status: 400 });
      }
      return NextResponse.json({ success: true, data });
    }

    if (mediaUrl) {
      const endpoint = mediaType === 'audio' ? 'sendWhatsAppAudio' : 'sendMedia';
      const res = await fetch(`${config.baseUrl}/message/${endpoint}/${config.instanceName}`, {
        method: 'POST', headers: config.headers,
        body: JSON.stringify({ number: sendNumber, media: mediaUrl, caption: message || '' }),
      });
      const data = await res.json();
      if (!res.ok || data?.status === 'error' || data?.statusCode >= 400) {
        return NextResponse.json({ success: false, error: data?.message || data?.error || 'Erro ao enviar mídia' }, { status: 400 });
      }
      return NextResponse.json({ success: true, data });
    }

    return NextResponse.json({ error: 'Mensagem ou mídia obrigatória' }, { status: 400 });
  } catch (error) {
    console.error('[WhatsApp] POST send error:', error);
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

// PATCH — Update contact name or conversation status
export async function PATCH(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  try {
    const body = await req.json();
    const { remoteJid, customName, status, unit, instance } = body;

    if (!remoteJid) {
      return NextResponse.json({ error: 'remoteJid obrigatório' }, { status: 400 });
    }

    // Resolve instanceName from config instead of hardcoding
    const configUnit = unit || 'Barueri';
    const config = await getConfig(configUnit, instance || undefined);
    const instanceName = config?.instanceName || 'virtuosa';

    // Build update data
    const updateData: any = {};
    const createData: any = { remoteJid, instanceName };

    // Handle custom name
    if (customName !== undefined) {
      updateData.customName = customName?.trim() || null;
      createData.customName = customName?.trim() || null;
    }

    // Handle status changes
    if (status) {
      updateData.status = status;
      createData.status = status;
      if (status === 'finalizada') {
        updateData.closedAt = new Date();
        createData.closedAt = new Date();
      } else {
        // When reopening, clear closedAt
        updateData.closedAt = null;
      }
    }

    // Upsert the cache entry
    await (prisma as any).evolutionChatCache.upsert({
      where: { remoteJid },
      create: createData,
      update: updateData,
    });

    // ─── Send satisfaction survey when finalizing ───
    if (status === 'finalizada' && config) {
      try {
        // Get contact info from cache
        const chatCache = await (prisma as any).evolutionChatCache.findUnique({
          where: { remoteJid },
          select: { customName: true, pushName: true, phoneNumber: true },
        });
        const contactName = chatCache?.customName || chatCache?.pushName || 'Cliente';
        const firstName = contactName.split(' ')[0];
        const phone = chatCache?.phoneNumber || remoteJid.replace('@s.whatsapp.net', '').replace('@lid', '');

        // Check if there's already a pending/sent survey for this contact (avoid duplicates)
        const existingSurvey = await (prisma as any).surveyResponse.findFirst({
          where: {
            remoteJid,
            status: { in: ['scheduled', 'sent'] },
            createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // last 24h
          },
        });

        if (!existingSurvey) {
          // Build survey message
          const surveyMsg =
            `Olá ${firstName}! 😊\n\n` +
            `Agradecemos por entrar em contato com a *Virtuosa*! 💜\n` +
            `Gostaríamos de saber como foi seu atendimento.\n\n` +
            `Responda com uma nota de *1 a 5*:\n` +
            `1 ⭐ Ruim\n` +
            `2 ⭐⭐ Regular\n` +
            `3 ⭐⭐⭐ Bom\n` +
            `4 ⭐⭐⭐⭐ Muito bom\n` +
            `5 ⭐⭐⭐⭐⭐ Excelente`;

          // Send immediately via WhatsApp provider
          const sendNumber = remoteJid.includes('@lid')
            ? remoteJid
            : remoteJid.replace('@s.whatsapp.net', '');

          const providerConfig = wp.buildProviderConfig({
            providerType: config.providerType || 'evolution',
            apiUrl: config.baseUrl, apiKey: config.apiKey,
            instanceName: config.instanceName, label: config.label,
          });

          let sendRes = { ok: false };
          if (providerConfig) {
            try {
              await wp.sendText(providerConfig, sendNumber, surveyMsg);
              sendRes = { ok: true };
            } catch { /* send failed */ }
          }

          // Create SurveyResponse record
          await (prisma as any).surveyResponse.create({
            data: {
              clientName: contactName,
              clientPhone: phone,
              remoteJid,
              unit: configUnit,
              procedimento: 'Atendimento WhatsApp',
              scheduledFor: new Date(),
              sentAt: sendRes.ok ? new Date() : null,
              status: sendRes.ok ? 'sent' : 'expired',
            },
          });

          console.log(`[Finalize] Survey sent to ${contactName} (${remoteJid})`);
        }
      } catch (surveyErr) {
        console.error('[Finalize] Error sending survey:', surveyErr);
        // Don't fail the finalization if survey fails
      }
    }

    return NextResponse.json({
      success: true,
      customName: customName !== undefined ? (customName?.trim() || null) : undefined,
      status: status || undefined,
    });
  } catch (error) {
    console.error('[Evolution] PATCH error:', error);
    return NextResponse.json({ error: 'Erro ao atualizar conversa' }, { status: 500 });
  }
}

// DELETE — Hide a chat from CRM view (Evolution API doesn't support chat deletion)
export async function DELETE(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  try {
    const body = await req.json();
    const { unit, remoteJid, instance } = body;

    if (!unit || !remoteJid) {
      return NextResponse.json({ error: 'unit and remoteJid required' }, { status: 400 });
    }

    // Normalize remoteJid: extract digits and also store with @s.whatsapp.net
    const digits = remoteJid.replace(/@.*$/, '');
    const fullJid = digits.includes('@') ? digits : digits + '@s.whatsapp.net';
    console.log('[HiddenChat] Saving:', { unit, instance, remoteJid, digits, fullJid });

    // Store in database as hidden chat
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const instName = instance || '';
    try {
      // Save the full JID version for better matching
      await (prisma as any).$executeRawUnsafe(
        `INSERT INTO "HiddenChat" (id, unit, "instanceName", "remoteJid", "createdAt")
         VALUES ('${id}', '${unit}', '${instName}', '${fullJid}', '${now}')
         ON CONFLICT (unit, "instanceName", "remoteJid") DO NOTHING`
      );
      console.log('[HiddenChat] Saved successfully:', fullJid);
    } catch (e) {
      console.warn('[HiddenChat] Save error:', e);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Evolution] DELETE error:', error);
    return NextResponse.json({ error: 'Erro ao excluir chat' }, { status: 500 });
  }
}
