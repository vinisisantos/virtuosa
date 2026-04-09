import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// GET — Fetch media (audio, image, video) from Evolution API as base64
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const unit = searchParams.get('unit') || 'Barueri';
  const messageId = searchParams.get('messageId');
  const remoteJid = searchParams.get('remoteJid');
  const fromMe = searchParams.get('fromMe') === 'true';

  if (!messageId || !remoteJid) {
    return NextResponse.json({ error: 'messageId e remoteJid obrigatórios' }, { status: 400 });
  }

  try {
    const config = await (prisma as any).evolutionConfig.findUnique({ where: { unit } });
    if (!config?.apiUrl || !config?.apiKey) {
      return NextResponse.json({ error: 'Evolution API não configurada' }, { status: 400 });
    }

    const baseUrl = config.apiUrl.replace(/\/$/, '');
    const headers = { 'apikey': config.apiKey, 'Content-Type': 'application/json' };
    const instanceName = config.instanceName || 'virtuosa';

    const res = await fetch(`${baseUrl}/chat/getBase64FromMediaMessage/${instanceName}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        message: {
          key: {
            id: messageId,
            remoteJid,
            fromMe,
          },
        },
        convertToMp4: false,
      }),
    });

    const data = await res.json();

    if (data.base64) {
      return NextResponse.json({
        base64: data.base64,
        mimetype: data.mimetype || 'audio/ogg',
        fileName: data.fileName || null,
        size: data.size || null,
      });
    }

    return NextResponse.json({ error: 'Mídia não disponível' }, { status: 404 });
  } catch (error) {
    console.error('[Evolution] Media fetch error:', error);
    return NextResponse.json({ error: 'Erro ao buscar mídia' }, { status: 502 });
  }
}
