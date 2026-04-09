import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// GET — Get session status + QR code (proxy to Evolution API)
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const unit = searchParams.get('unit') || 'Barueri';
  const action = searchParams.get('action'); // 'qrcode' | 'status' | 'config'

  try {
    const config = await prisma.evolutionConfig.findUnique({ where: { unit } });

    // Return config (masked)
    if (action === 'config' || !action) {
      const maskToken = (t: string | null) => {
        if (!t) return '';
        if (t.length <= 8) return '****';
        return t.substring(0, 4) + '****' + t.substring(t.length - 4);
      };

      return NextResponse.json({
        configured: !!(config?.apiUrl && config?.apiKey),
        apiUrl: config?.apiUrl || '',
        apiKeyMasked: maskToken(config?.apiKey || null),
        instanceName: config?.instanceName || 'virtuosa-default',
        isConnected: config?.isConnected || false,
        phoneNumber: config?.phoneNumber || null,
        profileName: config?.profileName || null,
        lastConnected: config?.lastConnected || null,
      });
    }

    if (!config?.apiUrl || !config?.apiKey) {
      return NextResponse.json({ error: 'Evolution API não configurada. Preencha a URL e API Key.' }, { status: 400 });
    }

    const baseUrl = config.apiUrl.replace(/\/$/, '');
    const headers = { 'apikey': config.apiKey, 'Content-Type': 'application/json' };

    // Get connection status
    if (action === 'status') {
      try {
        const res = await fetch(`${baseUrl}/instance/connectionState/${config.instanceName}`, { headers });
        const data = await res.json();

        const isConnected = data?.instance?.state === 'open';

        // Update DB if status changed
        if (isConnected !== config.isConnected) {
          await prisma.evolutionConfig.update({
            where: { unit },
            data: {
              isConnected,
              ...(isConnected ? { lastConnected: new Date() } : {}),
            },
          });
        }

        return NextResponse.json({
          state: data?.instance?.state || 'close',
          isConnected,
          profileName: config.profileName,
          phoneNumber: config.phoneNumber,
        });
      } catch (fetchError) {
        console.error('[Evolution] Status fetch error:', fetchError);
        return NextResponse.json({ state: 'close', isConnected: false, error: 'Não foi possível conectar ao servidor Evolution' });
      }
    }

    // Get QR code
    if (action === 'qrcode') {
      try {
        const res = await fetch(`${baseUrl}/instance/connect/${config.instanceName}`, { headers });
        const data = await res.json();

        return NextResponse.json({
          qrcode: data?.base64 || data?.qrcode?.base64 || null,
          pairingCode: data?.pairingCode || null,
          state: data?.instance?.state || 'connecting',
        });
      } catch (fetchError) {
        console.error('[Evolution] QR code fetch error:', fetchError);
        return NextResponse.json({ error: 'Erro ao obter QR code do servidor Evolution' }, { status: 502 });
      }
    }

    return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
  } catch (error) {
    console.error('[Evolution] GET error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

// POST — Save config or create instance
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { apiUrl, apiKey, instanceName, unit, action: bodyAction } = body;
    const configUnit = unit || 'Barueri';

    // Save config
    if (!bodyAction || bodyAction === 'save') {
      const config = await prisma.evolutionConfig.upsert({
        where: { unit: configUnit },
        create: {
          apiUrl,
          apiKey,
          instanceName: instanceName || 'virtuosa-default',
          unit: configUnit,
        },
        update: {
          ...(apiUrl !== undefined && { apiUrl }),
          ...(apiKey && apiKey !== '' && !apiKey.includes('****') && { apiKey }),
          ...(instanceName !== undefined && { instanceName }),
        },
      });

      // Audit
      await prisma.auditLog.create({
        data: {
          userName: 'Admin',
          action: 'update',
          entity: 'evolution_config',
          entityId: config.id,
          details: 'Configurações da Evolution API atualizadas',
        },
      });

      return NextResponse.json({ success: true, id: config.id });
    }

    // Create instance on Evolution API
    if (bodyAction === 'create_instance') {
      const config = await prisma.evolutionConfig.findUnique({ where: { unit: configUnit } });
      if (!config?.apiUrl || !config?.apiKey) {
        return NextResponse.json({ error: 'Configuração não encontrada' }, { status: 400 });
      }

      const baseUrl = config.apiUrl.replace(/\/$/, '');
      const headers = { 'apikey': config.apiKey, 'Content-Type': 'application/json' };

      try {
        const res = await fetch(`${baseUrl}/instance/create`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            instanceName: config.instanceName,
            qrcode: true,
            integration: 'WHATSAPP-BAILEYS',
          }),
        });
        const data = await res.json();

        return NextResponse.json({
          success: true,
          instance: data?.instance,
          qrcode: data?.qrcode?.base64 || data?.base64 || null,
        });
      } catch (fetchError) {
        console.error('[Evolution] Create instance error:', fetchError);
        return NextResponse.json({ error: 'Erro ao criar instância' }, { status: 502 });
      }
    }

    return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
  } catch (error) {
    console.error('[Evolution] POST error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

// DELETE — Disconnect / logout
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const unit = searchParams.get('unit') || 'Barueri';

    const config = await prisma.evolutionConfig.findUnique({ where: { unit } });
    if (!config?.apiUrl || !config?.apiKey) {
      return NextResponse.json({ error: 'Configuração não encontrada' }, { status: 400 });
    }

    const baseUrl = config.apiUrl.replace(/\/$/, '');
    const headers = { 'apikey': config.apiKey, 'Content-Type': 'application/json' };

    try {
      await fetch(`${baseUrl}/instance/logout/${config.instanceName}`, {
        method: 'DELETE',
        headers,
      });
    } catch { /* ignore - may fail if already disconnected */ }

    // Update DB
    await prisma.evolutionConfig.update({
      where: { unit },
      data: { isConnected: false, phoneNumber: null, profileName: null },
    });

    // Audit
    await prisma.auditLog.create({
      data: {
        userName: 'Admin',
        action: 'update',
        entity: 'evolution_config',
        entityId: config.id,
        details: 'WhatsApp desconectado via Evolution API',
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Evolution] DELETE error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
