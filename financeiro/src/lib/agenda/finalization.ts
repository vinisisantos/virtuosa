import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';

interface AppointmentPackageIdentity {
  clientName: string;
  procedimento: string;
  unit: string;
}

export async function withSerializableRetry<T>(
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
  maxAttempts = 3,
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      const isConflict =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
      if (!isConflict || attempt === maxAttempts) throw error;
    }
  }

  throw new Error('Não foi possível concluir a transação da agenda.');
}

export async function incrementPackageSession(
  tx: Prisma.TransactionClient,
  appointment: AppointmentPackageIdentity,
): Promise<boolean> {
  const packages = await tx.package.findMany({
    where: {
      clientName: appointment.clientName,
      unit: appointment.unit,
      status: 'ativo',
    },
    orderBy: { createdAt: 'asc' },
  });

  for (const pkg of packages) {
    let services: Array<{ name?: string }>;
    try {
      services = JSON.parse(pkg.services) as Array<{ name?: string }>;
    } catch {
      // Pacotes legados com JSON inválido não impedem a baixa do agendamento.
      continue;
    }

    const matchesProcedure = services.some(
      (service) => service.name?.trim().toLocaleLowerCase('pt-BR') ===
        appointment.procedimento.trim().toLocaleLowerCase('pt-BR'),
    );

    if (!matchesProcedure || pkg.completedSessions >= pkg.totalSessions) continue;

    const updated = await tx.package.updateMany({
      where: {
        id: pkg.id,
        status: 'ativo',
        completedSessions: pkg.completedSessions,
      },
      data: { completedSessions: { increment: 1 } },
    });

    if (updated.count !== 1) continue;

    if (pkg.completedSessions + 1 >= pkg.totalSessions) {
      await tx.package.updateMany({
        where: { id: pkg.id, status: 'ativo' },
        data: { status: 'concluido' },
      });
    }

    return true;
  }

  return false;
}
