import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined;
};

function withConnectionLimit(databaseUrl?: string) {
    if (!databaseUrl) return databaseUrl;

    try {
        const url = new URL(databaseUrl);
        if (!url.searchParams.has('connection_limit')) url.searchParams.set('connection_limit', '1');
        if (!url.searchParams.has('pool_timeout')) url.searchParams.set('pool_timeout', '20');
        return url.toString();
    } catch {
        return databaseUrl;
    }
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
    datasources: {
        db: {
            url: withConnectionLimit(process.env.DATABASE_URL),
        },
    },
});

globalForPrisma.prisma = prisma;
