import assert from "node:assert/strict";
import test, { before, beforeEach, after } from "node:test";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { registerHooks } from "node:module";
import { Prisma } from "@prisma/client";
import { PGlite } from "@electric-sql/pglite";
import {
  EVALUATION_GROUP_INSTANCE_ID, EVALUATION_GROUP_NAME, EVALUATION_GROUP_SETTING_KEY,
  isEvaluationGroupJid, normalizeEvaluationGroupProcedure, parseEvaluationGroupConfig,
} from "../src/lib/whatsapp/evaluation-group-notice-config.ts";
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === "@/lib/db") return { url: "data:text/javascript,export const prisma = {};", shortCircuit: true };
  return nextResolve(specifier, context);
} });
const {
  buildEvaluationGroupNoticeMessage, dispatchEvaluationGroupNotice,
  enqueueEvaluationGroupNotice, recoverEvaluationGroupNotices,
} = await import("../src/lib/whatsapp/evaluation-group-notice.ts");

// Banco PostgreSQL descartável e HTTP simulado; sem .env, clientes reais ou provedor.
const pg = new PGlite({ parsers: { 1114: value => new Date(`${value}Z`) } });
let now, appointment, config, sent, operations;
const migration = new URL("../prisma/migrations/20261009020000_whatsapp_evaluation_group_notice/migration.sql", import.meta.url);
const query = q => pg.query(q.text, q.values);
const sql = args => Array.isArray(args[0]) ? Prisma.sql(args[0], ...args.slice(1)) : args[0];
const col = key => Prisma.raw(`"${key}"`);
function whereSql(where) {
  return Prisma.join(Object.entries(where).map(([key, value]) => {
    if (key === "OR") return Prisma.sql`(${Prisma.join(value.map(whereSql), " OR ")})`;
    if (value === null) return Prisma.sql`${col(key)} IS NULL`;
    if (value && typeof value === "object" && !(value instanceof Date)) {
      const [operator, operand] = Object.entries(value)[0];
      return Prisma.sql`${col(key)} ${Prisma.raw({ lt: "<", lte: "<=", gte: ">=", gt: ">" }[operator])} ${operand}`;
    }
    return Prisma.sql`${col(key)} = ${value}`;
  }), " AND ");
}
function database({ beforeFence, failSubmitted = false } = {}) {
  return {
    $queryRaw: async (...args) => { operations++; return (await query(sql(args))).rows; },
    $executeRaw: async (...args) => { operations++; await beforeFence?.(); return (await query(sql(args))).affectedRows; },
    appSetting: { findUnique: async ({ where }) => { operations++; return (await pg.query('SELECT value FROM "AppSetting" WHERE key=$1', [where.key])).rows[0] ?? null; } },
    agendamento: { findUnique: async ({ where }) => { operations++; return (await pg.query('SELECT * FROM "Agendamento" WHERE id=$1', [where.id])).rows[0] ?? null; } },
    whatsAppInstance: { findUnique: async ({ where }) => { operations++; return (await pg.query('SELECT * FROM "WhatsAppInstance" WHERE id=$1', [where.id])).rows[0] ?? null; } },
    whatsAppEvaluationGroupNotice: {
      upsert: async ({ create, where }) => {
        operations++;
        const data = { id: randomUUID(), ...create, updatedAt: now };
        const keys = Object.keys(data);
        const inserted = await query(Prisma.sql`INSERT INTO "WhatsAppEvaluationGroupNotice" (${Prisma.join(keys.map(col))})
          VALUES (${Prisma.join(keys.map(key => data[key]))}) ON CONFLICT ("appointmentId") DO NOTHING RETURNING id`);
        return inserted.rows[0] ?? (await pg.query('SELECT id FROM "WhatsAppEvaluationGroupNotice" WHERE "appointmentId"=$1', [where.appointmentId])).rows[0];
      },
      updateMany: async ({ where, data }) => {
        operations++;
        if (failSubmitted && data.state === "submitted") throw new Error("storage unavailable");
        return { count: (await query(Prisma.sql`UPDATE "WhatsAppEvaluationGroupNotice"
          SET ${Prisma.join(Object.entries(data).map(([key, value]) => Prisma.sql`${col(key)}=${value}`))}
          WHERE ${whereSql(where)}`)).affectedRows };
      },
      findMany: async ({ where, take }) => {
        operations++;
        return (await query(Prisma.sql`SELECT id FROM "WhatsAppEvaluationGroupNotice" WHERE ${whereSql(where)} ORDER BY "createdAt" ASC LIMIT ${take}`)).rows;
      },
    },
  };
}
const job = async () => (await pg.query('SELECT * FROM "WhatsAppEvaluationGroupNotice"')).rows[0];
const saveConfig = () => pg.query('UPDATE "AppSetting" SET value=$1 WHERE key=$2', [JSON.stringify(config), EVALUATION_GROUP_SETTING_KEY]);
const enqueue = (extra = {}) => enqueueEvaluationGroupNotice(database(), { appointment, isNew: true, ...extra }, now);
async function fetcher(url, options) {
  sent.push({ url, ...JSON.parse(options.body) });
  return new Response(JSON.stringify({ key: { id: "provider-ack" }, status: "PENDING" }), { status: 201 });
}
const dispatch = (id, extra = {}) => dispatchEvaluationGroupNotice(id, { database: database(), fetcher, now: () => now, ...extra });

before(async () => {
  process.env.EVOLUTION_API_URL = "https://provider.invalid";
  process.env.EVOLUTION_API_KEY = "fixture-only";
  await pg.exec(`
    SET TIME ZONE 'UTC';
    CREATE TABLE "AppSetting" (key text PRIMARY KEY, value text);
    CREATE TABLE "WhatsAppInstance" (id text PRIMARY KEY, name text, unit text, status text, provider text);
    CREATE TABLE "Agendamento" (id text PRIMARY KEY, "clientName" text, "clientPhone" text, procedimento text,
      unit text, "startTime" timestamp, "createdAt" timestamp, status text);
  `);
  const migrationSql = await readFile(migration, "utf8");
  await pg.exec(migrationSql);
  await pg.exec(migrationSql);
});
beforeEach(async () => {
  await pg.exec('TRUNCATE "WhatsAppEvaluationGroupNotice", "AppSetting", "WhatsAppInstance", "Agendamento"');
  now = new Date("2026-10-09T12:00:00Z");
  config = { enabled: true, instanceId: EVALUATION_GROUP_INSTANCE_ID, groupJid: "120363000001@g.us",
    groupName: EVALUATION_GROUP_NAME, activatedAt: "2026-10-09T00:00:00Z", approvedBy: "operator-fixture" };
  appointment = { id: "appointment-fixture", clientName: "Maria Exemplo", clientPhone: "5511999999999", procedimento: "Avaliação",
    evaluationProcedure: "Glúteos Perfeitos", unit: "SBC", startTime: new Date("2026-10-15T17:30:00Z"),
    createdAt: new Date("2026-10-09T11:59:59Z"), status: "pendente" };
  sent = []; operations = 0;
  await pg.query('INSERT INTO "AppSetting" VALUES ($1,$2)', [EVALUATION_GROUP_SETTING_KEY, JSON.stringify(config)]);
  await pg.query('INSERT INTO "WhatsAppInstance" VALUES ($1,$2,$3,$4,$5)', [EVALUATION_GROUP_INSTANCE_ID, "Leads - Paloma", "SBC", "connected", "evolution"]);
  const keys = Object.keys(appointment);
  await query(Prisma.sql`INSERT INTO "Agendamento" (${Prisma.join(keys.map(col))}) VALUES (${Prisma.join(keys.map(key => appointment[key]))})`);
});
after(() => pg.close());

test("migração aditiva idempotente e fila protegida por RLS", async () => {
  const { rows } = await pg.query(`SELECT relrowsecurity FROM pg_class WHERE relname='WhatsAppEvaluationGroupNotice'`);
  assert.equal(rows[0].relrowsecurity, true);
  assert.equal((await pg.query('SELECT count(*)::int AS count FROM "Agendamento"')).rows[0].count, 1);
});
test("configuração fechada à caixa e grupo aprovados, sem habilitação implícita", () => {
  assert.equal(parseEvaluationGroupConfig(null), null);
  assert.equal(parseEvaluationGroupConfig("{}"), null);
  assert.equal(parseEvaluationGroupConfig({ ...config, enabled: "true" }), null);
  assert.equal(parseEvaluationGroupConfig({ ...config, instanceId: "outra-caixa" }), null);
  assert.equal(parseEvaluationGroupConfig({ ...config, groupName: "Outro Grupo" }), null);
  assert.equal(parseEvaluationGroupConfig({ ...config, groupName: "avaliações sbc" }).groupName, EVALUATION_GROUP_NAME);
  assert.equal(isEvaluationGroupJid("5511999999999@s.whatsapp.net"), false);
  assert.equal(isEvaluationGroupJid("1203-1234@g.us"), true);
  assert.equal(normalizeEvaluationGroupProcedure("Avaliação"), null);
  assert.equal(normalizeEvaluationGroupProcedure("  Barriga\nTrincada  "), "Barriga Trincada");
});
test("texto contém só os cinco campos aprovados e fuso São Paulo", () => {
  assert.equal(buildEvaluationGroupNoticeMessage(appointment), [
    "📅 *Nova avaliação — SBC*", "", "Nome: Maria Exemplo", "Telefone: 5511999999999",
    "Procedimento: Glúteos Perfeitos", "Data: 15/10/2026", "Horário: 14:30",
  ].join("\n"));
});
test("nenhuma agenda antiga, sessão, outra unidade, outra caixa ou atualização enfileira", async () => {
  assert.equal(await enqueue({ isNew: false }), null);
  assert.equal(await enqueue({ sourceInstanceId: "outra-caixa" }), null);
  for (const change of [{ unit: "Osasco" }, { procedimento: "Sessão" }, { createdAt: new Date("2026-10-08T23:59:59Z") },
    { evaluationProcedure: null }, { evaluationProcedure: "Avaliação" }, { clientPhone: null }, { clientPhone: "123456@lid" },
    { status: "desmarcou" }, { startTime: now }]) {
    assert.equal(await enqueue({ appointment: { ...appointment, ...change } }), null);
  }
  assert.equal(await job(), undefined);
  assert.equal(sent.length, 0);
});
test("sem configuração ou desativada preserva agenda e não cria aviso", async () => {
  config.enabled = false; await saveConfig();
  assert.equal(await enqueue(), null);
  await pg.exec('DELETE FROM "AppSetting"');
  assert.equal(await enqueue(), null);
  assert.equal((await pg.query('SELECT count(*)::int AS count FROM "Agendamento"')).rows[0].count, 1);
});
test("replay e dois workers concorrentes produzem um envio com JID intacto", async () => {
  const id = await enqueue(); assert.equal(await enqueue(), id);
  const results = await Promise.all([dispatch(id), dispatch(id)]);
  assert.deepEqual(results.map(result => result.status).sort(), ["skipped", "submitted"]);
  assert.equal(sent.length, 1); assert.equal(sent[0].number, config.groupJid);
  assert.equal((await job()).state, "submitted"); assert.equal((await job()).providerMessageId, "provider-ack");
  assert.equal((await dispatch(id)).status, "skipped"); assert.equal(sent.length, 1);
});
test("caminho normal cabe em nove operações e um HTTP, sem confundir PENDING com entrega", async () => {
  const id = await enqueue();
  assert.equal((await dispatch(id)).status, "submitted");
  assert.equal(operations, 8);
  assert.equal(sent.length, 1);
  assert.equal((await job()).state, "submitted");
});
test("remarcação, cancelamento ou dados alterados antes do envio cancelam snapshot", async () => {
  const id = await enqueue();
  await pg.query('UPDATE "Agendamento" SET "startTime"=$1', [new Date("2026-10-16T17:30:00Z")]);
  assert.equal((await dispatch(id)).status, "cancelled"); assert.equal(sent.length, 0);
});
test("exclusão de agenda preserva auditoria e bloqueia aviso", async () => {
  const id = await enqueue(); await pg.exec('DELETE FROM "Agendamento"');
  assert.equal((await dispatch(id)).status, "cancelled"); assert.equal(sent.length, 0);
});
test("configuração alterada durante preparação é bloqueada pelo fence SQL", async () => {
  const id = await enqueue();
  assert.equal((await dispatch(id, { database: database({ beforeFence: async () => { config.enabled = false; await saveConfig(); } }) })).status, "cancelled");
  assert.equal(sent.length, 0); assert.equal((await job()).sendStartedAt, null);
});
test("agenda alterada durante preparação é bloqueada pelo fence SQL", async () => {
  const id = await enqueue();
  await dispatch(id, { database: database({ beforeFence: async () => pg.exec('UPDATE "Agendamento" SET status=\'desmarcou\'') }) });
  assert.equal(sent.length, 0); assert.equal((await job()).state, "cancelled");
});
test("trocar grupo ou reativar configuração não redireciona aviso antigo", async () => {
  const id = await enqueue(); config.activatedAt = now.toISOString(); await saveConfig();
  assert.equal((await dispatch(id)).status, "cancelled"); assert.equal(sent.length, 0);
});
for (const kind of ["timeout", "http-error", "missing-id", "persistence-error"]) {
  test(`envio ${kind} é incerto e jamais repetido`, async () => {
    const id = await enqueue();
    const fakeFetch = async () => {
      sent.push({});
      if (kind === "timeout") throw new Error("timeout");
      return new Response(JSON.stringify(kind === "missing-id" ? {} : { key: { id: "accepted" } }), { status: kind === "http-error" ? 500 : 201 });
    };
    assert.equal((await dispatch(id, { fetcher: fakeFetch, database: database({ failSubmitted: kind === "persistence-error" }) })).status, "uncertain");
    assert.equal((await dispatch(id)).status, "skipped");
    await recoverEvaluationGroupNotices({ database: database(), fetcher, now: () => new Date(now.getTime() + 5 * 60_000) });
    assert.equal(sent.length, 1); assert.equal((await job()).state, "uncertain");
  });
}
test("crash após fence vira incerto sem novo HTTP", async () => {
  const id = await enqueue();
  const past = new Date(now.getTime() - 5 * 60_000);
  await pg.query('UPDATE "WhatsAppEvaluationGroupNotice" SET state=\'sending\', "sendStartedAt"=$1, "claimedAt"=$1', [past]);
  await recoverEvaluationGroupNotices({ database: database(), fetcher, now: () => now });
  assert.equal((await job()).state, "uncertain"); assert.equal(sent.length, 0);
  assert.equal((await dispatch(id)).status, "skipped");
});
test("crash antes do fence permite recuperação limitada e único envio", async () => {
  await enqueue(); const past = new Date(now.getTime() - 5 * 60_000);
  await pg.query('UPDATE "WhatsAppEvaluationGroupNotice" SET state=\'processing\', "claimedAt"=$1, "claimToken"=\'dead\', attempts=1', [past]);
  await recoverEvaluationGroupNotices({ database: database(), fetcher, now: () => now });
  assert.equal((await job()).state, "submitted"); assert.equal(sent.length, 1);
});
test("instância desconectada permite só três preparações sem HTTP", async () => {
  const id = await enqueue(); await pg.exec('UPDATE "WhatsAppInstance" SET status=\'disconnected\'');
  assert.equal((await dispatch(id)).status, "queued");
  now = new Date(now.getTime() + 2 * 60_000); assert.equal((await dispatch(id)).status, "queued");
  now = new Date(now.getTime() + 3 * 60_000); assert.equal((await dispatch(id)).status, "cancelled");
  assert.equal(sent.length, 0); assert.equal((await job()).sendStartedAt, null);
});
test("orçamento é rechecado depois do fence e não inicia HTTP atrasado", async () => {
  const id = await enqueue();
  const clock = Date.now;
  const wallTime = clock();
  try {
    const result = await dispatch(id, {
      deadlineMs: wallTime + 1_500,
      database: database({ beforeFence: async () => { Date.now = () => wallTime + 2_000; } }),
    });
    assert.equal(result.status, "cancelled");
  } finally { Date.now = clock; }
  assert.equal(sent.length, 0);
  assert.equal((await job()).state, "cancelled");
});
test("recuperação limita cada limpeza a vinte linhas e não repete HTTP incerto", async () => {
  const stale = new Date(now.getTime() - 5 * 60_000);
  for (const state of ["sending", "processing"]) {
    await pg.query(`INSERT INTO "WhatsAppEvaluationGroupNotice"
      (id, "appointmentId", "instanceId", "groupJid", "groupName", "configActivatedAt", "clientName", "clientPhone",
        "evaluationProcedure", "startTime", "appointmentCreatedAt", state, "claimedAt", "sendStartedAt", attempts, "updatedAt")
      SELECT $1 || series.n, $1 || series.n, $2, $3, $4, $5, 'Maria Exemplo', '5511999999999', 'Procedimento',
        $6, $5, $1, $5, CASE WHEN $1='sending' THEN $5::timestamp ELSE NULL END, 3, $5
      FROM generate_series(1,21) AS series(n)`, [state, EVALUATION_GROUP_INSTANCE_ID, config.groupJid, config.groupName, stale, appointment.startTime]);
  }
  await recoverEvaluationGroupNotices({ database: database(), fetcher, now: () => now });
  const states = Object.fromEntries((await pg.query('SELECT state, count(*)::int AS count FROM "WhatsAppEvaluationGroupNotice" GROUP BY state')).rows.map(row => [row.state, row.count]));
  assert.deepEqual(states, { uncertain: 20, cancelled: 20, processing: 1, sending: 1 });
  assert.equal(sent.length, 0);
});
