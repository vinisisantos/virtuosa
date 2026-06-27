import { NextResponse } from 'next/server';

import { prisma } from "@/lib/db";

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'http://localhost:8080';
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || '';

type EvolutionInstance = {
  instance?: {
    instanceName?: string;
    status?: string;
    state?: string;
    owner?: string;
  };
  instanceName?: string;
  status?: string;
  state?: string;
  owner?: string;
};

function normalizeStatus(status?: string | null) {
  if (status === "open") return "connected";
  if (status === "close" || status === "closed") return "disconnected";
  return status || "disconnected";
}

function isActiveWhatsAppStatus(status?: string | null) {
  return normalizeStatus(status) === "connected";
}

function inferUserFromInstanceName(instanceName: string, users: Array<{ id: string; unit: string | null }>) {
  return users.find((user) => instanceName.startsWith(`virt-${user.id.slice(0, 8)}`)) || null;
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

    let instances = await prisma.whatsAppInstance.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    const users = await prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true, email: true, unit: true, role: true },
    });

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

    const knownNames = new Set(instances.map((inst) => inst.name));
    for (const remote of evolutionInstances) {
      const remoteName = remote.instance?.instanceName || remote.instanceName;
      if (!remoteName || knownNames.has(remoteName)) continue;

      const inferredUser = inferUserFromInstanceName(remoteName, users);
      const inferredPhone =
        remote.instance?.owner?.split("@")?.[0] ||
        remote.owner?.split("@")?.[0] ||
        null;

      const restored = await prisma.whatsAppInstance.create({
        data: {
          instanceId: remoteName,
          name: remoteName,
          token: EVOLUTION_API_KEY || "restored-from-evolution",
          status: normalizeStatus(remote.instance?.state || remote.instance?.status || remote.state || remote.status),
          userId: inferredUser?.id,
          unit: inferredUser?.unit || "Todas",
          phoneNumber: inferredPhone,
        },
      });

      instances.unshift(restored);
      knownNames.add(remoteName);
    }

    const userMap = new Map(users.map(u => [u.id, u]));
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
// Exclusao desabilitada para evitar perda acidental de historico.
export async function DELETE(req: Request) {
  return NextResponse.json(
    { error: 'Exclusão de instâncias está desabilitada para evitar perda de histórico.' },
    { status: 405 },
  );
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
