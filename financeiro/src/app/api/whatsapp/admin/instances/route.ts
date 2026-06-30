import { NextResponse } from 'next/server';

import { prisma } from "@/lib/db";

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'http://localhost:8080';
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || '';
const INSTANCE_DISPLAY_NAMES_KEY = 'whatsapp_instance_display_names';
const INSTANCE_CHANNELS_KEY = 'whatsapp_instance_channels';
const ALLOWED_CHANNELS = ['whatsapp', 'instagram'] as const;
type InstanceChannel = typeof ALLOWED_CHANNELS[number];

type EvolutionInstance = {
  instance?: {
    instanceName?: string;
    status?: string;
    state?: string;
    connectionStatus?: string;
    owner?: string;
  };
  instanceName?: string;
  status?: string;
  state?: string;
  connectionStatus?: string;
  owner?: string;
};

function normalizeStatus(status?: string | null) {
  const normalized = (status || "disconnected").toLowerCase();
  if (["open", "connected", "connection.open"].includes(normalized)) return "connected";
  if (["connecting", "qrcode", "qr", "pairing"].includes(normalized)) return "connecting";
  if (["close", "closed", "disconnected", "logout", "removed"].includes(normalized)) return "disconnected";
  return normalized;
}

function isActiveWhatsAppStatus(status?: string | null) {
  return normalizeStatus(status) === "connected";
}

function isArchivedStatus(status?: string | null) {
  return status === "archived";
}

function inferUserFromInstanceName(instanceName: string, users: Array<{ id: string; unit: string | null }>) {
  return users.find((user) => instanceName.startsWith(`virt-${user.id.slice(0, 8)}`)) || null;
}

async function getInstanceDisplayNames(): Promise<Record<string, string>> {
  const setting = await prisma.appSetting.findUnique({
    where: { key: INSTANCE_DISPLAY_NAMES_KEY },
    select: { value: true },
  });

  if (!setting?.value) return {};

  try {
    const parsed = JSON.parse(setting.value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

async function setInstanceDisplayName(instanceId: string, displayName: string | null) {
  const current = await getInstanceDisplayNames();
  const cleanName = displayName?.trim();

  if (cleanName) {
    current[instanceId] = cleanName.slice(0, 80);
  } else {
    delete current[instanceId];
  }

  await prisma.appSetting.upsert({
    where: { key: INSTANCE_DISPLAY_NAMES_KEY },
    create: {
      key: INSTANCE_DISPLAY_NAMES_KEY,
      value: JSON.stringify(current),
    },
    update: {
      value: JSON.stringify(current),
    },
  });

  return current[instanceId] || null;
}

function normalizeChannel(channel?: string | null): InstanceChannel {
  return channel === 'instagram' ? 'instagram' : 'whatsapp';
}

async function getInstanceChannels(): Promise<Record<string, InstanceChannel>> {
  const setting = await prisma.appSetting.findUnique({
    where: { key: INSTANCE_CHANNELS_KEY },
    select: { value: true },
  });

  if (!setting?.value) return {};

  try {
    const parsed = JSON.parse(setting.value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

    return Object.fromEntries(
      Object.entries(parsed).map(([instanceId, channel]) => [
        instanceId,
        normalizeChannel(typeof channel === 'string' ? channel : null),
      ]),
    );
  } catch {
    return {};
  }
}

async function setInstanceChannel(instanceId: string, channel: InstanceChannel) {
  const current = await getInstanceChannels();
  current[instanceId] = channel;

  await prisma.appSetting.upsert({
    where: { key: INSTANCE_CHANNELS_KEY },
    create: {
      key: INSTANCE_CHANNELS_KEY,
      value: JSON.stringify(current),
    },
    update: {
      value: JSON.stringify(current),
    },
  });

  return current[instanceId];
}

async function getConnectionState(instanceName: string) {
  try {
    const res = await fetch(`${EVOLUTION_API_URL}/instance/connectionState/${instanceName}`, {
      headers: { apikey: EVOLUTION_API_KEY },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.instance?.state || data.instance?.status || data.state || data.status || null;
  } catch {
    return null;
  }
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
    const includeArchived = url.searchParams.get('includeArchived') === 'true';

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
          status: normalizeStatus(
            remote.instance?.state ||
            remote.instance?.connectionStatus ||
            remote.instance?.status ||
            remote.state ||
            remote.connectionStatus ||
            remote.status,
          ),
          userId: inferredUser?.id,
          unit: inferredUser?.unit || "Todas",
          phoneNumber: inferredPhone,
        },
      });

      instances.unshift(restored);
      knownNames.add(remoteName);
    }

    const userMap = new Map(users.map(u => [u.id, u]));
    const displayNames = await getInstanceDisplayNames();
    const channels = await getInstanceChannels();
    const evoMap = new Map(evolutionInstances.map((e) => [e.instance?.instanceName || e.instanceName, e]));
    const connectionStateEntries = await Promise.all(
      instances.map(async (inst) => [inst.name, await getConnectionState(inst.name)] as const),
    );
    const connectionStateMap = new Map(connectionStateEntries);

    const result = await Promise.all(instances.map(async (inst) => {
      const user = inst.userId ? userMap.get(inst.userId) : null;
      const evo = evoMap.get(inst.name);
      const liveStatus = normalizeStatus(
        connectionStateMap.get(inst.name) ||
        evo?.instance?.state ||
        evo?.instance?.connectionStatus ||
        evo?.instance?.status ||
        evo?.state ||
        evo?.connectionStatus ||
        evo?.status ||
        inst.status,
      );

      if (liveStatus !== inst.status && !isArchivedStatus(inst.status)) {
        await prisma.whatsAppInstance.update({
          where: { id: inst.id },
          data: { status: liveStatus },
        });
      }

      return {
        id: inst.id,
        instanceName: inst.name,
        status: liveStatus,
        isActive: isActiveWhatsAppStatus(liveStatus),
        phone: inst.phoneNumber,
        unit: inst.unit,
        userId: inst.userId,
        displayName: displayNames[inst.id] || null,
        channel: channels[inst.id] || 'whatsapp',
        userName: user?.name || 'Desconhecido',
        userEmail: user?.email,
        userRole: user?.role,
        createdAt: inst.createdAt,
      };
    }));

    const filteredResult = result.filter((inst) => {
      if (!includeArchived && isArchivedStatus(inst.status)) return false;
      return includeInactive || inst.isActive;
    });

    return NextResponse.json({ instances: filteredResult });
  } catch (error: any) {
    console.error('[Admin Instances]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE /api/whatsapp/admin/instances?id=...&deleteChats=true
// Por padrao, arquiva a instancia e preserva os chats. Se deleteChats=true, remove tudo.
export async function DELETE(req: Request) {
  try {
    const role = req.headers.get('x-user-role');
    if (role !== 'ADMINISTRADOR') {
      return NextResponse.json({ error: 'Acesso restrito a administradores' }, { status: 403 });
    }

    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    const deleteChats = url.searchParams.get('deleteChats') === 'true';
    if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 });

    const instance = await prisma.whatsAppInstance.findUnique({
      where: { id },
      select: { id: true, name: true, status: true },
    });

    if (!instance) {
      return NextResponse.json({ error: 'Instância não encontrada' }, { status: 404 });
    }

    try {
      await fetch(`${EVOLUTION_API_URL}/instance/delete/${instance.name}`, {
        method: 'DELETE',
        headers: { apikey: EVOLUTION_API_KEY },
      });
    } catch {}

    if (deleteChats) {
      await prisma.whatsAppInstance.delete({ where: { id } });
      return NextResponse.json({ success: true, removedChats: true });
    }

    await prisma.whatsAppInstance.update({
      where: { id },
      data: {
        status: 'archived',
        qrcode: null,
      },
    });

    return NextResponse.json({ success: true, removedChats: false });
  } catch (error: any) {
    console.error('[Admin Instances DELETE]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH /api/whatsapp/admin/instances — define a unidade ou apelido de uma instância
// Unidade: tudo que cair nesse WhatsApp passa a ser registrado nessa unidade.
export async function PATCH(req: Request) {
  try {
    const role = req.headers.get('x-user-role');
    if (role !== 'ADMINISTRADOR') {
      return NextResponse.json({ error: 'Acesso restrito a administradores' }, { status: 403 });
    }

    const body = await req.json();
    const { id, unit, displayName, channel } = body ?? {};
    if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 });

    const hasDisplayName = Object.prototype.hasOwnProperty.call(body ?? {}, 'displayName');
    const hasChannel = Object.prototype.hasOwnProperty.call(body ?? {}, 'channel');

    if (hasDisplayName || hasChannel) {
      const instance = await prisma.whatsAppInstance.findUnique({
        where: { id },
        select: { id: true },
      });

      if (!instance) {
        return NextResponse.json({ error: 'Instância não encontrada' }, { status: 404 });
      }
    }

    if (Object.prototype.hasOwnProperty.call(body ?? {}, 'displayName')) {
      if (displayName != null && typeof displayName !== 'string') {
        return NextResponse.json({ error: 'Nome inválido' }, { status: 400 });
      }

      const updatedDisplayName = await setInstanceDisplayName(id, displayName || null);
      return NextResponse.json({ success: true, instance: { id, displayName: updatedDisplayName } });
    }

    if (hasChannel) {
      if (!ALLOWED_CHANNELS.includes(channel)) {
        return NextResponse.json({ error: 'Canal inválido (use whatsapp ou instagram)' }, { status: 400 });
      }

      const updatedChannel = await setInstanceChannel(id, channel);
      return NextResponse.json({ success: true, instance: { id, channel: updatedChannel } });
    }

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
