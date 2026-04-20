import { NextRequest, NextResponse } from 'next/server';
import { requireUnitGuard } from '@/lib/unit-guard';
import { prisma } from '@/lib/db';

// GET — Get session status + QR code (proxy to Evolution API)
export async function GET(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  const { searchParams } = new URL(req.url);
  const unit = searchParams.get('unit') || 'Barueri';
  const action = searchParams.get('action'); // 'qrcode' | 'status' | 'config' | 'instances'
  const instanceParam = searchParams.get('instance') || undefined;

  try {
    // List all instances for a unit
    if (action === 'instances') {
      const instances = await (prisma as any).evolutionConfig.findMany({
        where: { unit },
        select: {
          id: true, instanceName: true, label: true, isConnected: true,
          phoneNumber: true, profileName: true, lastConnected: true,
          apiUrl: true,
        },
        orderBy: { createdAt: 'asc' },
      });
      return NextResponse.json(instances.map((i: any) => ({
        ...i,
        configured: !!(i.apiUrl),
        apiUrl: undefined, // don't expose full URL
      })));
    }

    // Find config: by compound key if instanceParam provided, else first for unit
    let config: any = null;
    if (instanceParam) {
      config = await (prisma as any).evolutionConfig.findUnique({
        where: { unit_instanceName: { unit, instanceName: instanceParam } },
      });
    } else {
      config = await (prisma as any).evolutionConfig.findFirst({ where: { unit } });
    }

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
          await (prisma as any).evolutionConfig.update({
            where: { unit_instanceName: { unit, instanceName: config.instanceName } },
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
export async function POST(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  try {
    const body = await req.json();
    const { apiUrl, apiKey, instanceName, label, unit, action: bodyAction } = body;
    const configUnit = unit || 'Barueri';

    // Save config
    if (!bodyAction || bodyAction === 'save') {
      const instName = instanceName || 'virtuosa-default';
      const config = await (prisma as any).evolutionConfig.upsert({
        where: { unit_instanceName: { unit: configUnit, instanceName: instName } },
        create: {
          apiUrl,
          apiKey,
          instanceName: instName,
          label: label || null,
          unit: configUnit,
        },
        update: {
          ...(apiUrl !== undefined && { apiUrl }),
          ...(apiKey && apiKey !== '' && !apiKey.includes('****') && { apiKey }),
          ...(label !== undefined && { label }),
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
      const instName = instanceName || 'virtuosa-default';
      const config = await (prisma as any).evolutionConfig.findUnique({ where: { unit_instanceName: { unit: configUnit, instanceName: instName } } });
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
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('[Evolution] POST error:', errMsg, error);
    return NextResponse.json({ error: 'Erro interno', details: errMsg }, { status: 500 });
  }
}

// DELETE — Disconnect / logout
export async function DELETE(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  try {
    const { searchParams } = new URL(req.url);
    const unit = searchParams.get('unit') || 'Barueri';
    const instanceParam = searchParams.get('instance') || undefined;

    let config: any = null;
    if (instanceParam) {
      config = await (prisma as any).evolutionConfig.findUnique({ where: { unit_instanceName: { unit, instanceName: instanceParam } } });
    } else {
      config = await (prisma as any).evolutionConfig.findFirst({ where: { unit } });
    }
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
    await (prisma as any).evolutionConfig.update({
      where: { unit_instanceName: { unit, instanceName: config.instanceName } },
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
