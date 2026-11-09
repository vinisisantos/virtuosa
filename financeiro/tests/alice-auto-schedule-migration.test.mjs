import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("migração é repetível, inicia desativada e preserva uma ativação posterior", async () => {
  const pg = new PGlite();
  try {
    await pg.exec('CREATE TABLE "AppSetting" ("id" TEXT PRIMARY KEY, "key" TEXT NOT NULL UNIQUE, "value" TEXT NOT NULL, "createdAt" TIMESTAMP NOT NULL, "updatedAt" TIMESTAMP NOT NULL)');
    const migration = readFileSync(new URL("../prisma/migrations/20261108230000_alice_auto_schedule/migration.sql", import.meta.url), "utf8");
    await pg.exec(migration);
    let result = await pg.query('SELECT "value" FROM "AppSetting" WHERE "key" = $1', ["alice_auto_schedule_sbc_v1"]);
    assert.equal(JSON.parse(result.rows[0].value).enabled, false);
    const activated = JSON.stringify({ enabled: true, activatedAt: "2026-11-08T12:00:00.000Z" });
    await pg.query('UPDATE "AppSetting" SET "value" = $1 WHERE "key" = $2', [activated, "alice_auto_schedule_sbc_v1"]);
    await pg.exec(migration);
    result = await pg.query('SELECT "value" FROM "AppSetting" WHERE "key" = $1', ["alice_auto_schedule_sbc_v1"]);
    assert.equal(result.rows[0].value, activated);
    await pg.exec(`INSERT INTO "AliceAutoSchedule" ("id", "conversationId", "replyMessageId", "offerMessageId", "appointmentId", "updatedAt") VALUES ('one', 'conversation', 'reply', 'offer', 'appointment', now())`);
    await assert.rejects(pg.exec(`INSERT INTO "AliceAutoSchedule" ("id", "conversationId", "replyMessageId", "offerMessageId", "appointmentId", "updatedAt") VALUES ('two', 'conversation', 'reply', 'offer', 'other', now())`));
  } finally { await pg.close(); }
});
