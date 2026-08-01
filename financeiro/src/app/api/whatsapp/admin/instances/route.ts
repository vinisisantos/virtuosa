import { NextResponse } from 'next/server';

import { prisma } from "@/lib/db";
import {
  canManageCollaboratorWhatsApp,
  canViewCollaboratorWhatsApp,
  isAdminRole,
  permittedUnitsForAccess,
} from "@/lib/role-access";
import {
  ALLOWED_INSTANCE_CHANNELS,
  getInstancePresentationSettings,
  normalizeInstanceChannel,
  setInstanceChannel,
  setInstanceDisplayName,
} from "@/lib/whatsapp/instance-presentation";
import { deleteWahaSession, getInstanceProvider, getWahaSession, normalizeWahaStatus } from "@/lib/whatsapp/provider";

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'http://localhost:8080';
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || '';

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

function readAccess(req: Request) {
  const role = req.headers.get('x-user-role') || '';
  const userUnit = req.headers.get('x-user-unit') || '';
  let permissions: Record<string, boolean> = {};
  try {
    permissions = JSON.parse(req.headers.get('x-user-permissions') || '{}');
  } catch {
    permissions = {};
  }

  return {
    role,
    userUnit,
    permissions,
    canView: canViewCollaboratorWhatsApp(role),
    canManage: canManageCollaboratorWhatsApp(role),
  };
}

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

async function getConnectionState(instanceName: string, provider = 'evolution') {
  if (provider === 'waha') {
    try {
      const session = await getWahaSession(instanceName);
      return normalizeWahaStatus(session?.status);
    } catch {
      return null;
    }
  }

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
    const access = readAccess(req);
    if (!access.canView) {
      return NextResponse.json({ error: 'Acesso restrito a administradores e marketing' }, { status: 403 });
    }

    const url = new URL(req.url);
    const unit = url.searchParams.get('unit');
    const includeInactive = url.searchParams.get('includeInactive') === 'true';
    const includeArchived = url.searchParams.get('includeArchived') === 'true';
    const permittedUnits = permittedUnitsForAccess(access);

    if (!access.canManage && unit && !permittedUnits.includes(unit)) {
      return NextResponse.json({ error: 'Acesso negado para esta unidade' }, { status: 403 });
    }

    const where: any = {};
    if (unit) where.unit = unit;
    else if (!access.canManage) {
      where.OR = [
        { unit: { in: permittedUnits } },
        { unit: 'Todas' },
      ];
    }

    let instances = await prisma.whatsAppInstance.findMany({
      where,
      include: {
        members: {
          where: { isActive: true },
          include: { user: { select: { id: true, name: true, email: true, unit: true, role: true } } },
          orderBy: { createdAt: 'asc' },
        },
        defaultAssignee: { select: { id: true, name: true, email: true } },
      },
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
    for (const remote of access.canManage ? evolutionInstances : []) {
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
          provider: 'evolution',
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
        include: {
          members: {
            where: { isActive: true },
            include: { user: { select: { id: true, name: true, email: true, unit: true, role: true } } },
            orderBy: { createdAt: 'asc' },
          },
          defaultAssignee: { select: { id: true, name: true, email: true } },
        },
      });

      instances.unshift(restored);
      knownNames.add(remoteName);
    }

    const userMap = new Map(users.map(u => [u.id, u]));
    const { displayNames, channels } = await getInstancePresentationSettings();
    const evoMap = new Map(evolutionInstances.map((e) => [e.instance?.instanceName || e.instanceName, e]));
    const connectionStateEntries = await Promise.all(
      instances.map(async (inst) => [inst.name, await getConnectionState(inst.name, getInstanceProvider(inst))] as const),
    );
    const connectionStateMap = new Map(connectionStateEntries);

    const result = await Promise.all(instances.map(async (inst) => {
      const user = inst.userId ? userMap.get(inst.userId) : null;
      const provider = getInstanceProvider(inst);
      const evo = provider === 'evolution' ? evoMap.get(inst.name) : null;
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
        provider,
        status: liveStatus,
        isActive: isActiveWhatsAppStatus(liveStatus),
        phone: inst.phoneNumber,
        unit: inst.unit,
        capturesLeads: inst.capturesLeads,
        assignmentMode: inst.assignmentMode,
        defaultAssigneeId: inst.defaultAssigneeId,
        defaultAssigneeName: inst.defaultAssignee?.name || null,
        accessRole: access.canManage ? 'ADMIN' : 'VIEWER',
        canReply: access.canManage,
        canManage: access.canManage,
        canReconnect: access.canManage,
        isShared: inst.members.length > 1 || inst.assignmentMode !== 'OWNER',
        members: inst.members.map((member) => ({
          userId: member.userId,
          role: member.role,
          userName: member.user.name,
          userEmail: member.user.email,
          userUnit: member.user.unit,
        })),
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
      if (!access.canManage && (!inst.userId || isAdminRole(inst.userRole))) return false;
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
    const access = readAccess(req);
    if (!access.canManage) {
      return NextResponse.json({ error: 'Acesso restrito a administradores' }, { status: 403 });
    }

    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    const deleteChats = url.searchParams.get('deleteChats') === 'true';
    if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 });

    const instance = await prisma.whatsAppInstance.findUnique({
      where: { id },
      select: { id: true, name: true, status: true, provider: true },
    });

    if (!instance) {
      return NextResponse.json({ error: 'Instância não encontrada' }, { status: 404 });
    }

    try {
      if (getInstanceProvider(instance) === 'waha') {
        await deleteWahaSession(instance.name);
      } else {
        await fetch(`${EVOLUTION_API_URL}/instance/delete/${instance.name}`, {
          method: 'DELETE',
          headers: { apikey: EVOLUTION_API_KEY },
        });
      }
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

// PATCH /api/whatsapp/admin/instances — define unidade, responsável, canal, captura de leads ou apelido de uma instância
// Unidade: tudo que cair nesse WhatsApp passa a ser registrado nessa unidade.
export async function PATCH(req: Request) {
  try {
    const access = readAccess(req);
    if (!access.canManage) {
      return NextResponse.json({ error: 'Acesso restrito a administradores' }, { status: 403 });
    }

    const body = await req.json();
    const {
      id,
      unit,
      displayName,
      channel,
      userId,
      capturesLeads,
      members,
      assignmentMode,
      defaultAssigneeId,
    } = body ?? {};
    if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 });

    const hasDisplayName = Object.prototype.hasOwnProperty.call(body ?? {}, 'displayName');
    const hasChannel = Object.prototype.hasOwnProperty.call(body ?? {}, 'channel');
    const hasUserId = Object.prototype.hasOwnProperty.call(body ?? {}, 'userId');
    const hasCapturesLeads = Object.prototype.hasOwnProperty.call(body ?? {}, 'capturesLeads');
    const hasMembers = Object.prototype.hasOwnProperty.call(body ?? {}, 'members');

    if (hasDisplayName || hasChannel || hasUserId || hasCapturesLeads || hasMembers) {
      const instance = await prisma.whatsAppInstance.findUnique({
        where: { id },
        select: { id: true, unit: true },
      });

      if (!instance) {
        return NextResponse.json({ error: 'Instância não encontrada' }, { status: 404 });
      }
    }

    if (hasMembers) {
      const allowedRoles = new Set(['OWNER', 'MANAGER', 'AGENT', 'VIEWER']);
      if (!Array.isArray(members)) {
        return NextResponse.json({ error: 'Lista de membros inválida' }, { status: 400 });
      }
      if (!['OWNER', 'DEFAULT_ASSIGNEE', 'TEAM_QUEUE'].includes(assignmentMode)) {
        return NextResponse.json({ error: 'Modo de atribuição inválido' }, { status: 400 });
      }

      const normalizedMembers = members
        .filter((member: any) => typeof member?.userId === 'string' && member.userId.trim())
        .map((member: any) => ({
          userId: member.userId.trim(),
          role: String(member.role || 'AGENT').trim().toUpperCase(),
        }));
      if (normalizedMembers.some((member: any) => !allowedRoles.has(member.role))) {
        return NextResponse.json({ error: 'Papel de membro inválido' }, { status: 400 });
      }
      if (new Set(normalizedMembers.map((member: any) => member.userId)).size !== normalizedMembers.length) {
        return NextResponse.json({ error: 'O mesmo usuário não pode aparecer duas vezes' }, { status: 400 });
      }

      const memberUserIds = normalizedMembers.map((member: any) => member.userId);
      const activeUsers = memberUserIds.length
        ? await prisma.user.findMany({
            where: { id: { in: memberUserIds }, isActive: true },
            select: { id: true, name: true, email: true, role: true, unit: true, permissions: true },
          })
        : [];
      if (activeUsers.length !== memberUserIds.length) {
        return NextResponse.json({ error: 'Há um usuário inválido ou inativo na equipe' }, { status: 400 });
      }
      const memberInstance = await prisma.whatsAppInstance.findUnique({
        where: { id },
        select: { unit: true },
      });
      if (!memberInstance) {
        return NextResponse.json({ error: 'Instância não encontrada' }, { status: 404 });
      }
      const userOutsideInstanceUnit = activeUsers.find((user) => {
        if (!memberInstance.unit || memberInstance.unit === 'Todas') return false;
        const permissions = user.permissions && typeof user.permissions === 'object' && !Array.isArray(user.permissions)
          ? user.permissions as Record<string, boolean>
          : {};
        const allowedUnits = permittedUnitsForAccess({ role: user.role, userUnit: user.unit || '', permissions });
        return !allowedUnits.includes(memberInstance.unit);
      });
      if (userOutsideInstanceUnit) {
        return NextResponse.json({
          error: `${userOutsideInstanceUnit.name} não possui acesso à unidade ${memberInstance.unit}`,
        }, { status: 400 });
      }
      if (
        assignmentMode === 'DEFAULT_ASSIGNEE' &&
        (!defaultAssigneeId || !memberUserIds.includes(defaultAssigneeId))
      ) {
        return NextResponse.json({ error: 'Selecione um responsável padrão que faça parte da equipe' }, { status: 400 });
      }
      const defaultMember = normalizedMembers.find((member: any) => member.userId === defaultAssigneeId);
      if (defaultMember && !['OWNER', 'MANAGER', 'AGENT'].includes(defaultMember.role)) {
        return NextResponse.json({ error: 'O responsável padrão precisa ter permissão para responder' }, { status: 400 });
      }

      const actorId = req.headers.get('x-user-id');
      const actorName = req.headers.get('x-user-name') || 'Administrador';
      const updated = await prisma.$transaction(async (tx) => {
        await tx.whatsAppInstanceMember.updateMany({
          where: { instanceId: id, userId: { notIn: memberUserIds } },
          data: { isActive: false },
        });
        for (const member of normalizedMembers) {
          await tx.whatsAppInstanceMember.upsert({
            where: { instanceId_userId: { instanceId: id, userId: member.userId } },
            create: {
              instanceId: id,
              userId: member.userId,
              role: member.role,
              isActive: true,
              createdBy: actorId || actorName,
            },
            update: { role: member.role, isActive: true },
          });
        }
        const instance = await tx.whatsAppInstance.update({
          where: { id },
          data: {
            assignmentMode,
            defaultAssigneeId: assignmentMode === 'DEFAULT_ASSIGNEE' ? defaultAssigneeId : null,
          },
          select: { id: true, assignmentMode: true, defaultAssigneeId: true },
        });
        await tx.activityLog.create({
          data: {
            userId: actorId,
            userName: actorName,
            action: 'whatsapp_instance_members_updated',
            entityType: 'WhatsAppInstance',
            entityId: id,
            description: `Equipe da instância atualizada por ${actorName}`,
            metadata: JSON.stringify({ members: normalizedMembers, assignmentMode, defaultAssigneeId: instance.defaultAssigneeId }),
          },
        });
        return instance;
      });

      return NextResponse.json({ success: true, instance: updated });
    }

    if (Object.prototype.hasOwnProperty.call(body ?? {}, 'displayName')) {
      if (displayName != null && typeof displayName !== 'string') {
        return NextResponse.json({ error: 'Nome inválido' }, { status: 400 });
      }

      const updatedDisplayName = await setInstanceDisplayName(id, displayName || null);
      return NextResponse.json({ success: true, instance: { id, displayName: updatedDisplayName } });
    }

    if (hasChannel) {
      if (!ALLOWED_INSTANCE_CHANNELS.includes(channel)) {
        return NextResponse.json({ error: 'Canal inválido (use whatsapp ou instagram)' }, { status: 400 });
      }

      const updatedChannel = await setInstanceChannel(id, normalizeInstanceChannel(channel));
      return NextResponse.json({ success: true, instance: { id, channel: updatedChannel } });
    }

    if (hasCapturesLeads) {
      if (typeof capturesLeads !== 'boolean') {
        return NextResponse.json({ error: 'Captura de leads inválida' }, { status: 400 });
      }

      const updated = await prisma.whatsAppInstance.update({
        where: { id },
        data: { capturesLeads },
        select: { id: true, capturesLeads: true },
      });

      return NextResponse.json({ success: true, instance: updated });
    }

    if (hasUserId) {
      if (userId !== null && typeof userId !== 'string') {
        return NextResponse.json({ error: 'Usuário responsável inválido' }, { status: 400 });
      }

      const owner = userId
        ? await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, name: true, email: true, unit: true, role: true, isActive: true },
          })
        : null;

      if (userId && (!owner || !owner.isActive)) {
        return NextResponse.json({ error: 'Usuário responsável inválido ou inativo' }, { status: 400 });
      }

      const updated = await prisma.$transaction(async (tx) => {
        const instance = await tx.whatsAppInstance.update({
          where: { id },
          data: {
            userId: owner?.id || null,
            ...(owner?.unit && ['Osasco', 'SBC', 'SCS'].includes(owner.unit) ? { unit: owner.unit } : {}),
          },
          select: { id: true, name: true, unit: true, userId: true },
        });
        if (owner) {
          await tx.whatsAppInstanceMember.upsert({
            where: { instanceId_userId: { instanceId: id, userId: owner.id } },
            create: { instanceId: id, userId: owner.id, role: 'OWNER', isActive: true, createdBy: 'owner-update' },
            update: { isActive: true },
          });
        }
        return instance;
      });

      return NextResponse.json({
        success: true,
        instance: {
          ...updated,
          userName: owner?.name || 'Desconhecido',
          userEmail: owner?.email || null,
          userRole: owner?.role || null,
        },
      });
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
