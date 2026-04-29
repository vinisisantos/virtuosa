import { NextRequest, NextResponse } from 'next/server';
import { requireUnitGuard } from '@/lib/unit-guard';
import { prisma } from '@/lib/db';
import * as wp from '@/lib/whatsapp-provider';

// GET — Get session status + QR code (supports Evolution API and Mega API)
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
          apiUrl: true, providerType: true,
        },
        orderBy: { createdAt: 'asc' },
      });
      return NextResponse.json(instances.map((i: any) => ({
        ...i,
        configured: !!(i.apiUrl),
        providerType: i.providerType || 'evolution',
        apiUrl: undefined, // don't expose full URL
      })));
    }

    // Find config
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
        providerType: config?.providerType || 'evolution',
        isConnected: config?.isConnected || false,
        phoneNumber: config?.phoneNumber || null,
        profileName: config?.profileName || null,
        lastConnected: config?.lastConnected || null,
      });
    }

    if (!config?.apiUrl || !config?.apiKey) {
      return NextResponse.json({ error: 'WhatsApp API não configurada. Preencha a URL e API Key.' }, { status: 400 });
    }

    const providerConfig = wp.buildProviderConfig(config);
    if (!providerConfig) {
      return NextResponse.json({ error: 'Configuração inválida' }, { status: 400 });
    }

    // Get connection status
    if (action === 'status') {
      try {
        const status = await wp.getConnectionStatus(providerConfig);

        // Update DB if status changed
        const isConnected = status.isConnected;
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
          state: status.state,
          isConnected,
          profileName: config.profileName,
          phoneNumber: config.phoneNumber,
        });
      } catch (fetchError) {
        console.error('[Session] Status fetch error:', fetchError);
        return NextResponse.json({ state: 'close', isConnected: false, error: 'Não foi possível conectar ao servidor' });
      }
    }

    // Get QR code
    if (action === 'qrcode') {
      try {
        const qrData = await wp.getQrCode(providerConfig);

        return NextResponse.json({
          qrcode: qrData.qrcode,
          pairingCode: qrData.pairingCode || null,
          state: qrData.state,
        });
      } catch (fetchError) {
        console.error('[Session] QR code fetch error:', fetchError);
        return NextResponse.json({ error: 'Erro ao obter QR code' }, { status: 502 });
      }
    }

    return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
  } catch (error) {
    console.error('[Session] GET error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

// POST — Save config or create instance
export async function POST(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  try {
    const body = await req.json();
    const { apiUrl, apiKey, instanceName, label, unit, action: bodyAction, providerType } = body;
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
          providerType: providerType || 'evolution',
          unit: configUnit,
        },
        update: {
          ...(apiUrl !== undefined && { apiUrl }),
          ...(apiKey && apiKey !== '' && !apiKey.includes('****') && { apiKey }),
          ...(label !== undefined && { label }),
          ...(providerType !== undefined && { providerType }),
        },
      });

      // If Mega API, auto-configure webhook
      if ((providerType || config.providerType) === 'mega' && config.apiUrl && config.apiKey) {
        try {
          const pConfig = wp.buildProviderConfig({
            ...config,
            providerType: providerType || config.providerType,
          });
          if (pConfig) {
            const webhookUrl = `https://financeiro-blush-nine.vercel.app/api/whatsapp/mega/webhook`;
            await wp.configureWebhook(pConfig, webhookUrl);
            console.log('[Session] Mega API webhook configured:', webhookUrl);
          }
        } catch (webhookErr) {
          console.warn('[Session] Webhook auto-config failed:', webhookErr);
        }
      }

      // Audit
      await prisma.auditLog.create({
        data: {
          userName: 'Admin',
          action: 'update',
          entity: 'evolution_config',
          entityId: config.id,
          details: `Configurações do WhatsApp atualizadas (provider: ${providerType || config.providerType || 'evolution'})`,
        },
      });

      return NextResponse.json({ success: true, id: config.id });
    }

    // Create instance on Evolution API (not applicable for Mega API)
    if (bodyAction === 'create_instance') {
      const instName = instanceName || 'virtuosa-default';
      const config = await (prisma as any).evolutionConfig.findUnique({
        where: { unit_instanceName: { unit: configUnit, instanceName: instName } },
      });
      if (!config?.apiUrl || !config?.apiKey) {
        return NextResponse.json({ error: 'Configuração não encontrada' }, { status: 400 });
      }

      const providerConfig = wp.buildProviderConfig(config);
      if (!providerConfig) {
        return NextResponse.json({ error: 'Configuração inválida' }, { status: 400 });
      }

      if (providerConfig.providerType === 'mega') {
        return NextResponse.json({
          success: true,
          info: 'Instâncias Mega API são criadas pelo painel da Mega API.',
        });
      }

      try {
        const data = await wp.createInstance(providerConfig);
        return NextResponse.json({
          success: true,
          instance: data?.instance,
          qrcode: data?.qrcode?.base64 || data?.base64 || null,
        });
      } catch (fetchError) {
        console.error('[Session] Create instance error:', fetchError);
        return NextResponse.json({ error: 'Erro ao criar instância' }, { status: 502 });
      }
    }

    return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('[Session] POST error:', errMsg, error);
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

    const providerConfig = wp.buildProviderConfig(config);
    if (providerConfig) {
      await wp.disconnect(providerConfig);
    }

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
        details: `WhatsApp desconectado (provider: ${config.providerType || 'evolution'})`,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Session] DELETE error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
