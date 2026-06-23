
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

/**
 * Resolve qual instância usar baseado na request.
 * - Usuário normal: retorna SUA instância principal (primeira)
 * - Admin com ?targetUserId=xxx: retorna instância do usuário alvo
 */
export async function getInstanceForRequest(req: Request): Promise<{
  instance: any | null;
  isProxy: boolean;
  targetUserId: string;
}> {
  const userId = req.headers.get('x-user-id');
  const role = req.headers.get('x-user-role');
  const url = new URL(req.url);
  const targetUserId = url.searchParams.get('targetUserId');

  if (!userId) {
    return { instance: null, isProxy: false, targetUserId: '' };
  }

  if (role === 'ADMINISTRADOR' && targetUserId && targetUserId !== userId) {
    const instance = await getUserInstance(targetUserId);
    return { instance, isProxy: true, targetUserId };
  }

  const instance = await getUserInstance(userId);
  return { instance, isProxy: false, targetUserId: userId };
}

/**
 * Resolve TODAS as instâncias do usuário baseado na request.
 */
export async function getInstancesForRequest(req: Request): Promise<{
  instances: any[];
  isProxy: boolean;
  targetUserId: string;
}> {
  const userId = req.headers.get('x-user-id');
  const role = req.headers.get('x-user-role');
  const url = new URL(req.url);
  const targetUserId = url.searchParams.get('targetUserId');

  if (!userId) {
    return { instances: [], isProxy: false, targetUserId: '' };
  }

  if (role === 'ADMINISTRADOR' && targetUserId && targetUserId !== userId) {
    const instances = await getUserInstances(targetUserId);
    return { instances, isProxy: true, targetUserId };
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
