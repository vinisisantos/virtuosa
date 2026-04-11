import { NextRequest, NextResponse } from 'next/server';
import { requireUnitGuard } from '@/lib/unit-guard';
import { prisma } from '@/lib/db';

// GET — Get current Meta config (mask sensitive fields)
export async function GET(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  const { searchParams } = new URL(req.url);
  const unit = searchParams.get('unit') || 'Barueri';

  const config = await prisma.metaConfig.findUnique({ where: { unit } });

  if (!config) {
    return NextResponse.json({
      configured: false,
      appId: '',
      appSecret: '',
      accessToken: '',
      verifyToken: '',
      pageId: '',
      phoneNumberId: '',
      wabaId: '',
      isActive: false,
      lastTestAt: null,
      lastTestOk: false,
    });
  }

  // Mask sensitive fields
  const maskToken = (t: string | null) => {
    if (!t) return '';
    if (t.length <= 8) return '****';
    return t.substring(0, 4) + '****' + t.substring(t.length - 4);
  };

  return NextResponse.json({
    configured: true,
    appId: config.appId || '',
    appSecret: maskToken(config.appSecret),
    accessToken: maskToken(config.accessToken),
    verifyToken: config.verifyToken || '',
    pageId: config.pageId || '',
    phoneNumberId: config.phoneNumberId || '',
    wabaId: config.wabaId || '',
    isActive: config.isActive,
    lastTestAt: config.lastTestAt,
    lastTestOk: config.lastTestOk,
  });
}

// POST — Save / update Meta config
export async function POST(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  try {
    const body = await req.json();
    const {
      appId, appSecret, accessToken, verifyToken,
      pageId, phoneNumberId, wabaId, unit,
    } = body;

    const configUnit = unit || 'Barueri';

    const config = await prisma.metaConfig.upsert({
      where: { unit: configUnit },
      create: {
        appId,
        appSecret,
        accessToken,
        verifyToken,
        pageId,
        phoneNumberId,
        wabaId,
        unit: configUnit,
      },
      update: {
        ...(appId !== undefined && { appId }),
        ...(appSecret && appSecret !== '' && !appSecret.includes('****') && { appSecret }),
        ...(accessToken && accessToken !== '' && !accessToken.includes('****') && { accessToken }),
        ...(verifyToken !== undefined && { verifyToken }),
        ...(pageId !== undefined && { pageId }),
        ...(phoneNumberId !== undefined && { phoneNumberId }),
        ...(wabaId !== undefined && { wabaId }),
      },
    });

    // Audit
    await prisma.auditLog.create({
      data: {
        userName: 'Admin',
        action: 'update',
        entity: 'meta_config',
        entityId: config.id,
        details: 'Configurações da Meta API atualizadas',
      },
    });

    return NextResponse.json({ success: true, id: config.id });
  } catch (error) {
    console.error('[MetaConfig] Save error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// PUT — Test connection (verify token and Graph API access)
export async function PUT(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  try {
    const body = await req.json();
    const unit = body.unit || 'Barueri';

    const config = await prisma.metaConfig.findUnique({ where: { unit } });
    if (!config || !config.accessToken) {
      return NextResponse.json({ success: false, error: 'Configuração não encontrada ou token não definido' });
    }

    // Test Graph API access
    const res = await fetch(
      `https://graph.facebook.com/v21.0/me?access_token=${config.accessToken}`
    );
    const data = await res.json();

    const isOk = res.ok && data.id;

    await prisma.metaConfig.update({
      where: { unit },
      data: { lastTestAt: new Date(), lastTestOk: isOk },
    });

    if (isOk) {
      return NextResponse.json({
        success: true,
        name: data.name,
        id: data.id,
      });
    } else {
      return NextResponse.json({
        success: false,
        error: data.error?.message || 'Token inválido',
      });
    }
  } catch (error) {
    console.error('[MetaConfig] Test error:', error);
    return NextResponse.json({ success: false, error: 'Erro ao testar conexão' });
  }
}
