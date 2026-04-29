import 'dotenv/config';
import pg from 'pg';
const { Client } = pg;

const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  await client.connect();
  console.log('Connected to Supabase');

  // Create EvolutionMessage table
  await client.query(`
    CREATE TABLE IF NOT EXISTS "EvolutionMessage" (
      "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
      "remoteJid" TEXT NOT NULL,
      "instanceName" TEXT NOT NULL,
      "keyId" TEXT NOT NULL,
      "fromMe" BOOLEAN NOT NULL DEFAULT false,
      "pushName" TEXT,
      "body" TEXT,
      "type" TEXT NOT NULL DEFAULT 'conversation',
      "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "status" TEXT NOT NULL DEFAULT 'delivered',
      "hasMedia" BOOLEAN NOT NULL DEFAULT false,
      "mimetype" TEXT,
      "fileName" TEXT,
      "mediaKey" TEXT,
      "directPath" TEXT,
      "mediaUrl" TEXT,
      "thumbnail" TEXT,
      "caption" TEXT,
      "audioDuration" INTEGER,
      "audioPtt" BOOLEAN NOT NULL DEFAULT false,
      "adTitle" TEXT,
      "adBody" TEXT,
      "adSourceUrl" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "EvolutionMessage_pkey" PRIMARY KEY ("id")
    );
  `);
  console.log('✅ Table EvolutionMessage created');

  // Unique constraint
  try {
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS "EvolutionMessage_remoteJid_keyId_key" ON "EvolutionMessage"("remoteJid", "keyId");`);
    console.log('✅ Unique index (remoteJid, keyId) created');
  } catch (e) { console.log('Index may already exist:', e.message); }

  // Performance indexes
  try {
    await client.query(`CREATE INDEX IF NOT EXISTS "EvolutionMessage_remoteJid_timestamp_idx" ON "EvolutionMessage"("remoteJid", "timestamp");`);
    await client.query(`CREATE INDEX IF NOT EXISTS "EvolutionMessage_instanceName_idx" ON "EvolutionMessage"("instanceName");`);
    console.log('✅ Performance indexes created');
  } catch (e) { console.log('Indexes may already exist:', e.message); }

  // Also add phoneNumber to EvolutionChatCache if not present
  try {
    await client.query(`ALTER TABLE "EvolutionChatCache" ADD COLUMN IF NOT EXISTS "phoneNumber" TEXT;`);
    console.log('✅ phoneNumber column ensured on EvolutionChatCache');
  } catch (e) { console.log('phoneNumber column may already exist:', e.message); }

  await client.end();
  console.log('Done!');
}

main().catch(e => { console.error(e); process.exit(1); });
