import 'dotenv/config';
import pg from 'pg';
const { Client } = pg;

const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  await client.connect();
  console.log('=== CLEANUP ===\n');

  // 1. Fix pushName "null" strings in EvolutionChatCache
  const fixNull = await client.query(`
    UPDATE "EvolutionChatCache" 
    SET "pushName" = NULL 
    WHERE "pushName" = 'null' OR "pushName" = ''
  `);
  console.log(`✅ Fixed ${fixNull.rowCount} 'null' pushNames in EvolutionChatCache`);

  // 2. Fix pushName "null" strings in EvolutionMessage
  const fixMsgNull = await client.query(`
    UPDATE "EvolutionMessage" 
    SET "pushName" = NULL 
    WHERE "pushName" = 'null' OR "pushName" = ''
  `);
  console.log(`✅ Fixed ${fixMsgNull.rowCount} 'null' pushNames in EvolutionMessage`);

  // 3. Delete newsletter entries from cache
  const delNewsletter = await client.query(`
    DELETE FROM "EvolutionChatCache" 
    WHERE "remoteJid" LIKE '%@newsletter'
  `);
  console.log(`✅ Deleted ${delNewsletter.rowCount} @newsletter entries from EvolutionChatCache`);

  // 4. Delete newsletter messages
  const delNewsMsgs = await client.query(`
    DELETE FROM "EvolutionMessage" 
    WHERE "remoteJid" LIKE '%@newsletter'
  `);
  console.log(`✅ Deleted ${delNewsMsgs.rowCount} @newsletter messages from EvolutionMessage`);

  // 5. Now try to backfill pushNames from EvolutionMessage → EvolutionChatCache for LID contacts
  const lidNeedName = await client.query(`
    SELECT cc."remoteJid"
    FROM "EvolutionChatCache" cc
    WHERE cc."remoteJid" LIKE '%@lid'
    AND (cc."pushName" IS NULL)
    AND cc."customName" IS NULL
  `);
  console.log(`\n─── LID contacts needing name: ${lidNeedName.rows.length} ───`);

  let resolved = 0;
  for (const row of lidNeedName.rows) {
    // Try to find a pushName from messages
    const msgName = await client.query(`
      SELECT "pushName" FROM "EvolutionMessage"
      WHERE "remoteJid" = $1 AND "fromMe" = false
      AND "pushName" IS NOT NULL
      LIMIT 1
    `, [row.remoteJid]);
    
    if (msgName.rows.length > 0 && msgName.rows[0].pushName) {
      await client.query(`UPDATE "EvolutionChatCache" SET "pushName" = $1 WHERE "remoteJid" = $2`, 
        [msgName.rows[0].pushName, row.remoteJid]);
      console.log(`  ✅ ${row.remoteJid} → "${msgName.rows[0].pushName}"`);
      resolved++;
    }
  }
  console.log(`\nResolved ${resolved}/${lidNeedName.rows.length} LID contacts from message history`);

  // 6. Show remaining "Desconhecido" contacts
  const remaining = await client.query(`
    SELECT "remoteJid", "pushName", "customName", "phoneNumber"
    FROM "EvolutionChatCache"
    WHERE ("pushName" IS NULL AND "customName" IS NULL)
    AND "remoteJid" NOT LIKE '%@newsletter'
    AND "remoteJid" NOT LIKE '%status@%'
  `);
  console.log(`\n─── Still unnamed: ${remaining.rows.length} contacts ───`);
  for (const row of remaining.rows) {
    const type = row.remoteJid.includes('@lid') ? 'LID' : 'PHONE';
    console.log(`  ${type}: ${row.remoteJid} | phone: ${row.phoneNumber || 'NULL'}`);
  }

  await client.end();
  console.log('\n=== DONE ===');
}

main().catch(e => { console.error(e); process.exit(1); });
