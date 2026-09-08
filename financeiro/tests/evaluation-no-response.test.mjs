import assert from 'node:assert/strict';
import test, { before, beforeEach, after } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { DEFAULT_NO_RESPONSE_DELAY_HOURS, EVALUATION_NO_RESPONSE_TRIGGER, noResponseConfig, noResponseExecutionId, validNoResponseDelay } from '../src/lib/whatsapp/evaluation-no-response-policy.ts';
import { noResponseAutomationData, updatedNoResponseConfig } from '../src/lib/whatsapp/evaluation-no-response-automation.ts';
import { noResponseCandidatesQuery } from '../src/lib/whatsapp/evaluation-no-response-query.ts';
import { sendEvaluationNoResponseReminder } from '../src/lib/whatsapp/evaluation-no-response.ts';
import { readFile } from 'node:fs/promises';
import { EVALUATION_SCHEDULE_UNIT_CONFIGS, EVALUATION_CONFIRMATION_REQUEST_AUTOMATION_TRIGGER } from '../src/lib/whatsapp/evaluation-schedule-confirmation-message.ts';

// PostgreSQL local efêmero: não carrega .env nem acessa o banco/provedor reais.
// Prisma interpreta timestamp sem fuso em UTC; o parser padrão do PGlite usa o fuso local.
const pg = new PGlite({ parsers: { 1114: value => new Date(`${value}Z`) } });
const now = new Date('2026-09-08T15:00:00.000Z');
const activatedAt = new Date('2026-09-07T15:00:00.000Z');
const startTime = new Date('2026-09-08T18:00:00.000Z');
const sentAt = new Date('2026-09-08T13:00:00.000Z');
let automations;
const scope = unit => {
  const a = automations.find(a => a.unit === unit);
  return { id: a.id, unit, instanceId: EVALUATION_SCHEDULE_UNIT_CONFIGS.find(c => c.unit === unit).instanceId, delayHours: 2, activatedAt, updatedAt: activatedAt };
};
const candidates = async (scopes = [scope('SCS')], when = now, revalidate, conversationId = `chat-${scopes[0].unit}`) => {
  const q = noResponseCandidatesQuery(scopes, when, conversationId, revalidate);
  return (await pg.query(q.text, q.values)).rows;
};

before(async () => {
  await pg.exec(`
    CREATE TABLE "Automation" (id text PRIMARY KEY, unit text, "triggerType" text, "isActive" boolean, "updatedAt" timestamp);
    CREATE TABLE "AutomationLog" (id text PRIMARY KEY, "automationId" text, result text, "triggerData" jsonb, "executedAt" timestamp DEFAULT current_timestamp, error text);
    CREATE INDEX ON "AutomationLog" ("automationId"); CREATE INDEX ON "AutomationLog" ("executedAt");
    CREATE TABLE "WhatsAppConversation" (id text PRIMARY KEY, "instanceId" text, "contactId" text, "lastKnownJid" text, status text, "blockedAt" timestamp, "archivedAt" timestamp, "lastInboundAt" timestamp);
    CREATE TABLE "WhatsAppInstance" (id text PRIMARY KEY, unit text, name text, provider text, status text);
    CREATE TABLE "WhatsAppContact" (id text PRIMARY KEY, phone text);
    CREATE TABLE "WhatsAppMessage" (id text PRIMARY KEY, "conversationId" text, "messageId" text, "fromMe" boolean, timestamp timestamp, "createdAt" timestamp, status text);
    CREATE UNIQUE INDEX ON "WhatsAppMessage" ("conversationId", "messageId"); CREATE INDEX ON "WhatsAppMessage" ("conversationId", timestamp);
    CREATE TABLE "Agendamento" (id text PRIMARY KEY, unit text, "startTime" timestamp, "clientName" text, "clientPhone" text, status text, procedimento text, notes text);
    CREATE TABLE "SalesPipeline" (id text PRIMARY KEY, unit text, stage text);
  `);
});
beforeEach(async () => {
  await pg.exec('TRUNCATE "Automation", "AutomationLog", "WhatsAppConversation", "WhatsAppInstance", "WhatsAppContact", "WhatsAppMessage", "Agendamento", "SalesPipeline"');
  automations = EVALUATION_SCHEDULE_UNIT_CONFIGS.map(config => ({ ...noResponseAutomationData(config.unit, activatedAt), createdAt: activatedAt, updatedAt: activatedAt }));
  for (const { unit, instanceId } of EVALUATION_SCHEDULE_UNIT_CONFIGS) {
    const a = automations.find(a => a.unit === unit);
    await pg.query('INSERT INTO "Automation" VALUES ($1,$2,$3,true,$4),($5,$2,$6,true,$4)', [a.id, unit, a.triggerType, activatedAt, `request-${unit}`, EVALUATION_CONFIRMATION_REQUEST_AUTOMATION_TRIGGER]);
    await pg.query('INSERT INTO "WhatsAppInstance" VALUES ($1,$2,$3,$4,$5)', [instanceId,unit,`Leads ${unit}`,'evolution','connected']);
    await pg.query('INSERT INTO "WhatsAppContact" VALUES ($1,$2)', [`contact-${unit}`,'5511900000000']);
    await pg.query('INSERT INTO "WhatsAppConversation" (id,"instanceId","contactId","lastKnownJid",status) VALUES ($1,$2,$3,$4,$5)', [`chat-${unit}`,instanceId,`contact-${unit}`,'123@lid','open']);
    await pg.query('INSERT INTO "WhatsAppMessage" VALUES ($1,$2,$3,true,$4,$4,$5)', [`message-${unit}`,`chat-${unit}`,'same-provider-id',sentAt,'sent']);
    await pg.query('INSERT INTO "Agendamento" VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [`appointment-${unit}`,unit,startTime,'Pessoa Teste','(11) 90000-0000','pendente','Avaliação',`Nota [pipelineDealId:deal-${unit}]`]);
    await pg.query('INSERT INTO "SalesPipeline" VALUES ($1,$2,$3)', [`deal-${unit}`,unit,'agendado']);
    await pg.query('INSERT INTO "AutomationLog" (id,"automationId",result,"triggerData","executedAt") VALUES ($1,$2,$3,$4,$5)', [`source-${unit}`,`request-${unit}`,'success',JSON.stringify({action:EVALUATION_CONFIRMATION_REQUEST_AUTOMATION_TRIGGER,unit,instanceId,conversationId:`chat-${unit}`,appointmentId:`appointment-${unit}`,startTime:startTime.toISOString(),confirmationMessageId:'same-provider-id'}),new Date(sentAt.getTime()-5000)]);
  }
});
after(() => pg.close());

test('padrão 2h e prazo válido, sem faixa de horário na configuração', () => {
  assert.equal(DEFAULT_NO_RESPONSE_DELAY_HOURS, 2);
  for (const value of [0,-1,1.5,25,Infinity,null,'2']) assert.equal(validNoResponseDelay(value),false);
  assert.equal(validNoResponseDelay(2),true);
  assert.equal(noResponseConfig({ activatedAt:'invalido' }).activatedAt,null);
  for (const {unit} of EVALUATION_SCHEDULE_UNIT_CONFIGS) {
    const config=noResponseAutomationData(unit).triggerConfig;
    assert.equal(config.earliestHour,undefined);assert.equal(config.latestHour,undefined);
  }
});
test('ativação não aceita retroatividade, não muda unidade e preserva prazo', () => {
  const existing = {unit:'SCS',isActive:false,triggerConfig:{delayHours:2,activatedAt:activatedAt.toISOString(),earliestHour:8,latestHour:21}};
  const updated = updatedNoResponseConfig(existing,{isActive:true,triggerConfig:{activatedAt:'2000-01-01',units:['Osasco'],delayHours:3,earliestHour:8,latestHour:21}},now);
  assert.equal(updated.activatedAt,now.toISOString());
  assert.deepEqual(updated.units,['SCS']);
  assert.equal(updated.delayHours,3);
  assert.equal(updated.earliestHour,undefined);assert.equal(updated.latestHour,undefined);
  assert.equal(updatedNoResponseConfig({...existing,isActive:true},{isActive:true},now).activatedAt,activatedAt.toISOString());
  assert.throws(()=>updatedNoResponseConfig(existing,{triggerConfig:{delayHours:0}}));
});
test('consulta real encontra cada unidade com mesmo ID de mensagem em caixas diferentes', async () => {
  for (const {unit} of EVALUATION_SCHEDULE_UNIT_CONFIGS) {
    const rows=await candidates([scope(unit)]);
    assert.equal(rows.length,1);
    assert.equal(rows[0].unit,unit);
    assert.equal(rows[0].conversationId,`chat-${unit}`);
  }
});
test('limite exato das 2h e agendamento já iniciado', async () => {
  assert.equal((await candidates(undefined,new Date(now.getTime()-1))).length,0);
  assert.equal((await candidates()).length,1);
  assert.equal((await candidates(undefined,startTime)).length,0);
});
test('clique individual aceita confirmação vinculada anterior ao cadastro, nunca log sem mensagem exata', async () => {
  assert.equal((await candidates([{...scope('SCS'),activatedAt:new Date(sentAt.getTime()+1)}])).length,1);
  await pg.exec(`UPDATE "AutomationLog" SET "triggerData" = "triggerData" - 'confirmationMessageId'`);
  assert.equal((await candidates()).length,0);
});
test('resposta cancela mesmo com lastInboundAt defasado e timestamp de importação antigo', async () => {
  await pg.query('INSERT INTO "WhatsAppMessage" VALUES ($1,$2,$3,false,$4,$5,$6)', ['incoming','chat-SCS','incoming',activatedAt,now,'received']);
  assert.equal((await candidates()).length,0);
});
test('resposta recente registrada no resumo também interrompe', async () => {
  await pg.query('UPDATE "WhatsAppConversation" SET "lastInboundAt"=$1 WHERE id=$2',[sentAt,'chat-SCS']);
  assert.equal((await candidates()).length,0);
});
test('mensagem anterior não cancela; nova saída humana não apaga uma resposta recebida', async () => {
  await pg.query('INSERT INTO "WhatsAppMessage" VALUES ($1,$2,$3,false,$4,$4,$5)', ['old','chat-SCS','old',activatedAt,'received']);
  assert.equal((await candidates()).length,1);
  await pg.query('UPDATE "WhatsAppMessage" SET timestamp=$1 WHERE id=$2',[now,'old']);
  assert.equal((await candidates()).length,0);
});
for (const status of ['confirmado','cancelado','nao_compareceu','realizado']) test(`status ${status} não recebe lembrete`,async()=>{
  await pg.query('UPDATE "Agendamento" SET status=$1 WHERE unit=$2',[status,'SCS']);
  assert.equal((await candidates()).length,0);
});
test('não confirmou permanece elegível e horário alterado impede envio antigo',async()=>{
  await pg.exec(`UPDATE "Agendamento" SET status='nao_confirmou'`);
  assert.equal((await candidates()).length,1);
  await pg.exec(`UPDATE "Agendamento" SET "startTime"="startTime"+interval '1 hour'`);
  assert.equal((await candidates()).length,0);
});
for (const [name,sql] of [
  ['contato bloqueado',`UPDATE "WhatsAppConversation" SET "blockedAt"=current_timestamp`],
  ['conversa fechada',`UPDATE "WhatsAppConversation" SET status='closed'`],
  ['conversa arquivada',`UPDATE "WhatsAppConversation" SET "archivedAt"=current_timestamp`],
  ['instância desconectada',`UPDATE "WhatsAppInstance" SET status='disconnected'`],
  ['instância de outra unidade',`UPDATE "WhatsAppInstance" SET unit='Osasco' WHERE unit='SCS'`],
  ['Pipeline não agendado',`UPDATE "SalesPipeline" SET stage='novo'`],
  ['agenda sem vínculo',`UPDATE "Agendamento" SET notes='Sem vínculo'`],
  ['telefone diferente',`UPDATE "Agendamento" SET "clientPhone"='11988888888'`],
  ['automação desativada',`UPDATE "Automation" SET "isActive"=false`],
  ['configuração alterada',`UPDATE "Automation" SET "updatedAt"="updatedAt"+interval '1 second'`],
  ['solicitação com falha',`UPDATE "AutomationLog" SET result='failed'`],
  ['mensagem de confirmação excluída',`UPDATE "WhatsAppMessage" SET status='deleted'`],
]) test(`${name}: sem candidato`,async()=>{await pg.exec(sql);assert.equal((await candidates()).length,0);});
test('normalização mantém número nacional de dez dígitos com/sem 55',async()=>{
  await pg.exec(`UPDATE "Agendamento" SET "clientPhone"='11 4000-0000'; UPDATE "WhatsAppContact" SET phone='551140000000'`);
  assert.equal((await candidates()).length,1);
});
for (const status of ['processing','success','failed','uncertain','skipped']) test(`reserva ${status} nunca repete`,async()=>{
  await pg.query('INSERT INTO "AutomationLog" (id,result) VALUES ($1,$2)',[noResponseExecutionId('appointment-SCS',startTime),status]);
  assert.equal((await candidates()).length,0);
});

function adapter({beforeQuery,failLogSuccess=false}={}) {
  let queryCount=0;
  return {
    automation:{findFirst:async({where})=>automations.find(a=>a.unit===where.unit),update:async()=>({})},
    $queryRaw:async q=>{queryCount++;await beforeQuery?.(queryCount);return (await pg.query(q.text,q.values)).rows;},
    automationLog:{
      create:async({data})=>{try{await pg.query('INSERT INTO "AutomationLog" (id,"automationId",result,"triggerData") VALUES ($1,$2,$3,$4)',[data.id,data.automationId,data.result,JSON.stringify(data.triggerData)]);}catch(e){if(e.code==='23505')throw {code:'P2002'};throw e;}return data;},
      update:async({where,data})=>{if(failLogSuccess&&data.result==='success')throw new Error('audit unavailable');await pg.query('UPDATE "AutomationLog" SET result=$1,error=$2 WHERE id=$3',[data.result,data.error,where.id]);return data;},
    },
  };
}
const context={conversationId:'chat-SCS',instanceId:EVALUATION_SCHEDULE_UNIT_CONFIGS.find(c=>c.unit==='SCS').instanceId,unit:'SCS',actorId:'operator',actorName:'Pessoa Operadora'};
const run=(database,sendText,extra={})=>sendEvaluationNoResponseReminder(context,{database,sendText,clock:()=>now.getTime(),...extra});
test('clique envia somente à conversa escolhida, com JID, texto e autoria corretos',async()=>{
  let sends=0;let payload;
  const db=adapter();
  const result=await run(db,async params=>{await params.beforeSend();payload=params;sends++;return {messageId:'sent',sentAt:now};});
  assert.equal(result.sent,1);assert.equal(sends,1);
  assert.equal(payload.lastKnownJid,'123@lid');assert.match(payload.message,/Olá, Pessoa!/);assert.match(payload.message,/08\/09\/2026 às 15:00/);
  assert.equal(payload.conversationId,'chat-SCS');assert.equal(payload.respondedByName,'Pessoa Operadora');
  const audit=(await pg.query('SELECT "triggerData" FROM "AutomationLog" WHERE id=$1',[noResponseExecutionId('appointment-SCS',startTime)])).rows[0].triggerData;
  assert.equal(audit.source,'manual');assert.equal(audit.actorId,'operator');
  assert.equal((await pg.query(`SELECT count(*)::int AS n FROM "AutomationLog" WHERE result='success' AND "automationId" LIKE 'evaluation_confirmation_no_response:%'`)).rows[0].n,1);
});
test('resposta entre seleção e envio cancela a tentativa',async()=>{
  let sends=0;
  const db=adapter({beforeQuery:async n=>{if(n===2)await pg.query('UPDATE "WhatsAppConversation" SET "lastInboundAt"=$1',[now]);}});
  const result=await run(db,async p=>{await p.beforeSend();sends++;return {messageId:'sent',sentAt:now};});
  assert.equal(result.skipped,1);assert.equal(sends,0);
});
test('falha externa ou de auditoria não libera reenvio',async()=>{
  automations=automations.map(a=>({...a,isActive:a.unit==='SCS'}));
  let sends=0;
  const db=adapter({failLogSuccess:true});
  assert.equal((await run(db,async p=>{await p.beforeSend();sends++;return {messageId:'sent',sentAt:now};})).uncertain,1);
  assert.equal((await run(db,async()=>{sends++;throw new Error('não deveria enviar');})).checked,0);
  assert.equal(sends,1);
});
test('timeout do provedor preserva reserva sem retry',async()=>{
  automations=automations.map(a=>({...a,isActive:a.unit==='SCS'}));
  let sends=0;const db=adapter();
  const send=async p=>{await p.beforeSend();sends++;throw new Error('timeout');};
  assert.equal((await run(db,send)).uncertain,1);
  assert.equal((await run(db,send)).checked,0);assert.equal(sends,1);
});
test('sem orçamento de execução não consulta nem envia',async()=>{
  const database={automation:{findFirst:async()=>{throw new Error('não deveria consultar');}}};
  assert.equal((await run(database,async()=>{throw new Error('não envia');},{deadlineAt:now.getTime()+19000})).checked,0);
});
test('duas execuções concorrentes disputam a mesma chave primária',async()=>{
  automations=automations.map(a=>({...a,isActive:a.unit==='SCS'}));
  let sends=0;const db=adapter();
  const send=async p=>{await p.beforeSend();sends++;return {messageId:'sent',sentAt:now};};
  const results=await Promise.all([run(db,send),run(db,send)]);
  assert.equal(sends,1);assert.equal(results.reduce((n,r)=>n+r.sent,0),1);
});
test('troca de configuração entre seleção e envio cancela',async()=>{
  const db=adapter({beforeQuery:async n=>{if(n===2)await pg.exec(`UPDATE "Automation" SET "updatedAt"="updatedAt"+interval '1 second'`);}});
  let sends=0;const result=await run(db,async p=>{await p.beforeSend();sends++;return {messageId:'sent',sentAt:now};});
  assert.equal(result.skipped,1);assert.equal(sends,0);
});
test('seleção exige conversa e não usa candidato de outra caixa como fallback',async()=>{
  assert.throws(()=>noResponseCandidatesQuery([scope('SCS')],now,''));
  assert.equal((await candidates(undefined,now,undefined,'chat-Osasco')).length,0);
  assert.equal((await candidates(undefined,now,undefined,'nao-existe')).length,0);
  await assert.rejects(()=>sendEvaluationNoResponseReminder({...context,instanceId:'outra'},{database:adapter()}));
});
test('cron não chama o lembrete sem resposta',async()=>{
  const cron=await readFile(new URL('../src/app/api/cron/whatsapp-callbacks/route.ts',import.meta.url),'utf8');
  assert.doesNotMatch(cron,/evaluation-no-response|[Pp]rocessEvaluationNoResponse|sendEvaluationNoResponse/);
});

async function retimeConfirmation(unit, at) {
  const future=new Date(at.getTime()+6*3600000);
  const confirmation=new Date(at.getTime()-2*3600000);
  await pg.query('UPDATE "Agendamento" SET "startTime"=$1 WHERE unit=$2',[future,unit]);
  await pg.query('UPDATE "WhatsAppMessage" SET timestamp=$1,"createdAt"=$1 WHERE "conversationId"=$2',[confirmation,`chat-${unit}`]);
  await pg.query('UPDATE "AutomationLog" SET "executedAt"=$1,"triggerData"="triggerData" || $2::jsonb WHERE id=$3',[new Date(confirmation.getTime()-5000),JSON.stringify({startTime:future.toISOString()}),`source-${unit}`]);
}
for (const {unit,instanceId} of EVALUATION_SCHEDULE_UNIT_CONFIGS) {
  for (const time of ['2026-09-08T03:00:00Z','2026-09-08T10:59:59Z','2026-09-09T00:00:00Z','2026-09-09T02:59:59Z']) {
    test(`${unit}: envio manual liberado em ${time}, mantendo prazo e não duplicando`,async()=>{
      const at=new Date(time);await retimeConfirmation(unit,at);
      // Campos legados ainda salvos não reintroduzem a restrição.
      automations=automations.map(a=>({...a,triggerConfig:{...a.triggerConfig,earliestHour:8,latestHour:21}}));
      const ctx={...context,unit,instanceId,conversationId:`chat-${unit}`};
      let sends=0;const db=adapter();
      const send=async p=>{await p.beforeSend();sends++;return {messageId:'sent',sentAt:at};};
      assert.equal((await sendEvaluationNoResponseReminder(ctx,{database:db,sendText:send,clock:()=>at.getTime()-1})).sent,0);
      assert.equal((await sendEvaluationNoResponseReminder(ctx,{database:db,sendText:send,clock:()=>at.getTime()})).sent,1);
      assert.equal((await sendEvaluationNoResponseReminder(ctx,{database:db,sendText:send,clock:()=>at.getTime()})).sent,0);
      assert.equal(sends,1);
    });
  }
}
test('passar das 21h entre clique e revalidação não cancela envio elegível',async()=>{
  let time=new Date('2026-09-08T23:59:59Z').getTime();await retimeConfirmation('SCS',new Date(time));
  let sends=0;
  const result=await run(adapter(),async p=>{time+=2000;await p.beforeSend();sends++;return {messageId:'sent',sentAt:new Date(time)};},{clock:()=>time});
  assert.equal(result.sent,1);assert.equal(sends,1);
});
