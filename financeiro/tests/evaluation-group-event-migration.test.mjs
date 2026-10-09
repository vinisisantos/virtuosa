import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const bootstrap = await readFile(new URL(
  "../prisma/migrations/20261009020000_whatsapp_evaluation_group_notice/migration.sql", import.meta.url,
), "utf8");
const expansion = await readFile(new URL(
  "../prisma/migrations/20261009120000_evaluation_group_confirmation_events/migration.sql", import.meta.url,
), "utf8");
const contract = await readFile(new URL(
  "../prisma/migrations/20261009120000_evaluation_group_confirmation_events/finalize.sql", import.meta.url,
), "utf8");
const key = "whatsapp_evaluation_group_sbc_v1";
const approvedConfig = {
  enabled: true,
  instanceId: "a6871ee7-8352-4b66-bfb2-b8dba9e4f8e3",
  groupJid: "120363430057824721@g.us",
  groupName: "AVALIAÇOES SBC",
  activatedAt: "2020-01-01T00:00:00.000Z",
  approvedBy: "migration-fixture",
  preservedField: "unchanged",
};

async function setup(t) {
  const pg = new PGlite();
  t.after(() => pg.close());
  await pg.exec(`
    CREATE TABLE "Agendamento" (id text PRIMARY KEY);
    CREATE TABLE "AppSetting" (key text PRIMARY KEY, value text);
  `);
  await pg.exec(bootstrap);
  await pg.query('INSERT INTO "AppSetting" VALUES ($1, $2)', [key, JSON.stringify(approvedConfig)]);
  return pg;
}

async function legacyInsert(pg, id, appointmentId, extraSql = "") {
  return pg.query(`
    INSERT INTO "WhatsAppEvaluationGroupNotice"
      (id,"appointmentId","instanceId","groupJid","groupName","configActivatedAt",
       "clientName","clientPhone","evaluationProcedure","startTime","appointmentCreatedAt","updatedAt")
    VALUES ($1,$2,$3,$4,$5,'2020-01-01','Pessoa Exemplo','5511999999999','Procedimento Exemplo',
            '2030-01-01T12:00:00','2020-01-02','2020-01-02') ${extraSql}
  `, [id, appointmentId, approvedConfig.instanceId, approvedConfig.groupJid, approvedConfig.groupName]);
}

async function confirmationInsert(pg, id, appointmentId, startTime = "2030-01-01T12:00:00.000Z") {
  return pg.query(`
    INSERT INTO "WhatsAppEvaluationGroupNotice"
      (id,"appointmentId","eventType","eventKey","instanceId","groupJid","groupName","configActivatedAt",
       "clientName","clientPhone","evaluationProcedure","startTime","appointmentCreatedAt","updatedAt")
    VALUES ($1,$2,'confirmed',$3,$4,$5,$6,'2020-01-01','Pessoa Exemplo','5511999999999','Procedimento Exemplo',
            $7,'2020-01-02','2020-01-02')
  `, [id, appointmentId, `confirmed:${startTime}`, approvedConfig.instanceId,
    approvedConfig.groupJid, approvedConfig.groupName, startTime]);
}

async function currentConfig(pg) {
  const { rows } = await pg.query('SELECT value FROM "AppSetting" WHERE key=$1', [key]);
  return JSON.parse(rows[0].value);
}

async function legacyUniqueExists(pg) {
  const { rows } = await pg.query(`SELECT to_regclass('"WhatsAppEvaluationGroupNotice_appointmentId_key"') IS NOT NULL AS present`);
  return rows[0].present;
}

test("expansão preserva eventos e aceita inserts/upserts da versão antiga sem ativar confirmação", async t => {
  const pg = await setup(t);
  await legacyInsert(pg, "original", "appointment-a");
  const original = (await pg.query('SELECT * FROM "WhatsAppEvaluationGroupNotice" WHERE id=\'original\'')).rows[0];
  await pg.exec(expansion);
  await pg.exec(expansion);
  await legacyInsert(pg, "during-deploy", "appointment-b");
  await legacyInsert(pg, "old-retry", "appointment-a", 'ON CONFLICT ("appointmentId") DO NOTHING');
  const rows = (await pg.query('SELECT * FROM "WhatsAppEvaluationGroupNotice" ORDER BY id')).rows;
  assert.equal(rows.length, 2);
  for (const row of rows) {
    assert.equal(row.eventType, "scheduled");
    assert.equal(row.eventKey, "scheduled");
  }
  const { eventType, eventKey, ...preserved } = rows.find(row => row.id === "original");
  assert.deepEqual(preserved, original);
  assert.equal(await legacyUniqueExists(pg), true);
  assert.deepEqual(await currentConfig(pg), approvedConfig);
  await assert.rejects(confirmationInsert(pg, "too-early", "appointment-a"), /unique constraint/);
});

test("contrato ativa corte uma vez e permite criação + confirmação por horário sem duplicidade", async t => {
  const pg = await setup(t);
  await legacyInsert(pg, "scheduled", "appointment-a");
  await pg.exec(expansion);
  await pg.exec(contract);
  const activated = await currentConfig(pg);
  assert.equal(await legacyUniqueExists(pg), false);
  assert.ok(Number.isFinite(Date.parse(activated.confirmationsActivatedAt)));
  const { confirmationsActivatedAt, ...preserved } = activated;
  assert.deepEqual(preserved, approvedConfig);
  await confirmationInsert(pg, "confirmed-a", "appointment-a");
  await assert.rejects(confirmationInsert(pg, "same-time", "appointment-a"), /unique constraint/);
  await confirmationInsert(pg, "confirmed-b", "appointment-a", "2030-01-02T12:00:00.000Z");
  await assert.rejects(legacyInsert(pg, "scheduled-retry", "appointment-a"), /unique constraint/);
  await pg.exec(contract);
  assert.deepEqual(await currentConfig(pg), activated);
  assert.equal((await pg.query('SELECT count(*)::int AS count FROM "WhatsAppEvaluationGroupNotice"')).rows[0].count, 3);
});

test("replay completo do build após contrato não recria índice legado e mantém RLS e histórico", async t => {
  const pg = await setup(t);
  await legacyInsert(pg, "scheduled", "appointment-a");
  await pg.exec(expansion);
  await pg.exec(contract);
  await confirmationInsert(pg, "confirmed", "appointment-a");
  const before = (await pg.query('SELECT * FROM "WhatsAppEvaluationGroupNotice" ORDER BY id')).rows;
  await pg.exec(bootstrap);
  await pg.exec(expansion);
  await pg.exec(bootstrap);
  await pg.exec(expansion);
  assert.equal(await legacyUniqueExists(pg), false);
  assert.deepEqual((await pg.query('SELECT * FROM "WhatsAppEvaluationGroupNotice" ORDER BY id')).rows, before);
  const { rows } = await pg.query(`SELECT relrowsecurity FROM pg_class WHERE relname='WhatsAppEvaluationGroupNotice'`);
  assert.equal(rows[0].relrowsecurity, true);
});

test("contrato aborta sem expansão e não altera configuração ou índice", async t => {
  const pg = await setup(t);
  await assert.rejects(pg.exec(contract), /Expansão por eventos ausente/);
  await pg.exec("ROLLBACK");
  assert.equal(await legacyUniqueExists(pg), true);
  assert.deepEqual(await currentConfig(pg), approvedConfig);
});

test("contrato rejeita piloto desativado, destino divergente e configuração inválida atomicamente", async t => {
  const pg = await setup(t);
  await pg.exec(expansion);
  for (const change of [
    { enabled: false }, { instanceId: "other-instance" }, { groupJid: "120363999999999999@g.us" },
    { groupName: "Outro grupo" }, { approvedBy: " " }, { activatedAt: "invalid" },
    { activatedAt: "infinity" }, { confirmationsActivatedAt: "invalid" },
  ]) {
    const invalid = { ...approvedConfig, ...change };
    await pg.query('UPDATE "AppSetting" SET value=$1 WHERE key=$2', [JSON.stringify(invalid), key]);
    await assert.rejects(pg.exec(contract));
    await pg.exec("ROLLBACK");
    assert.equal(await legacyUniqueExists(pg), true);
    assert.deepEqual(await currentConfig(pg), invalid);
  }
});

test("build executa somente expansão; contrato operacional nunca roda automaticamente", async () => {
  const build = await readFile(new URL("../scripts/vercel-build.mjs", import.meta.url), "utf8");
  assert.match(build, /20261009120000_evaluation_group_confirmation_events\/migration\.sql/);
  assert.doesNotMatch(build, /finalize\.sql/);
});

test('ativação aguarda avisos em processamento sem alterar índice ou configuração', async t => {
  const pg = await setup(t);
  await pg.exec(expansion);
  await legacyInsert(pg, 'in-flight', 'appointment-a');
  for (const state of ['processing', 'sending']) {
    await pg.query('UPDATE "WhatsAppEvaluationGroupNotice" SET state=$1', [state]);
    await assert.rejects(pg.exec(contract), /processamento/);
    await pg.exec('ROLLBACK');
    assert.equal(await legacyUniqueExists(pg), true);
    assert.deepEqual(await currentConfig(pg), approvedConfig);
  }
});
