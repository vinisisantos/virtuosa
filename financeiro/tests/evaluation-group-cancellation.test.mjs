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
  enqueueEvaluationGroupNotice, enqueueEvaluationGroupCancellation, recoverEvaluationGroupNotices,
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
      findUnique: async ({ where }) => {
        operations++;
        const key = where.appointmentId_eventKey;
        return (await pg.query('SELECT * FROM "WhatsAppEvaluationGroupNotice" WHERE "appointmentId"=$1 AND "eventKey"=$2', [key.appointmentId, key.eventKey])).rows[0] ?? null;
      },
      upsert: async ({ create, where }) => {
        operations++;
        const data = { id: randomUUID(), ...create, updatedAt: now };
        const keys = Object.keys(data);
        const inserted = await query(Prisma.sql`INSERT INTO "WhatsAppEvaluationGroupNotice" (${Prisma.join(keys.map(col))})
          VALUES (${Prisma.join(keys.map(key => data[key]))}) ON CONFLICT ("appointmentId", "eventKey") DO NOTHING RETURNING id, state`);
        const key = where.appointmentId_eventKey;
        return inserted.rows[0] ?? (await pg.query('SELECT id, state FROM "WhatsAppEvaluationGroupNotice" WHERE "appointmentId"=$1 AND "eventKey"=$2', [key.appointmentId, key.eventKey])).rows[0];
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
    CREATE TABLE "Automation" (id text PRIMARY KEY, "triggerType" text, unit text);
    CREATE TABLE "AutomationLog" (id text PRIMARY KEY, "automationId" text, "contactPhone" text, "triggerData" jsonb, result text);
    CREATE TABLE "WhatsAppContact" (id text PRIMARY KEY, phone text);
    CREATE TABLE "WhatsAppConversation" (id text PRIMARY KEY, "instanceId" text, "contactId" text);
  `);
  const migrationSql = await readFile(migration, "utf8");
  await pg.exec(migrationSql);
  await pg.exec(migrationSql);
  const expansion = await readFile(new URL('../prisma/migrations/20261009120000_evaluation_group_confirmation_events/migration.sql', import.meta.url), 'utf8');
  await pg.exec(expansion);
  await pg.exec(expansion);
  await pg.exec(await readFile(new URL('../prisma/migrations/20261017120000_evaluation_group_cancellation_events/migration.sql', import.meta.url), 'utf8'));
  await pg.exec('DROP INDEX IF EXISTS "WhatsAppEvaluationGroupNotice_appointmentId_key"');
});
beforeEach(async () => {
  await pg.exec('TRUNCATE "WhatsAppEvaluationGroupNotice", "AppSetting", "WhatsAppInstance", "Agendamento", "Automation", "AutomationLog", "WhatsAppContact", "WhatsAppConversation"');
  now = new Date("2026-10-09T12:00:00Z");
  config = { enabled: true, instanceId: EVALUATION_GROUP_INSTANCE_ID, groupJid: "120363430057824721@g.us",
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


async function enableCancellations() { config.cancellationsActivatedAt = now.toISOString(); await saveConfig(); }
async function cancel(extra = {}) {
  appointment.status = 'desmarcou';
  await pg.query('UPDATE "Agendamento" SET status=$1, "startTime"=$2 WHERE id=$3', [appointment.status, appointment.startTime, appointment.id]);
  return enqueueEvaluationGroupCancellation(database(), { appointment, previousStatus: 'pendente', ...extra }, now);
}
const noticeById = async id => (await pg.query('SELECT * FROM "WhatsAppEvaluationGroupNotice" WHERE id=$1', [id])).rows[0];
test('cancelamento desligado, gate inválido/futuro e repetição de status não disparam', async () => {
  await enqueue();
  assert.deepEqual(await cancel(), { status: 'skipped', reason: 'disabled' });
  assert.equal(parseEvaluationGroupConfig({ ...config, cancellationsActivatedAt: 'invalid' }), null);
  config.cancellationsActivatedAt = new Date(now.getTime()+60000).toISOString(); await saveConfig();
  assert.equal((await cancel()).reason, 'disabled');
  await enableCancellations(); operations=0;
  assert.equal((await cancel({ previousStatus: 'cancelado', recoverMissingNotice: true })).reason, 'unchanged');
  assert.equal(operations,0); assert.equal(sent.length,0);
});
test('cancelamento usa dez operações e um HTTP, com mensagem distinta e horário São Paulo', async () => {
  const scheduled = await enqueue(); await dispatch(scheduled); await enableCancellations();
  operations=0; sent=[];
  const result=await cancel(); assert.equal(result.status,'queued');
  assert.equal((await dispatch(result.noticeId)).status,'submitted');
  assert.equal(operations,10); assert.equal(sent.length,1);
  assert.equal(sent[0].number,config.groupJid);
  assert.equal(sent[0].text,['❌ *Avaliação desmarcada — SBC*','','Nome: Maria Exemplo','Telefone: 5511999999999','Procedimento: Glúteos Perfeitos','Data: 15/10/2026','Horário: 14:30'].join('\n'));
  assert.equal((await noticeById(scheduled)).state,'submitted');
});
test('duas transições e dois workers concorrentes enviam uma única ocorrência', async () => {
  await enqueue(); await enableCancellations();
  appointment.status='desmarcou'; await pg.exec('UPDATE "Agendamento" SET status=\'desmarcou\'');
  const results=await Promise.all([cancel(),cancel()]);
  assert.deepEqual(results.map(r=>r.status).sort(),['already_recorded','queued']);
  assert.equal(results[0].noticeId,results[1].noticeId);
  const dispatched=await Promise.all([dispatch(results[0].noticeId),dispatch(results[1].noticeId)]);
  assert.deepEqual(dispatched.map(r=>r.status).sort(),['skipped','submitted']);
  assert.equal(sent.length,1);
  assert.equal((await cancel()).status,'already_recorded');
  assert.equal((await dispatch(results[0].noticeId)).status,'skipped');
});
test('sem prova da caixa, outra unidade, sessão ou horário passado não enfileiram', async () => {
  await enableCancellations();
  assert.equal((await cancel()).reason,'unverified_source');
  await pg.exec('UPDATE "Agendamento" SET status=\'pendente\''); appointment.status='pendente';
  await enqueue();
  for(const patch of [{unit:'Osasco'},{procedimento:'Sessão'},{startTime:now}]) {
    const result=await enqueueEvaluationGroupCancellation(database(),{appointment:{...appointment,status:'desmarcou',...patch},previousStatus:'pendente'},now);
    assert.equal(result.reason,'not_future_evaluation');
  }
  assert.equal(sent.length,0);
});
test('dados ausentes não inventam procedimento ou telefone e cancelamento pode permanecer salvo', async () => {
  await enqueue(); await enableCancellations();
  for(const [patch,reason] of [[{evaluationProcedure:null},'missing_procedure'],[{clientPhone:null},'invalid_phone'],[{clientName:''},'missing_name']]) {
    const result=await enqueueEvaluationGroupCancellation(database(),{appointment:{...appointment,status:'desmarcou',...patch},previousStatus:'pendente'},now);
    assert.equal(result.reason,reason);
  }
  assert.equal(sent.length,0);
});
for(const [label,change] of [
  ['reaberta',()=>pg.exec('UPDATE "Agendamento" SET status=\'pendente\'')],
  ['remarcada',()=>pg.query('UPDATE "Agendamento" SET "startTime"=$1',[new Date('2026-10-16T18:00:00Z')])],
  ['excluída',()=>pg.exec('DELETE FROM "Agendamento"')],
]) test('avaliação '+label+' antes do envio invalida cancelamento sem HTTP',async()=>{
  await enqueue(); await enableCancellations(); const result=await cancel(); await change();
  assert.equal((await dispatch(result.noticeId)).status,'cancelled'); assert.equal(sent.length,0);
});
test('fence impede envio se a avaliação é reaberta depois da leitura',async()=>{
  await enqueue(); await enableCancellations(); const result=await cancel();
  assert.equal((await dispatch(result.noticeId,{database:database({beforeFence:()=>pg.exec('UPDATE "Agendamento" SET status=\'confirmado\'')})})).status,'cancelled');
  assert.equal(sent.length,0);
});
test('perda da prova de origem durante preparação bloqueia o fence',async()=>{
  const scheduled=await enqueue(); await enableCancellations(); const result=await cancel();
  assert.equal((await dispatch(result.noticeId,{database:database({beforeFence:()=>pg.query('UPDATE "WhatsAppEvaluationGroupNotice" SET "groupJid"=$1 WHERE id=$2',['999999999@g.us',scheduled])})})).status,'cancelled');
  assert.equal(sent.length,0);
});
test('timeout depois de iniciar envio nunca reabre ocorrência nem recupera para novo HTTP',async()=>{
  const scheduled=await enqueue(); await dispatch(scheduled); await enableCancellations(); sent=[];
  const result=await cancel();
  assert.equal((await dispatch(result.noticeId,{fetcher:async()=>{sent.push({});throw new Error('timeout');}})).status,'uncertain');
  assert.equal((await cancel()).status,'already_recorded');
  await recoverEvaluationGroupNotices({database:database(),fetcher,now:()=>new Date(now.getTime()+300000)});
  assert.equal(sent.length,1); assert.equal((await noticeById(result.noticeId)).state,'uncertain');
});
test('pausar cancelamentos não pausa agendamentos nem altera registros aceitos',async()=>{
  const scheduled=await enqueue(); await dispatch(scheduled); await enableCancellations();
  const result=await cancel(); delete config.cancellationsActivatedAt; await saveConfig();
  assert.equal((await dispatch(result.noticeId)).status,'cancelled');
  assert.equal((await noticeById(scheduled)).state,'submitted'); assert.equal(sent.length,1);
});
test('migração repetida preserva eventos antigos/novos e rejeita chaves incompatíveis',async()=>{
  await enqueue(); await enableCancellations(); const result=await cancel(); await dispatch(result.noticeId);
  const before=(await pg.query('SELECT * FROM "WhatsAppEvaluationGroupNotice" ORDER BY id')).rows;
  for(const file of ['20261009020000_whatsapp_evaluation_group_notice','20261009120000_evaluation_group_confirmation_events','20261017120000_evaluation_group_cancellation_events']) {
    await pg.exec(await readFile(new URL('../prisma/migrations/'+file+'/migration.sql',import.meta.url),'utf8'));
  }
  assert.deepEqual((await pg.query('SELECT * FROM "WhatsAppEvaluationGroupNotice" ORDER BY id')).rows,before);
  await assert.rejects(pg.query('UPDATE "WhatsAppEvaluationGroupNotice" SET "eventKey"=$1 WHERE id=$2',['confirmed:wrong',result.noticeId]),/check constraint/);
  assert.equal((await pg.query("SELECT relrowsecurity FROM pg_class WHERE relname='WhatsAppEvaluationGroupNotice'")).rows[0].relrowsecurity,true);
});
test('ativação operacional preserva configuração, corte e histórico e exige fila drenada',async()=>{
  const scheduled=await enqueue();
  const finalize=await readFile(new URL('../prisma/migrations/20261017120000_evaluation_group_cancellation_events/finalize.sql',import.meta.url),'utf8');
  await pg.query('UPDATE "WhatsAppEvaluationGroupNotice" SET state=$1',['processing']);
  await assert.rejects(pg.exec(finalize),/processamento/); await pg.exec('ROLLBACK');
  assert.equal(JSON.parse((await pg.query('SELECT value FROM "AppSetting"')).rows[0].value).cancellationsActivatedAt,undefined);
  await pg.query('UPDATE "WhatsAppEvaluationGroupNotice" SET state=$1',['submitted']);
  await pg.exec(finalize);
  const first=JSON.parse((await pg.query('SELECT value FROM "AppSetting"')).rows[0].value);
  assert.ok(Number.isFinite(Date.parse(first.cancellationsActivatedAt)));
  const {cancellationsActivatedAt,...other}=first; assert.deepEqual(other,config);
  await pg.exec(finalize);
  assert.deepEqual(JSON.parse((await pg.query('SELECT value FROM "AppSetting"')).rows[0].value),first);
  assert.equal((await noticeById(scheduled)).state,'submitted');
});
test('retorno ao operador distingue cancelamento salvo, fila, bloqueio e envio incerto',async()=>{
  const {groupNoticeFeedback}=await import('../src/lib/whatsapp/evaluation-group-feedback.ts');
  assert.match(groupNoticeFeedback({status:'queued'},true).message,/Cancelamento salvo.*fila/);
  assert.doesNotMatch(groupNoticeFeedback({status:'queued'},true).message,/Confirmação salva/);
  assert.match(groupNoticeFeedback({status:'skipped',reason:'missing_procedure'},true).message,/Cancelamento salvo/);
  assert.equal(groupNoticeFeedback({status:'already_recorded',state:'uncertain'},true).warning,true);
  assert.match(groupNoticeFeedback({status:'skipped',reason:'disabled'},true).message,/cancelamento.*desativados/);
});
