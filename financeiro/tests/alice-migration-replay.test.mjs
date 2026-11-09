import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const legacy = await readFile(new URL("../prisma/migrations/20260920230000_ai_assistant_suggestions_sbc/migration.sql", import.meta.url), "utf8");
const autonomy = await readFile(new URL("../prisma/migrations/20261109010000_alice_autonomous_turns/migration.sql", import.meta.url), "utf8");
test("replay da migração antiga preserva o modo agente já publicado, sem desativar ou reescrever conversas", async () => {
  const pg = new PGlite();
  try {
    await pg.exec('CREATE TABLE "WhatsAppConversation" (id TEXT PRIMARY KEY); CREATE TABLE "AppSetting" (id TEXT PRIMARY KEY, key TEXT UNIQUE, value TEXT, "createdAt" TIMESTAMP, "updatedAt" TIMESTAMP)');
    await pg.exec(legacy);
    await assert.rejects(pg.exec('INSERT INTO "WhatsAppConversation" (id,"aiMode") VALUES (\'before-release\',\'agent\')'), /check/i);
    await pg.exec(autonomy);
    await pg.exec('INSERT INTO "WhatsAppConversation" (id,"aiMode") VALUES (\'active-chat\',\'agent\')');
    for (let attempt = 0; attempt < 2; attempt++) {
      await pg.exec(legacy);
      assert.deepEqual((await pg.query('SELECT id,"aiMode" FROM "WhatsAppConversation"')).rows, [{ id: "active-chat", aiMode: "agent" }]);
      await pg.exec(autonomy);
    }
    await assert.rejects(pg.exec('UPDATE "WhatsAppConversation" SET "aiMode"=\'invalid\''), /check/i);
  } finally { await pg.close(); }
});
