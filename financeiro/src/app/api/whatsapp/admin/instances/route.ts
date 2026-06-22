import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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
        phoneNumber: inst.phoneNumber,
        unit: inst.unit,
        userId: inst.userId,
        userName: user?.name || 'Desconhecido',
        userEmail: user?.email,
        userRole: user?.role,
        createdAt: inst.createdAt,
      };
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[Admin Instances]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
