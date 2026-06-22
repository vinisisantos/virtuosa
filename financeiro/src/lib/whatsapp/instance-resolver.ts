import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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
 * Resolve qual instância usar baseado na request.
 * - Usuário normal: retorna SUA instância
 * - Admin com ?targetUserId=xxx: retorna instância do usuário alvo
 */
export async function getInstanceForRequest(req: Request): Promise<{
  instance: any | null;
  isProxy: boolean; // true se admin acessando instância de outro
  targetUserId: string;
}> {
  const userId = req.headers.get('x-user-id');
  const role = req.headers.get('x-user-role');
  const url = new URL(req.url);
  const targetUserId = url.searchParams.get('targetUserId');

  if (!userId) {
    return { instance: null, isProxy: false, targetUserId: '' };
  }

  // Admin acessando instância de outro usuário
  if (role === 'ADMINISTRADOR' && targetUserId && targetUserId !== userId) {
    const instance = await getUserInstance(targetUserId);
    return { instance, isProxy: true, targetUserId };
  }

  // Usuário normal ou admin acessando sua própria instância
  const instance = await getUserInstance(userId);
  return { instance, isProxy: false, targetUserId: userId };
}

/**
 * Verifica se o usuário tem permissão para usar WhatsApp
 */
export function hasWhatsAppPermission(role: string, permissions: any): boolean {
  if (role === 'ADMINISTRADOR') return true;
  if (!permissions) return false;
  return permissions.whatsapp === true || permissions.crm === true;
}
