import { before, beforeEach, after } from 'node:test';
import { registerHooks } from 'node:module';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PGlite } from '@electric-sql/pglite';
import { EVALUATION_GROUP_INSTANCE_ID, EVALUATION_GROUP_SETTING_KEY } from '../../src/lib/whatsapp/evaluation-group-notice-config.ts';
registerHooks({resolve(s,c,n){if(s==='@/lib/db')return {url:'data:text/javascript,export const prisma={};',shortCircuit:true};return n(s,c);}});
export const api = await import('../../src/lib/whatsapp/evaluation-group-notice.ts');
export const pg = new PGlite({parsers:{1114:v=>new Date(`${v}Z`)}});
export const state = {};
const col=k=>Prisma.raw(`"${k}"`);
const query=q=>pg.query(q.text,q.values);
const sql=args=>Array.isArray(args[0])?Prisma.sql(args[0],...args.slice(1)):args[0];
function whereSql(where){
  return Prisma.join(Object.entries(where).map(([k,v])=>{
    if(k==='OR')return Prisma.sql`(${Prisma.join(v.map(whereSql),' OR ')})`;
    if(v===null)return Prisma.sql`${col(k)} IS NULL`;
    if(v&&typeof v==='object'&&!(v instanceof Date)){
      const [op,value]=Object.entries(v)[0];
      if(op==='in')return Prisma.sql`${col(k)} IN (${Prisma.join(value)})`;
      return Prisma.sql`${col(k)} ${Prisma.raw({not:'<>',lt:'<',lte:'<=',gte:'>=',gt:'>'}[op])} ${value}`;
    }
    return Prisma.sql`${col(k)}=${v}`;
  }),' AND ');
}
export function database({beforeFence}={}){
  return {
    $queryRaw:async(...args)=>{state.operations++;return (await query(sql(args))).rows;},
    $executeRaw:async(...args)=>{state.operations++;await beforeFence?.();return (await query(sql(args))).affectedRows;},
    appSetting:{findUnique:async({where})=>{state.operations++;return (await pg.query('SELECT value FROM "AppSetting" WHERE key=$1',[where.key])).rows[0]??null;}},
    agendamento:{findUnique:async({where})=>{state.operations++;return (await pg.query('SELECT * FROM "Agendamento" WHERE id=$1',[where.id])).rows[0]??null;}},
    whatsAppInstance:{findUnique:async({where})=>{state.operations++;return (await pg.query('SELECT * FROM "WhatsAppInstance" WHERE id=$1',[where.id])).rows[0]??null;}},
    whatsAppEvaluationGroupNotice:{
      findUnique:async({where})=>{state.operations++;const k=where.appointmentId_eventKey;return (await pg.query('SELECT * FROM "WhatsAppEvaluationGroupNotice" WHERE "appointmentId"=$1 AND "eventKey"=$2',[k.appointmentId,k.eventKey])).rows[0]??null;},
      upsert:async({create,where})=>{
        state.operations++;const data={id:randomUUID(),...create,updatedAt:state.now};const keys=Object.keys(data);
        const r=await query(Prisma.sql`INSERT INTO "WhatsAppEvaluationGroupNotice" (${Prisma.join(keys.map(col))}) VALUES (${Prisma.join(keys.map(k=>data[k]))}) ON CONFLICT ("appointmentId","eventKey") DO NOTHING RETURNING id,state`);
        const k=where.appointmentId_eventKey;return r.rows[0]??(await pg.query('SELECT id,state FROM "WhatsAppEvaluationGroupNotice" WHERE "appointmentId"=$1 AND "eventKey"=$2',[k.appointmentId,k.eventKey])).rows[0];
      },
      updateMany:async({where,data})=>{state.operations++;return {count:(await query(Prisma.sql`UPDATE "WhatsAppEvaluationGroupNotice" SET ${Prisma.join(Object.entries(data).map(([k,v])=>Prisma.sql`${col(k)}=${v}`))} WHERE ${whereSql(where)}`)).affectedRows};},
      findMany:async({where,take})=>{state.operations++;return (await query(Prisma.sql`SELECT id FROM "WhatsAppEvaluationGroupNotice" WHERE ${whereSql(where)} ORDER BY "createdAt" ASC LIMIT ${take}`)).rows;},
    },
  };
}
export const migration=async name=>pg.exec(await readFile(new URL(`../../prisma/migrations/${name}/migration.sql`,import.meta.url),'utf8'));
export const finalize=async()=>pg.exec(await readFile(new URL('../../prisma/migrations/20261017150000_evaluation_group_reschedule_events/finalize.sql',import.meta.url),'utf8'));
export const saveConfig=()=>pg.query('UPDATE "AppSetting" SET value=$1 WHERE key=$2',[JSON.stringify(state.config),EVALUATION_GROUP_SETTING_KEY]);
export const notice=async id=>(await pg.query('SELECT * FROM "WhatsAppEvaluationGroupNotice" WHERE id=$1',[id])).rows[0];
export const enqueue=(params)=>api.enqueueEvaluationGroupReschedule(database(),params,state.now);
export const dispatch=(id,options={})=>api.dispatchEvaluationGroupNotice(id,{database:database(),now:()=>state.now,fetcher:async(url,options)=>{
  state.sent.push({url,...JSON.parse(options.body)});return new Response(JSON.stringify({key:{id:'synthetic-ack'}}),{status:201});
},...options});
export async function change(startTime,extra={}){
  const previousStartTime=state.appointment.startTime;
  state.now=new Date(+state.now+1000);
  Object.assign(state.appointment,{startTime:new Date(startTime),updatedAt:state.now},extra);
  await pg.query('UPDATE "Agendamento" SET "startTime"=$1,"updatedAt"=$2,status=$3,"evaluationProcedure"=$4 WHERE id=$5',
    [state.appointment.startTime,state.now,state.appointment.status,state.appointment.evaluationProcedure,state.appointment.id]);
  const params={appointment:structuredClone(state.appointment),previousStartTime};
  return {...await enqueue(params),params};
}
before(async()=>{
  process.env.EVOLUTION_API_URL='https://provider.invalid';process.env.EVOLUTION_API_KEY='synthetic';
  await pg.exec(`SET TIME ZONE 'UTC'; CREATE TABLE "AppSetting"(key text PRIMARY KEY,value text);
    CREATE TABLE "WhatsAppInstance"(id text PRIMARY KEY,name text,unit text,status text,provider text);
    CREATE TABLE "Agendamento"(id text PRIMARY KEY,"clientName" text,"clientPhone" text,procedimento text,unit text,"startTime" timestamp,"createdAt" timestamp,"updatedAt" timestamp,status text);
    CREATE TABLE "Automation"(id text PRIMARY KEY,"triggerType" text,unit text);
    CREATE TABLE "AutomationLog"(id text PRIMARY KEY,"automationId" text,"contactPhone" text,"triggerData" jsonb,result text);
    CREATE TABLE "WhatsAppContact"(id text PRIMARY KEY,phone text);CREATE TABLE "WhatsAppConversation"(id text PRIMARY KEY,"instanceId" text,"contactId" text);`);
  for(const name of ['20261009020000_whatsapp_evaluation_group_notice','20261009120000_evaluation_group_confirmation_events','20261017120000_evaluation_group_cancellation_events','20261017150000_evaluation_group_reschedule_events'])await migration(name);
  await pg.exec('DROP INDEX IF EXISTS "WhatsAppEvaluationGroupNotice_appointmentId_key"');
});
beforeEach(async()=>{
  await pg.exec('TRUNCATE "WhatsAppEvaluationGroupNotice","AppSetting","WhatsAppInstance","Agendamento","Automation","AutomationLog","WhatsAppContact","WhatsAppConversation"');
  state.now=new Date('2026-10-17T12:00:00Z');state.sent=[];state.operations=0;
  state.config={enabled:true,instanceId:EVALUATION_GROUP_INSTANCE_ID,groupJid:'120363430057824721@g.us',groupName:'AVALIAÇOES SBC',
    activatedAt:'2026-10-09T00:00:00.000Z',confirmationsActivatedAt:'2026-10-09T12:00:00.000Z',cancellationsActivatedAt:'2026-10-17T11:00:00.000Z',reschedulesActivatedAt:state.now.toISOString(),approvedBy:'operator'};
  state.appointment={id:'appointment',clientName:'Cliente Sintética',clientPhone:'5511999999999',procedimento:'Avaliação',evaluationProcedure:'Tratamento sintético',unit:'SBC',
    startTime:new Date('2026-10-20T13:00:00Z'),createdAt:new Date('2026-10-14T13:00:00Z'),updatedAt:new Date('2026-10-16T13:00:00Z'),status:'pendente'};
  await pg.query('INSERT INTO "AppSetting" VALUES($1,$2)',[EVALUATION_GROUP_SETTING_KEY,JSON.stringify(state.config)]);
  await pg.query('INSERT INTO "WhatsAppInstance" VALUES($1,$2,$3,$4,$5)',[EVALUATION_GROUP_INSTANCE_ID,'Leads - Paloma','SBC','connected','evolution']);
  const keys=Object.keys(state.appointment);await query(Prisma.sql`INSERT INTO "Agendamento" (${Prisma.join(keys.map(col))}) VALUES (${Prisma.join(keys.map(k=>state.appointment[k]))})`);
  await api.enqueueEvaluationGroupNotice(database(),{appointment:state.appointment,isNew:true},state.now);
  state.operations=0;
});
after(()=>pg.close());
