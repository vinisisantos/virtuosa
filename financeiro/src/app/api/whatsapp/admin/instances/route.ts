import { NextResponse } from 'next/server';

import { prisma } from "@/lib/db";

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'http://localhost:8080';
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || '';

type EvolutionInstance = {
  instance?: {
    instanceName?: string;
    status?: string;
    state?: string;
  };
  instanceName?: string;
  status?: string;
  state?: string;
};

function normalizeStatus(status?: string | null) {
  if (status === "open") return "connected";
  if (status === "close" || status === "closed") return "disconnected";
  return status || "disconnected";
}

function isActiveWhatsAppStatus(status?: string | null) {
  return normalizeStatus(status) === "connected";
}

// GET /api/whatsapp/admin/instances?unit=SCS&includeInactive=true
export async function GET(req: Request) {
  try {
    const role = req.headers.get('x-user-role');
    if (role !== 'ADMINISTRADOR') {
      return NextResponse.json({ error: 'Acesso restrito a administradores' }, { status: 403 });
    }

    const url = new URL(req.url);
    const unit = url.searchParams.get('unit');
    const includeInactive = url.searchParams.get('includeInactive') === 'true';

    const where: any = {};
    if (unit) where.unit = unit;

    const instances = await prisma.whatsAppInstance.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    // Buscar nomes dos usuários
    const userIds = instances.map(i => i.userId).filter(Boolean) as string[];
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, email: true, unit: true, role: true },
    });
    const userMap = new Map(users.map(u => [u.id, u]));

    // Tentar buscar status real do Evolution API
    let evolutionInstances: EvolutionInstance[] = [];
    try {
      const res = await fetch(`${EVOLUTION_API_URL}/instance/fetchInstances`, {
        headers: { apikey: EVOLUTION_API_KEY },
      });
      if (res.ok) {
        evolutionInstances = await res.json();
      }
    } catch (e) {
      // Se não conseguir, usar status do banco
    }
    const evoMap = new Map(evolutionInstances.map((e) => [e.instance?.instanceName || e.instanceName, e]));

    const result = instances.map(inst => {
      const user = inst.userId ? userMap.get(inst.userId) : null;
      const evo = evoMap.get(inst.name);
      const liveStatus = normalizeStatus(evo?.instance?.state || evo?.instance?.status || evo?.state || evo?.status || inst.status);

      return {
        id: inst.id,
        instanceName: inst.name,
        status: liveStatus,
        isActive: isActiveWhatsAppStatus(liveStatus),
        phone: inst.phoneNumber,
        unit: inst.unit,
        userId: inst.userId,
        userName: user?.name || 'Desconhecido',
        userEmail: user?.email,
        userRole: user?.role,
        createdAt: inst.createdAt,
      };
    }).filter((inst) => includeInactive || inst.isActive);

    return NextResponse.json({ instances: result });
  } catch (error: any) {
    console.error('[Admin Instances]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE /api/whatsapp/admin/instances?id=...
// Remove uma instância do CRM. As conversas e mensagens associadas são removidas por cascade.
export async function DELETE(req: Request) {
  try {
    const role = req.headers.get('x-user-role');
    if (role !== 'ADMINISTRADOR') {
      return NextResponse.json({ error: 'Acesso restrito a administradores' }, { status: 403 });
    }

    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 });

    const instance = await prisma.whatsAppInstance.findUnique({
      where: { id },
      select: { id: true, name: true },
    });

    if (!instance) {
      return NextResponse.json({ error: 'Instância não encontrada' }, { status: 404 });
    }

    // Best-effort: tenta remover no Evolution API, mas não bloqueia a limpeza local.
    try {
      await fetch(`${EVOLUTION_API_URL}/instance/delete/${instance.name}`, {
        method: 'DELETE',
        headers: { apikey: EVOLUTION_API_KEY },
      });
    } catch {}

    await prisma.whatsAppInstance.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[Admin Instances DELETE]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH /api/whatsapp/admin/instances — define a unidade de uma instância
// Tudo que cair nesse WhatsApp passa a ser registrado nessa unidade.
export async function PATCH(req: Request) {
  try {
    const role = req.headers.get('x-user-role');
    if (role !== 'ADMINISTRADOR') {
      return NextResponse.json({ error: 'Acesso restrito a administradores' }, { status: 403 });
    }

    const body = await req.json();
    const { id, unit } = body ?? {};
    if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 });

    // "Todas" = WhatsApp compartilhado, visível em todas as unidades.
    const ALLOWED_UNITS = ['Osasco', 'SBC', 'SCS', 'Todas'];
    if (!unit || !ALLOWED_UNITS.includes(unit)) {
      return NextResponse.json({ error: 'Unidade inválida (use Osasco, SBC, SCS ou Todas)' }, { status: 400 });
    }

    const updated = await prisma.whatsAppInstance.update({
      where: { id },
      data: { unit },
      select: { id: true, name: true, unit: true },
    });

    return NextResponse.json({ success: true, instance: updated });
  } catch (error: any) {
    console.error('[Admin Instances PATCH]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
