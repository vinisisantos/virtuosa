
import { prisma } from "@/lib/db";
import {
  canManageCollaboratorWhatsApp,
  canViewCollaboratorWhatsApp,
  isAdminRole,
  permittedUnitsForAccess,
} from "@/lib/role-access";

export type WhatsAppInstanceAccessRole = "OWNER" | "MANAGER" | "AGENT" | "VIEWER" | "ADMIN";

export type WhatsAppInstanceAccess = {
  accessRole: WhatsAppInstanceAccessRole;
  canView: boolean;
  canReply: boolean;
  canManage: boolean;
  canReconnect: boolean;
  isShared: boolean;
};

function accessForRole(role: WhatsAppInstanceAccessRole, isShared: boolean): WhatsAppInstanceAccess {
  const canManage = role === "OWNER" || role === "MANAGER" || role === "ADMIN";
  const canReply = canManage || role === "AGENT";
  return {
    accessRole: role,
    canView: true,
    canReply,
    canManage,
    canReconnect: canManage,
    isShared,
  };
}

function activeMembership(instance: any, userId?: string | null) {
  if (!userId) return null;
  return Array.isArray(instance.members)
    ? instance.members.find((member: any) => member.userId === userId && member.isActive !== false) || null
    : null;
}

function memberRole(value?: string | null): WhatsAppInstanceAccessRole {
  const role = (value || "").trim().toUpperCase();
  if (role === "MANAGER" || role === "AGENT" || role === "VIEWER") return role;
  return role === "OWNER" ? "OWNER" : "VIEWER";
}

function decorateInstanceForUser(instance: any, userId?: string | null, forcedRole?: WhatsAppInstanceAccessRole) {
  const membership = activeMembership(instance, userId);
  // A associação explícita pode restringir temporariamente até o proprietário
  // técnico (ex.: antigo operador fica somente leitura durante um handover).
  const role = forcedRole || (membership ? memberRole(membership.role) : instance.userId === userId ? "OWNER" : "VIEWER");
  const activeMembers = Array.isArray(instance.members)
    ? instance.members.filter((member: any) => member.isActive !== false).length
    : 0;
  return {
    ...instance,
    ...accessForRole(role, activeMembers > 1 || instance.assignmentMode !== "OWNER"),
  };
}

/**
 * Gera o nome da instância no Evolution API baseado no userId
 */
export function generateInstanceName(userId: string): string {
  return `virt-${userId.substring(0, 8)}`;
}

function isArchivedStatus(status?: string | null) {
  return status === "archived";
}

/**
 * Busca a instância WhatsApp de um usuário específico
 */
export async function getUserInstance(userId: string) {
  return prisma.whatsAppInstance.findFirst({
    where: { userId, status: { not: "archived" } },
  });
}

/**
 * Busca todas as instâncias WhatsApp de um usuário específico
 */
export async function getUserInstances(userId: string) {
  return prisma.whatsAppInstance.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
  });
}

/** Instâncias que o usuário pode operar como proprietário ou membro explícito. */
async function getAccessibleInstances(userId: string) {
  const instances = await prisma.whatsAppInstance.findMany({
    where: {
      OR: [
        { userId },
        { members: { some: { userId, isActive: true } } },
      ],
    },
    include: {
      members: {
        where: { isActive: true },
        select: { userId: true, role: true, isActive: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });
  return instances.map((instance) => decorateInstanceForUser(instance, userId));
}

export async function getInstanceAccessForUser(instanceId: string, userId: string) {
  const instance = await prisma.whatsAppInstance.findFirst({
    where: {
      id: instanceId,
      OR: [
        { userId },
        { members: { some: { userId, isActive: true } } },
      ],
    },
    include: {
      members: {
        where: { isActive: true },
        select: { userId: true, role: true, isActive: true },
      },
    },
  });
  return instance ? decorateInstanceForUser(instance, userId) : null;
}

// ──────────────────────────────────────────────────────────────────────────
// SEGURANÇA — Isolamento total das caixas de entrada
//
// Regra de ouro: cada usuário só enxerga instâncias próprias ou associações
// explícitas em WhatsAppInstanceMember. NUNCA buscamos instâncias apenas pela
// unidade — isso vazaria conversas entre equipes. Administrador/Marketing
// continuam usando o proxy explícito (?targetUserId/?targetInstanceId), com as
// capacidades do papel validadas no servidor.
//
// O seletor de unidade (?unit) apenas FILTRA entre as próprias instâncias do
// usuário (quem tem WhatsApp em Osasco e em SCS vê um ou outro conforme a
// unidade escolhida). Uma instância marcada como "Todas" aparece em qualquer
// unidade, mas só para o proprietário ou membros explicitamente associados.
// Quando o admin escolhe explicitamente uma instância (?targetInstanceId),
// essa seleção tem prioridade total para evitar ambiguidades entre números
// diferentes do mesmo usuário.
// ──────────────────────────────────────────────────────────────────────────

function readAuth(req: Request) {
  const userId = req.headers.get('x-user-id');
  const role = req.headers.get('x-user-role') || '';
  const userUnit = req.headers.get('x-user-unit') || '';
  let permissions: Record<string, boolean> = {};
  try {
    permissions = JSON.parse(req.headers.get('x-user-permissions') || '{}');
  } catch {
    permissions = {};
  }

  return {
    userId,
    role,
    userUnit,
    permissions,
    isAdmin: isAdminRole(role),
    canViewCollaborators: canViewCollaboratorWhatsApp(role),
    permittedUnits: permittedUnitsForAccess({ role, userUnit, permissions }),
  };
}

/** Unidade pedida pela UI, ou null quando é "todas"/ausente. */
function requestedUnitOf(req: Request): string | null {
  const u = new URL(req.url).searchParams.get('unit');
  if (!u || u === 'all' || u === 'Todas') return null;
  return u;
}

/** Filtra as instâncias do usuário pela unidade escolhida (compartilhadas sempre entram). */
function filterByUnit(instances: any[], unit: string | null): any[] {
  if (!unit) return instances;
  return instances.filter((i) => i.unit === unit || i.unit === 'Todas');
}

function filterOperationalInstances(instances: any[]): any[] {
  return instances.filter((instance) => !isArchivedStatus(instance.status));
}

function instanceUnitAllowedForProxy(unit: string | null | undefined, permittedUnits: string[]) {
  if (!unit || unit === 'Todas') return true;
  return permittedUnits.includes(unit);
}

async function canAccessTargetOwner(params: {
  requesterId: string | null;
  requesterIsAdmin: boolean;
  requesterCanViewCollaborators: boolean;
  requesterPermittedUnits: string[];
  ownerUserId?: string | null;
}) {
  if (!params.ownerUserId) return false;
  if (params.ownerUserId === params.requesterId) return true;
  if (params.requesterIsAdmin) return true;
  if (!params.requesterCanViewCollaborators) return false;

  const owner = await prisma.user.findUnique({
    where: { id: params.ownerUserId },
    select: { id: true, role: true, isActive: true, unit: true },
  });

  return !!owner
    && owner.isActive !== false
    && !isAdminRole(owner.role)
    && instanceUnitAllowedForProxy(owner.unit, params.requesterPermittedUnits);
}

/** Decide de QUEM é a caixa: colaborador escolhido por perfil autorizado, ou o próprio usuário. */
async function resolveOwner(req: Request): Promise<{ whoseId: string | null; isProxy: boolean }> {
  const { userId, isAdmin, canViewCollaborators, permittedUnits } = readAuth(req);
  const targetUserId = new URL(req.url).searchParams.get('targetUserId');
  if (
    targetUserId &&
    targetUserId !== userId &&
    await canAccessTargetOwner({
      requesterId: userId,
      requesterIsAdmin: isAdmin,
      requesterCanViewCollaborators: canViewCollaborators,
      requesterPermittedUnits: permittedUnits,
      ownerUserId: targetUserId,
    })
  ) {
    return { whoseId: targetUserId, isProxy: true };
  }
  return { whoseId: userId, isProxy: false };
}

/**
 * Resolve TODAS as instâncias da request — sempre escopadas ao dono da caixa.
 */
export async function getInstancesForRequest(req: Request): Promise<{
  instances: any[];
  isProxy: boolean;
  targetUserId: string;
  targetInstanceId: string;
}> {
  const { userId, isAdmin, canViewCollaborators, permittedUnits } = readAuth(req);
  const targetInstanceId = new URL(req.url).searchParams.get('targetInstanceId');

  if (targetInstanceId) {
    const instance = await prisma.whatsAppInstance.findUnique({
      where: { id: targetInstanceId },
      include: {
        members: {
          where: { isActive: true },
          select: { userId: true, role: true, isActive: true },
        },
      },
    });

    if (!instance || isArchivedStatus(instance.status)) {
      return { instances: [], isProxy: false, targetUserId: '', targetInstanceId: '' };
    }

    // Todo usuário pode selecionar explicitamente uma instância própria ou
    // uma caixa à qual foi associado como membro ativo.
    // A unidade solicitada continua sendo aplicada para impedir que a troca
    // escape do contexto atual do Inbox.
    if (userId && (instance.userId === userId || activeMembership(instance, userId))) {
      const [ownInstance] = filterByUnit([instance], requestedUnitOf(req));
      if (!ownInstance) {
        return { instances: [], isProxy: false, targetUserId: '', targetInstanceId: '' };
      }

      return {
        instances: [decorateInstanceForUser(ownInstance, userId)],
        isProxy: false,
        targetUserId: userId,
        targetInstanceId: ownInstance.id,
      };
    }

    if (!canViewCollaborators) {
      return { instances: [], isProxy: false, targetUserId: '', targetInstanceId: '' };
    }

    const canAccess = await canAccessTargetOwner({
      requesterId: userId,
      requesterIsAdmin: isAdmin,
      requesterCanViewCollaborators: canViewCollaborators,
      requesterPermittedUnits: permittedUnits,
      ownerUserId: instance.userId,
    });

    if (
      !canAccess ||
      (!isAdmin && instance.userId !== userId && !instanceUnitAllowedForProxy(instance.unit, permittedUnits))
    ) {
      return { instances: [], isProxy: false, targetUserId: '', targetInstanceId: '' };
    }

    const proxyRole: WhatsAppInstanceAccessRole = canManageCollaboratorWhatsApp(readAuth(req).role)
      ? "ADMIN"
      : "VIEWER";
    return {
      instances: [decorateInstanceForUser(instance, userId, proxyRole)],
      isProxy: !!instance.userId && instance.userId !== userId,
      targetUserId: instance.userId || '',
      targetInstanceId: instance.id,
    };
  }

  const { whoseId, isProxy } = await resolveOwner(req);
  if (!whoseId) {
    return { instances: [], isProxy: false, targetUserId: '', targetInstanceId: '' };
  }

  const own = isProxy
    ? (await getUserInstances(whoseId)).map((instance) => decorateInstanceForUser(
        instance,
        userId,
        canManageCollaboratorWhatsApp(readAuth(req).role) ? "ADMIN" : "VIEWER",
      ))
    : await getAccessibleInstances(whoseId);
  let instances = filterByUnit(own, requestedUnitOf(req));
  if (isProxy && !isAdmin) {
    instances = instances.filter((instance) => instanceUnitAllowedForProxy(instance.unit, permittedUnits));
  }
  return { instances, isProxy, targetUserId: whoseId, targetInstanceId: '' };
}

/**
 * Resolve UMA instância da request (a conectada de preferência).
 */
export async function getInstanceForRequest(req: Request): Promise<{
  instance: any | null;
  isProxy: boolean;
  targetUserId: string;
  targetInstanceId: string;
}> {
  const { instances, isProxy, targetUserId, targetInstanceId } = await getInstancesForRequest(req);
  const operationalInstances = filterOperationalInstances(instances);
  const instance =
    operationalInstances.find((i) => i.status === 'connected') ||
    operationalInstances[0] ||
    null;
  return { instance, isProxy, targetUserId, targetInstanceId: targetInstanceId || instance?.id || '' };
}

/**
 * Verifica se o usuário tem permissão para usar WhatsApp
 */
export function hasWhatsAppPermission(role: string, permissions: any): boolean {
  // Permite que qualquer usuário autenticado possa conectar o próprio WhatsApp
  return true;
}
