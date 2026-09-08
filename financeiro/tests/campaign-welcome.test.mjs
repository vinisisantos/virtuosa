import assert from 'node:assert/strict';
import test, { before, beforeEach, after } from 'node:test';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { Prisma } from '@prisma/client';
import { EVALUATION_SCHEDULE_UNIT_CONFIGS as units } from '../src/lib/whatsapp/evaluation-schedule-confirmation-message.ts';
import { DEFAULT_WELCOME_GREETING, DEFAULT_WELCOME_REPLIES, WELCOME_LIBRARY_USER_ID, WELCOME_SCHEDULER_KEY, WELCOME_AUTHOR, welcomeConfig, welcomePair, isFreshWelcomeEvent } from '../src/lib/whatsapp/campaign-welcome-policy.ts';
import { claimWelcomeQuery } from '../src/lib/whatsapp/campaign-welcome-query.ts';
import { welcomeDispatchCommand } from '../src/lib/whatsapp/campaign-welcome-cron.ts';
import { findWelcomeReception, enqueueWelcome, processCampaignWelcomes } from '../src/lib/whatsapp/campaign-welcome.ts';

// PostgreSQL descartável e provedor simulado. Sem .env, pacientes ou envios externos.
const pg = new PGlite({ parsers: { 1114: value => new Date(`${value}Z`) } });
let now, arrived, activation, sent, operations, library;
const config = () => ({ libraryUserId: WELCOME_LIBRARY_USER_ID, greeting: DEFAULT_WELCOME_GREETING, replyIds: DEFAULT_WELCOME_REPLIES });
const fixtureReply = (key='barriga-trincada', title='Barriga Trincada') => ({ id: DEFAULT_WELCOME_REPLIES[key], userId: WELCOME_LIBRARY_USER_ID, title: 'ENTENDENDO A REGIÃO', content: 'O que mais te incomoda no abdômen?', category: { userId: WELCOME_LIBRARY_USER_ID, title, campaignName: null } });
const input = (unit='SCS') => ({ conversationId:`chat-${unit}`, clientId:`client-${unit}`, instanceId:units.find(c=>c.unit===unit).instanceId, unit, messageId:'first', timestamp:arrived, contactPhone:'5511900000000' });
const sql = (args) => Array.isArray(args[0]) ? Prisma.sql(args[0], ...args.slice(1)) : args[0];
const query = async q => { try { return (await pg.query(q.text,q.values)).rows; } catch (error) { console.error('SQL de teste:',error.message); throw error; } };
function adapter({ hook, failReceipt=false }={}) {
  return {
    $queryRaw: async (...args) => { const q=sql(args); operations++; await hook?.(q); return query(q); },
    $executeRaw: async (...args) => { const q=sql(args); operations++; await hook?.(q); return (await pg.query(q.text,q.values)).affectedRows; },
    whatsAppSavedReply: { findMany:async()=>{operations++;return library;} },
    whatsAppWelcomeJob: {
      findMany:async({where,take})=>{operations++;return (await pg.query('SELECT * FROM "WhatsAppWelcomeJob" WHERE status=$1 AND "claimedAt"<$2 LIMIT $3',[where.status,where.claimedAt.lt,take])).rows;},
      updateMany:async({where,data})=>{
        operations++;
        if(failReceipt && data.greetingMessageId) throw new Error('persistence unavailable');
        const keys=Object.keys(data), wheres=Object.keys(where);
        const q=Prisma.sql`UPDATE "WhatsAppWelcomeJob" SET ${Prisma.join(keys.map(key=>Prisma.sql`${Prisma.raw(`"${key}"`)}=${data[key]}`))} WHERE ${Prisma.join(wheres.map(key=>Prisma.sql`${Prisma.raw(`"${key}"`)}=${where[key]}`),' AND ')}`;
        return {count:(await pg.query(q.text,q.values)).affectedRows};
      },
    },
  };
}
const job = async(unit='SCS') => (await pg.query('SELECT * FROM "WhatsAppWelcomeJob" WHERE "conversationId"=$1',[`chat-${unit}`])).rows[0];
async function queue(unit='SCS') { return enqueueWelcome(input(unit),adapter()); }
async function outgoing(params) {
  await params.beforeSend(); sent.push(params);
  const messageId=randomUUID();
  await pg.query('INSERT INTO "WhatsAppMessage" (id,"conversationId","messageId","fromMe",timestamp,"createdAt",status,body) VALUES ($1,$2,$1,true,$3,$3,$4,$5)',[messageId,params.conversationId,now,'sent',params.message]);
  return {messageId,sentAt:now};
}
const run = (extra={}) => processCampaignWelcomes({ database:adapter(), send:outgoing, now:()=>now, onError:error=>console.log('Worker de teste:',error.message), ...extra });

before(async()=>{
  await pg.exec(`
    SET TIME ZONE 'UTC';
    CREATE SCHEMA net;
    CREATE TABLE net.requests (id bigserial PRIMARY KEY, headers jsonb);
    CREATE FUNCTION net.http_post(url text, headers jsonb, body jsonb, timeout_milliseconds integer) RETURNS bigint LANGUAGE sql AS $$ INSERT INTO net.requests(headers) VALUES(headers) RETURNING id $$;
    CREATE TABLE "Automation" (id text PRIMARY KEY, unit text, "triggerType" text, "isActive" boolean, "updatedAt" timestamp, "triggerConfig" jsonb, "executionCount" integer DEFAULT 0, "lastExecutedAt" timestamp);
    CREATE TABLE "AutomationLog" (id text PRIMARY KEY, "automationId" text, "contactPhone" text, "triggerData" jsonb, result text, error text, "executedAt" timestamp);
    CREATE TABLE "AppSetting" (key text PRIMARY KEY, value text);
    CREATE TABLE "WhatsAppSavedReply" (id text PRIMARY KEY, "userId" text, "categoryId" text);
    CREATE TABLE "WhatsAppSavedReplyCategory" (id text PRIMARY KEY, "userId" text, title text, "campaignName" text);
    CREATE TABLE "Client" (id text PRIMARY KEY, unit text, "arrivedAt" timestamp, "isActive" boolean, "campaignName" text);
    CREATE TABLE "WhatsAppConversation" (id text PRIMARY KEY, "instanceId" text, "contactId" text, "createdAt" timestamp, "lastKnownJid" text, "blockedAt" timestamp, "archivedAt" timestamp, "closedAt" timestamp, status text, "assignedTo" text);
    CREATE TABLE "WhatsAppInstance" (id text PRIMARY KEY, unit text, name text, provider text, status text, "capturesLeads" boolean);
    CREATE TABLE "WhatsAppContact" (id text PRIMARY KEY, phone text);
    CREATE TABLE "WhatsAppMessage" (id text PRIMARY KEY, "conversationId" text, "messageId" text, "fromMe" boolean, timestamp timestamp, "createdAt" timestamp, status text, body text);
    CREATE UNIQUE INDEX ON "WhatsAppMessage"("conversationId","messageId");
    CREATE TABLE "SalesPipeline" (id text PRIMARY KEY, unit text, "clientId" text, stage text, "lostReason" text, "closedAt" timestamp);
    CREATE TABLE "Agendamento" (id text PRIMARY KEY, unit text, "startTime" timestamp, "clientPhone" text, status text);
  `);
  const migration=await readFile(new URL('../prisma/migrations/20260908020000_campaign_welcome_queue/migration.sql',import.meta.url),'utf8');
  await pg.exec(migration); await pg.exec(migration); // idempotência real
});
beforeEach(async()=>{
  await pg.exec('TRUNCATE "WhatsAppWelcomeJob", "Automation", "AutomationLog", "AppSetting", "Client", "WhatsAppConversation", "WhatsAppInstance", "WhatsAppContact", "WhatsAppMessage", "SalesPipeline", "Agendamento" CASCADE');
  now=new Date(); arrived=new Date(now.getTime()-60_000); activation=new Date(now.getTime()-86400_000); sent=[];operations=0;library=[fixtureReply()];
  await pg.exec('TRUNCATE "WhatsAppSavedReply", "WhatsAppSavedReplyCategory"');
  await pg.query('INSERT INTO "WhatsAppSavedReply" VALUES ($1,$2,$3)',[library[0].id,WELCOME_LIBRARY_USER_ID,'category']);
  await pg.query('INSERT INTO "WhatsAppSavedReplyCategory" VALUES ($1,$2,$3,null)',['category',WELCOME_LIBRARY_USER_ID,'Barriga Trincada']);
  await pg.query('INSERT INTO "AppSetting" VALUES ($1,$2)',[WELCOME_SCHEDULER_KEY,JSON.stringify({readyAt:activation.toISOString()})]);
  for(const {unit,instanceId} of units){
    await pg.query('INSERT INTO "Automation" (id,unit,"triggerType","isActive","updatedAt","triggerConfig") VALUES ($1,$2,$3,true,$4,$5)',[`campaign_welcome:${unit}`,unit,'campaign_welcome',activation,JSON.stringify(config())]);
    await pg.query('INSERT INTO "Client" VALUES ($1,$2,$3,true,$4)',[`client-${unit}`,unit,arrived,'Barriga Trincada']);
    await pg.query('INSERT INTO "WhatsAppInstance" VALUES ($1,$2,$3,$4,$5,true)',[instanceId,unit,`Leads ${unit}`,'evolution','connected']);
    await pg.query('INSERT INTO "WhatsAppContact" VALUES ($1,$2)',[`contact-${unit}`,'5511900000000']);
    await pg.query('INSERT INTO "WhatsAppConversation" (id,"instanceId","contactId","createdAt","lastKnownJid",status,"assignedTo") VALUES ($1,$2,$3,$4,$5,$6,$7)',[`chat-${unit}`,instanceId,`contact-${unit}`,arrived,'123@lid','waiting_response','automatic-owner']);
    await pg.query('INSERT INTO "WhatsAppMessage" VALUES ($1,$2,$3,false,$4,$4,$5,$6)',[`in-${unit}`,`chat-${unit}`,'first',arrived,'received','Olá vim pelo anúncio']);
    await pg.query('INSERT INTO "SalesPipeline" (id,unit,"clientId",stage) VALUES ($1,$2,$3,$4)',[`deal-${unit}`,unit,`client-${unit}`,'novo_lead']);
  }
});
after(()=>pg.close());

test('migração, reserva e replay: uma única recepção por conversa nas três unidades',async()=>{
  for(const {unit} of units){assert.equal((await findWelcomeReception(input(unit),adapter())).isActive,true);await queue(unit);await queue(unit);}
  assert.equal((await pg.query('SELECT count(*)::int AS n FROM "WhatsAppWelcomeJob"')).rows[0].n,3);
  await run();assert.equal(sent.length,6,JSON.stringify((await pg.query('SELECT status,reason FROM "WhatsAppWelcomeJob"')).rows));
  for(const {unit} of units){const j=await job(unit);assert.equal(j.status,'completed');assert.notEqual(j.greetingMessageId,j.questionMessageId);assert.equal(sent.filter(p=>p.conversationId===`chat-${unit}`)[0].message,DEFAULT_WELCOME_GREETING);}
  await run();assert.equal(sent.length,6);
});
test('aguarda exatamente 60s, não envia cedo e preserva JID/autoria',async()=>{
  await queue();await run({now:()=>new Date(now.getTime()-1)});assert.equal(sent.length,0);
  await run();assert.equal(sent.length,2);assert.equal(sent[0].lastKnownJid,'123@lid');assert.equal(sent[0].respondedByName,WELCOME_AUTHOR);assert.doesNotMatch(sent[0].message,/nome|Claudenice|\{\{/);
});
test('sem agendador pronto conserva caminho antigo e não enfileira',async()=>{
  await pg.query('UPDATE "AppSetting" SET value=$1',[JSON.stringify({readyAt:null})]);
  assert.equal(await findWelcomeReception(input(),adapter()),null);await queue();assert.equal(await job(),undefined);
});
for(const [name,change] of [
  ['conversa antiga',`UPDATE "WhatsAppConversation" SET "createdAt"='2020-01-01'`],
  ['lead antigo',`UPDATE "Client" SET "arrivedAt"='2020-01-01'`],
  ['transferência',`UPDATE "Client" SET unit='SBC' WHERE unit='SCS'`],
  ['outra mensagem',`INSERT INTO "WhatsAppMessage" (id,"conversationId","messageId","fromMe") VALUES ('extra','chat-SCS','extra',false)`],
]) test(`${name}: nunca inicia recepção retroativa`,async()=>{await pg.exec(change);assert.equal(await findWelcomeReception(input(),adapter()),null);await queue();assert.equal(await job(),undefined);});
test('desabilitada mantém domínio da recepção nova mas não coloca na fila',async()=>{
  await pg.exec('UPDATE "Automation" SET "isActive"=false');assert.equal((await findWelcomeReception(input(),adapter())).isActive,false);await queue();assert.equal(await job(),undefined);
});
test('não usa saudação, explicação global ou outra campanha como segunda',()=>{
  for(const campaign of ['Botox',null,'Adeus Rosto Cansado']) assert.equal(welcomePair(config(),campaign,library,'SCS').question,null);
  assert.equal(welcomePair(config(),'Barriga Trincada',[{...library[0],category:null}],'SCS').question,null);
  assert.equal(welcomePair(config(),'Barriga Trincada',[{...library[0],userId:'other'}],'SCS').question,null);
  assert.equal(welcomePair(config(),'Barriga Trincada',[{...library[0],category:{...library[0].category,campaignName:'Botox'}}],'SCS').question,null);
  assert.throws(()=>welcomePair({...config(),libraryUserId:'other'},'Barriga Trincada',library,'SCS'));
});
test('sete mapeamentos explícitos, pastas/acentos e 60ml versus 120ml isolados',()=>{
  const names=['Preenchimento Facial','Glúteos Perfeitos','Barriga Trincada','Harmonização de Glúteos','Combo Harmonização','Glúteos Perfeitos 120ml','Harmonização de Mamas'];
  Object.keys(DEFAULT_WELCOME_REPLIES).forEach((key,index)=>{
    const reply=fixtureReply(key,names[index]);
    for(const {unit} of units)assert.equal(welcomePair(config(),names[index],[reply],unit).replyId,reply.id);
  });
  assert.equal(welcomePair(config(),'Glúteos Perfeitos 120ml',[fixtureReply('gluteos-perfeito','Glúteos Perfeitos')],'SCS').question,null);
});
test('nome e variáveis não resolvidas são bloqueados sem alterar resposta manual',()=>{
  assert.throws(()=>welcomePair({...config(),greeting:'Olá {{nome}}'},'Barriga Trincada',library,'SCS'));
  assert.equal(welcomePair(config(),'Barriga Trincada',[{...library[0],content:'Olá {{nome}}'}],'SCS').question,null);
  assert.equal(welcomeConfig(null).libraryUserId,'');
});
test('faltando pergunta envia só saudação e registra lacuna de configuração',async()=>{
  library=[];await queue();await run();assert.equal(sent.length,1);assert.equal((await job()).status,'greeting_only');
  assert.equal((await pg.query('SELECT result FROM "AutomationLog"')).rows[0].result,'greeting_only');
});
for(const [name,change] of [
  ['resposta humana',`INSERT INTO "WhatsAppMessage" (id,"conversationId","messageId","fromMe",status) VALUES ('human','chat-SCS','human',true,'sent')`],
  ['agendado no funil',`UPDATE "SalesPipeline" SET stage='agendado' WHERE unit='SCS'`],
  ['agenda sem vínculo de funil',`INSERT INTO "Agendamento" VALUES ('appt','SCS',now()+interval '1 day','(11) 90000-0000','pendente')`],
  ['bloqueio',`UPDATE "WhatsAppConversation" SET "blockedAt"=now()`],
  ['arquivamento',`UPDATE "WhatsAppConversation" SET "archivedAt"=now()`],
  ['fechamento',`UPDATE "WhatsAppConversation" SET status='closed'`],
  ['transferência da instância',`UPDATE "WhatsAppInstance" SET unit='Osasco' WHERE unit='SCS'`],
  ['troca do telefone',`UPDATE "WhatsAppContact" SET phone='5511900000001'`],
  ['automação desativada',`UPDATE "Automation" SET "isActive"=false`],
]) test(`${name} antes de enviar interrompe sem mensagem`,async()=>{await queue();await pg.exec(change);await run();assert.equal(sent.length,0);assert.equal((await job()).status,'cancelled');});
test('desconectada adia sem tentativa externa; expira sem enviar muito tarde',async()=>{
  await queue();await pg.exec(`UPDATE "WhatsAppInstance" SET status='disconnected'`);await run();assert.equal(sent.length,0);assert.equal((await job()).status,'pending');
  await run({now:()=>new Date(now.getTime()+16*60_000)});assert.equal((await job()).status,'cancelled');
});
test('resposta entre as etapas suspende segunda inclusive timestamp antigo',async()=>{
  await queue();await run({send:async p=>{const receipt=await outgoing(p);await pg.query('INSERT INTO "WhatsAppMessage" VALUES ($1,$2,$1,false,$3,$4,$5,$6)',['reply','chat-SCS',arrived,now,'received','Tenho dúvida']);return receipt;}});
  assert.equal(sent.length,1);assert.equal((await job()).reason,'lead_replied_after_greeting');
});
test('mudança de campanha entre etapas não mistura protocolos',async()=>{
  await queue();await run({send:async p=>{const r=await outgoing(p);await pg.exec(`UPDATE "Client" SET "campaignName"='Botox' WHERE unit='SCS'`);return r;}});
  assert.equal(sent.length,1);assert.equal((await job()).reason,'campaign_changed');
});
test('revalida imediatamente antes do envio, não somente ao selecionar',async()=>{
  await queue();await run({send:async p=>{await pg.exec(`UPDATE "WhatsAppConversation" SET "blockedAt"=now()`);return outgoing(p);}});
  assert.equal(sent.length,0);assert.equal((await job()).status,'cancelled');
});
test('timeout do provedor não pode reenviar mesmo após reinício do worker',async()=>{
  await queue();let attempts=0;
  await run({send:async p=>{await p.beforeSend();attempts++;throw new Error('timeout depois do aceite');}});
  assert.equal((await job()).status,'uncertain');await run();assert.equal(attempts,1);assert.equal(sent.length,0);
});
test('aceite seguido de falha na persistência também não repete',async()=>{
  await queue();await run({database:adapter({failReceipt:true})});assert.equal(sent.length,1);assert.equal((await job()).status,'uncertain');await run();assert.equal(sent.length,1);
});
test('pode retomar só segunda etapa quando saudação e snapshot foram persistidos',async()=>{
  await queue();let clock=now;
  await run({now:()=>clock,send:async p=>{const r=await outgoing(p);clock=new Date(now.getTime()+26_000);return r;}});
  assert.equal((await job()).phase,1);assert.equal(sent.length,1);await run({now:()=>clock});assert.equal(sent.length,2);assert.equal((await job()).status,'completed');
});
test('snapshot mantém pergunta já preparada se biblioteca muda entre etapas',async()=>{
  await queue();const original=library[0].content;
  await run({send:async p=>{const r=await outgoing(p);library[0].content='Novo texto';return r;}});
  assert.equal(sent.length,2);assert.equal(sent[1].message,original);
});
test('claim concorrente nunca entrega mesmo job a dois workers',async()=>{
  await queue();const results=await Promise.all([query(claimWelcomeQuery('a',now)),query(claimWelcomeQuery('b',now))]);
  assert.equal(results.flat().length,1);
});
test('interrupção antes do HTTP retoma; durante HTTP fica incerta',async()=>{
  await queue();await pg.exec(`UPDATE "WhatsAppWelcomeJob" SET status='processing',"claimToken"='old',"claimedAt"=now()-interval '3 minutes'`);await run();assert.equal(sent.length,2);
  await queue('SBC');await pg.exec(`UPDATE "WhatsAppWelcomeJob" SET status='sending',"claimToken"='old',"claimedAt"=now()-interval '3 minutes' WHERE unit='SBC'`);await run();assert.equal(sent.length,2);assert.equal((await job('SBC')).status,'uncertain');
});
test('eventos de histórico, saída, instância pessoal e data inválida não iniciam',()=>{
  const base={fromMe:false,sendable:true,capturesLeads:true,unit:'SCS',instanceId:units.find(c=>c.unit==='SCS').instanceId,conversationCreatedAt:arrived,timestamp:arrived,payload:{event:'messages.upsert',data:{type:'notify'}}};
  assert.equal(isFreshWelcomeEvent(base,now),true);
  for(const change of [{fromMe:true},{sendable:false},{capturesLeads:false},{instanceId:'personal'},{unit:'Todas'},{timestamp:new Date('invalid')},{timestamp:activation},{conversationCreatedAt:activation},{payload:{event:'messages.set'}},{payload:{data:{type:'append'}}}])assert.equal(isFreshWelcomeEvent({...base,...change},now),false);
});
test('carga por par é limitada e abrir Inbox não participa desta consulta',async()=>{
  await queue();operations=0;await run();assert.ok(operations<=25,`operações medidas: ${operations}`);console.log(`Recepção: ${operations} operações de worker no adapter + 6 operações do sender + 2 de entrada (amortizar manutenção/biblioteca por lote).`);
});
test('agendador SQL não invoca HTTP em fila vazia/futura; chama somente no vencimento',async()=>{
  const command=welcomeDispatchCommand("synthetic'quote");
  await pg.exec('TRUNCATE net.requests');
  await pg.exec(command);assert.equal((await pg.query('SELECT * FROM net.requests')).rows.length,0);
  await queue();await pg.exec(`UPDATE "WhatsAppWelcomeJob" SET "dueAt"=now()+interval '1 minute'`);
  await pg.exec(command);assert.equal((await pg.query('SELECT * FROM net.requests')).rows.length,0);
  await pg.exec(`UPDATE "WhatsAppWelcomeJob" SET "dueAt"=now()-interval '1 second'`);
  await pg.exec(command);const requests=(await pg.query('SELECT * FROM net.requests')).rows;
  assert.equal(requests.length,1);assert.equal(requests[0].headers.Authorization,"Bearer synthetic'quote");
  await pg.exec(`UPDATE "WhatsAppWelcomeJob" SET status='completed'`);await pg.exec(command);
  assert.equal((await pg.query('SELECT * FROM net.requests')).rows.length,1);
});
test('histórico de sincronização não ganha saudação e marco aguarda runtime publicado',async()=>{
  const request={...input(),timestamp:new Date(activation.getTime()-1)};assert.equal(await findWelcomeReception(request,adapter()),null);
  await pg.exec('TRUNCATE net.requests');await pg.query('UPDATE "AppSetting" SET value=$1',[JSON.stringify({readyAt:null,installedAt:now.toISOString()})]);
  await pg.exec(welcomeDispatchCommand('synthetic'));assert.equal((await pg.query('SELECT * FROM net.requests')).rows.length,1);
  await pg.query('UPDATE "AppSetting" SET value=$1',[JSON.stringify({readyAt:null,installedAt:activation.toISOString()})]);
  await pg.exec(welcomeDispatchCommand('synthetic'));assert.equal((await pg.query('SELECT * FROM net.requests')).rows.length,1,'bootstrap com deploy falho não chama HTTP para sempre');
});
test('remoção ou troca de categoria entre etapas não reaproveita pergunta inválida',async()=>{
  await queue();await run({send:async p=>{const receipt=await outgoing(p);await pg.exec(`UPDATE "WhatsAppSavedReplyCategory" SET "campaignName"='Botox'`);return receipt;}});
  assert.equal(sent.length,1);assert.equal((await job()).reason,'reply_category_changed');
});
test('agendamento por telefone de dez dígitos normaliza o código 55',async()=>{
  await queue();await pg.exec(`UPDATE "WhatsAppContact" SET phone='551140000000'; UPDATE "WhatsAppWelcomeJob" SET "contactPhone"='551140000000';
    INSERT INTO "Agendamento" VALUES ('appt','SCS',now()+interval '1 day','11 4000-0000','pendente')`);
  await run();assert.equal(sent.length,0);assert.equal((await job()).reason,'lead_already_attended_or_scheduled');
});
