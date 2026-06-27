
import { prisma } from "@/lib/db";

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

// ──────────────────────────────────────────────────────────────────────────
// SEGURANÇA — Isolamento total das caixas de entrada
//
// Regra de ouro: cada usuário só enxerga as instâncias de WhatsApp que são
// DELE. NUNCA buscamos instâncias "por unidade" de qualquer dono — isso vazava
// conversas entre usuários (ex.: o WhatsApp do admin aparecendo no inbox da
// Thais). A única forma de ver a caixa de outra pessoa é o ADMIN escolher
// explicitamente um colaborador (?targetUserId), que é um recurso intencional.
//
// O seletor de unidade (?unit) apenas FILTRA entre as próprias instâncias do
// usuário (quem tem WhatsApp em Osasco e em SCS vê um ou outro conforme a
// unidade escolhida). Uma instância marcada como "Todas" (compartilhada)
// aparece em qualquer unidade — mas continua sendo do próprio dono.
// ──────────────────────────────────────────────────────────────────────────

function readAuth(req: Request) {
  const userId = req.headers.get('x-user-id');
  const role = req.headers.get('x-user-role') || '';
  return { userId, role, isAdmin: role === 'ADMINISTRADOR' };
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

/** Decide de QUEM é a caixa: colaborador escolhido por admin, ou o próprio usuário. */
function resolveOwner(req: Request): { whoseId: string | null; isProxy: boolean } {
  const { userId, isAdmin } = readAuth(req);
  const targetUserId = new URL(req.url).searchParams.get('targetUserId');
  if (isAdmin && targetUserId && targetUserId !== userId) {
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
}> {
  const { whoseId, isProxy } = resolveOwner(req);
  if (!whoseId) {
    return { instances: [], isProxy: false, targetUserId: '' };
  }

  const own = await getUserInstances(whoseId);
  const instances = filterByUnit(own, requestedUnitOf(req));
  return { instances, isProxy, targetUserId: whoseId };
}

/**
 * Resolve UMA instância da request (a conectada de preferência).
 */
export async function getInstanceForRequest(req: Request): Promise<{
  instance: any | null;
  isProxy: boolean;
  targetUserId: string;
}> {
  const { instances, isProxy, targetUserId } = await getInstancesForRequest(req);
  const operationalInstances = filterOperationalInstances(instances);
  const instance =
    operationalInstances.find((i) => i.status === 'connected') ||
    operationalInstances[0] ||
    null;
  return { instance, isProxy, targetUserId };
}

/**
 * Verifica se o usuário tem permissão para usar WhatsApp
 */
export function hasWhatsAppPermission(role: string, permissions: any): boolean {
  // Permite que qualquer usuário autenticado possa conectar o próprio WhatsApp
  return true;
}
