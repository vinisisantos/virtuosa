
import { prisma } from "@/lib/db";

/**
 * Gera o nome da instância no Evolution API baseado no userId
 */
export function generateInstanceName(userId: string): string {
  return `virt-${userId.substring(0, 8)}`;
}

/**
 * Busca a instância WhatsApp de um usuário específico
 */
export async function getUserInstance(userId: string) {
  return prisma.whatsAppInstance.findFirst({
    where: { userId },
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
// Separação por unidade (total)
//
// O WhatsApp e suas conversas pertencem a uma UNIDADE (WhatsAppInstance.unit).
// Quando a UI seleciona uma unidade (?unit=SBC), resolvemos TODAS as instâncias
// daquela unidade — independente de quem é o dono — de modo que trocar de
// unidade troca a caixa de entrada inteira (Osasco ↔ SBC ↔ SCS).
//
// Espelha a lógica de permissão do unit-guard, mas mantida local aqui porque
// este resolver opera sobre um `Request` simples (não `NextRequest`).
// ──────────────────────────────────────────────────────────────────────────
const ALL_UNITS = ['Osasco', 'SBC', 'SCS', 'Barueri'];
const UNIT_PERMISSION_MAP: Record<string, string> = {
  unitBarueri: 'Barueri',
  unitOsasco: 'Osasco',
  unitSBC: 'SBC',
  unitSCS: 'SCS',
};

function readAuth(req: Request) {
  const userId = req.headers.get('x-user-id');
  const role = req.headers.get('x-user-role') || '';
  const unit = req.headers.get('x-user-unit') || '';
  let permissions: Record<string, boolean> | null = null;
  try {
    const p = req.headers.get('x-user-permissions');
    if (p) permissions = JSON.parse(p);
  } catch { /* ignore malformed header */ }
  return { userId, role, unit, permissions, isAdmin: role === 'ADMINISTRADOR' };
}

/** Unidades que o usuário pode ler/agir: a do JWT + as habilitadas no perfil. */
function permittedUnitsFor(
  unit: string,
  isAdmin: boolean,
  permissions: Record<string, boolean> | null,
): string[] {
  if (isAdmin || permissions?.admin === true || permissions?.multiUnit === true) {
    return [...ALL_UNITS];
  }
  const set = new Set<string>();
  if (unit) set.add(unit);
  if (permissions) {
    for (const [key, unitName] of Object.entries(UNIT_PERMISSION_MAP)) {
      if (permissions[key] === true) set.add(unitName);
    }
  }
  return [...set];
}

/**
 * Resolve instâncias filtrando pela unidade pedida (?unit=...), respeitando as
 * permissões do usuário. Retorna:
 *  - `null`  → nenhuma unidade foi pedida (o chamador usa a lógica por usuário)
 *  - `[]`    → unidade pedida sem permissão (não vaza dados de outra unidade)
 *  - lista   → instâncias daquela unidade
 */
async function resolveUnitScoped(req: Request): Promise<any[] | null> {
  const requestedUnit = new URL(req.url).searchParams.get('unit');
  if (!requestedUnit || requestedUnit === 'all' || requestedUnit === 'Todas') return null;

  const { userId, unit, isAdmin, permissions } = readAuth(req);
  const permitted = permittedUnitsFor(unit, isAdmin, permissions);
  if (!isAdmin && !permitted.includes(requestedUnit)) {
    return []; // sem permissão → caixa vazia, nunca dados de outra unidade
  }

  const byUnit = await prisma.whatsAppInstance.findMany({
    where: { unit: requestedUnit },
    orderBy: { createdAt: 'asc' },
  });

  // Rede de segurança: se for a PRÓPRIA unidade do usuário, inclui também as
  // instâncias dele que porventura ainda não tenham unidade definida (legado),
  // evitando uma caixa de entrada vazia.
  if (requestedUnit === unit && userId) {
    const own = await getUserInstances(userId);
    for (const o of own) if (!byUnit.some((m) => m.id === o.id)) byUnit.push(o);
  }

  return byUnit;
}

/**
 * Resolve qual instância usar baseado na request.
 * Prioridade: unidade pedida (?unit) → admin com ?targetUserId → próprio usuário.
 */
export async function getInstanceForRequest(req: Request): Promise<{
  instance: any | null;
  isProxy: boolean;
  targetUserId: string;
}> {
  const { userId, isAdmin } = readAuth(req);
  const targetUserId = new URL(req.url).searchParams.get('targetUserId');

  if (!userId) {
    return { instance: null, isProxy: false, targetUserId: '' };
  }

  // Admin impersonando um colaborador específico (seleção mais granular).
  if (isAdmin && targetUserId && targetUserId !== userId) {
    const instance = await getUserInstance(targetUserId);
    return { instance, isProxy: true, targetUserId };
  }

  // Separação por unidade.
  const scoped = await resolveUnitScoped(req);
  if (scoped !== null) {
    const instance = scoped.find((i) => i.status === 'connected') || scoped[0] || null;
    return { instance, isProxy: true, targetUserId: '' };
  }

  const instance = await getUserInstance(userId);
  return { instance, isProxy: false, targetUserId: userId };
}

/**
 * Resolve TODAS as instâncias baseado na request.
 * Prioridade: admin com ?targetUserId → unidade pedida (?unit) → próprio usuário.
 */
export async function getInstancesForRequest(req: Request): Promise<{
  instances: any[];
  isProxy: boolean;
  targetUserId: string;
}> {
  const { userId, isAdmin } = readAuth(req);
  const targetUserId = new URL(req.url).searchParams.get('targetUserId');

  if (!userId) {
    return { instances: [], isProxy: false, targetUserId: '' };
  }

  // Admin impersonando um colaborador específico (seleção mais granular).
  if (isAdmin && targetUserId && targetUserId !== userId) {
    const instances = await getUserInstances(targetUserId);
    return { instances, isProxy: true, targetUserId };
  }

  // Separação por unidade (seletor de unidade no header).
  const scoped = await resolveUnitScoped(req);
  if (scoped !== null) {
    return { instances: scoped, isProxy: true, targetUserId: '' };
  }

  const instances = await getUserInstances(userId);
  return { instances, isProxy: false, targetUserId: userId };
}

/**
 * Verifica se o usuário tem permissão para usar WhatsApp
 */
export function hasWhatsAppPermission(role: string, permissions: any): boolean {
  // Permite que qualquer usuário autenticado possa conectar o próprio WhatsApp
  return true;
}
