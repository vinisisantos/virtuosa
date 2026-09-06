import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const sql=readFileSync(new URL('../prisma/migrations/20260906170000_retire_legacy_modules/migration.sql',import.meta.url),'utf8');
const targets=[...sql.matchAll(/public\."([^"\n]+)"/g)].map(m=>m[1]).filter(n=>!['AppSetting','User'].includes(n));
async function fixture() {
  const db=new PGlite();
  await db.exec(`CREATE SCHEMA cron;
    CREATE TABLE cron.job (jobid int, jobname text);
    CREATE TABLE cron.job_run_details (jobid int);
    INSERT INTO cron.job_run_details VALUES (1),(2);
    CREATE FUNCTION cron.unschedule(int) RETURNS boolean LANGUAGE plpgsql AS $$ BEGIN DELETE FROM cron.job WHERE jobid=$1; RETURN true; END $$;
    INSERT INTO cron.job VALUES (1,'ai-inbox-scs-observer-every-15-minutes'),(2,'whatsapp-callbacks');
    CREATE TABLE "AppSetting" (key text,value text);
    INSERT INTO "AppSetting" VALUES ('ai_inbox_scs_v1','{}'),('ai_inbox_scs_v1:budget:2026-09-06','{}'),('operational_setting','preserve');
    CREATE TABLE "User" (id text,permissions jsonb);
    INSERT INTO "User" VALUES ('operator','{"crm":true,"crmSilentAnalysis":true,"agenda":false}');
    CREATE TABLE "WhatsAppConversation" (id int PRIMARY KEY);
    CREATE TABLE "WhatsAppMessage" (id int,body text,"conversationId" int REFERENCES "WhatsAppConversation");
    INSERT INTO "WhatsAppConversation" VALUES (1);
    INSERT INTO "WhatsAppMessage" VALUES (1,'Mensagem operacional preservada',1);
    ${targets.map(name=>`CREATE TABLE "${name}" (id int PRIMARY KEY);`).join('\n')}
    ALTER TABLE "AiInboxObservation" ADD COLUMN conversation int REFERENCES "WhatsAppConversation";
    ALTER TABLE "AiShadowDraft" ADD COLUMN run int REFERENCES "AiShadowRun";
  `);
  return db;
}

test('migração é idempotente e preserva dados, permissões e jobs operacionais',async()=>{
  const db=await fixture();
  try {
    await db.exec(sql); await db.exec(sql);
    const tables=await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public'");
    assert.equal(tables.rows.some(r=>targets.includes(r.tablename)),false);
    assert.deepEqual((await db.query('SELECT body FROM "WhatsAppMessage"')).rows,[{body:'Mensagem operacional preservada'}]);
    assert.deepEqual((await db.query('SELECT permissions FROM "User"')).rows,[{permissions:{crm:true,agenda:false}}]);
    assert.deepEqual((await db.query('SELECT jobname FROM cron.job')).rows,[{jobname:'whatsapp-callbacks'}]);
    assert.deepEqual((await db.query('SELECT jobid FROM cron.job_run_details')).rows,[{jobid:2}]);
    assert.deepEqual((await db.query('SELECT key FROM "AppSetting"')).rows,[{key:'operational_setting'}]);
  } finally {await db.close();}
});

test('dependência externa inesperada aborta toda a limpeza, inclusive o cron',async()=>{
  const db=await fixture();
  try {
    await db.exec('CREATE TABLE "OperationalDependency" (id int REFERENCES "AiShadowRun");');
    await assert.rejects(db.exec(sql),/depend/i);
    await db.exec('ROLLBACK');
    assert.equal((await db.query('SELECT * FROM cron.job')).rows.length,2);
    assert.equal((await db.query('SELECT * FROM "AppSetting"')).rows.length,3);
    assert.ok((await db.query("SELECT to_regclass('public.\"AiShadowRun\"') AS name")).rows[0].name);
  } finally {await db.close();}
});
