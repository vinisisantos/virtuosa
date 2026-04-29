// Quick script to add providerType column to EvolutionConfig
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    // Try raw SQL to add column if not exists
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "EvolutionConfig" 
      ADD COLUMN IF NOT EXISTS "providerType" TEXT NOT NULL DEFAULT 'evolution'
    `);
    console.log('✅ providerType column added (or already exists)');
  } catch (e) {
    console.error('Error:', e.message);
  }
  
  // Verify
  const configs = await prisma.$queryRawUnsafe(`
    SELECT "id", "unit", "instanceName", "providerType" FROM "EvolutionConfig" LIMIT 10
  `);
  console.log('Current configs:', configs);
  
  await prisma.$disconnect();
}

main();
