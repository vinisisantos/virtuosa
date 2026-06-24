import { NextResponse } from 'next/server';

import { prisma } from "@/lib/db";

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'http://localhost:8080';
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || '';

// GET /api/whatsapp/admin/instances?unit=SCS
export async function GET(req: Request) {
  try {
    const role = req.headers.get('x-user-role');
    if (role !== 'ADMINISTRADOR') {
      return NextResponse.json({ error: 'Acesso restrito a administradores' }, { status: 403 });
    }

    const url = new URL(req.url);
    const unit = url.searchParams.get('unit');

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
    let evolutionInstances: any[] = [];
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
    const evoMap = new Map(evolutionInstances.map((e: any) => [e.instance?.instanceName || e.instanceName, e]));

    const result = instances.map(inst => {
      const user = inst.userId ? userMap.get(inst.userId) : null;
      const evo = evoMap.get(inst.name);
      const liveStatus = evo?.instance?.status || evo?.status || inst.status;

      return {
        id: inst.id,
        instanceName: inst.name,
        status: liveStatus,
        phone: inst.phoneNumber,
        unit: inst.unit,
        userId: inst.userId,
        userName: user?.name || 'Desconhecido',
        userEmail: user?.email,
        userRole: user?.role,
        createdAt: inst.createdAt,
      };
    });

    return NextResponse.json({ instances: result });
  } catch (error: any) {
    console.error('[Admin Instances]', error);
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

    const VISIBLE_UNITS = ['Osasco', 'SBC', 'SCS'];
    if (!unit || !VISIBLE_UNITS.includes(unit)) {
      return NextResponse.json({ error: 'Unidade inválida (use Osasco, SBC ou SCS)' }, { status: 400 });
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
