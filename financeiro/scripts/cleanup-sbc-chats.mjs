// Clean simulated chat cache entries for SBC and configure Mega API
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // 1. Count current cache entries for SBC
  const beforeCount = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*) as count FROM "EvolutionChatCache" WHERE "unit" = 'SBC'
  `);
  console.log('SBC cache entries before cleanup:', beforeCount);

  // 2. Delete all chat cache entries for SBC (simulated conversations)
  const deleted = await prisma.$executeRawUnsafe(`
    DELETE FROM "EvolutionChatCache" WHERE "unit" = 'SBC'
  `);
  console.log('✅ Deleted', deleted, 'simulated chat cache entries for SBC');

  // 3. Verify cleanup
  const afterCount = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*) as count FROM "EvolutionChatCache" WHERE "unit" = 'SBC'
  `);
  console.log('SBC cache entries after cleanup:', afterCount);

  await prisma.$disconnect();
}

main();
