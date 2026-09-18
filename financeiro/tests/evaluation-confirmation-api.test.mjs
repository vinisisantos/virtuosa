import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === 'next/server') return nextResolve('next/server.js', context);
  if (specifier.startsWith('.') && context.parentURL) {
    const url = new URL(`${specifier}.ts`, context.parentURL);
    if (existsSync(url)) return nextResolve(url.href, context);
  }
  return nextResolve(specifier, context);
} });
process.env.JWT_SECRET = 'synthetic-evaluation-confirmation-secret';
process.env.EVOLUTION_API_URL = 'https://provider.example.invalid';
process.env.EVOLUTION_API_KEY = 'synthetic';
let appointment, instance, deal, client, automation, conversations, contacts, logs, messages, writes, sends, providerFails;
globalThis.prisma = {
  agendamento: { findUnique: async () => appointment },
  client: { findFirst: async () => client },
  salesPipeline: { findFirst: async () => deal },
  whatsAppInstance: { findUnique: async () => instance },
  whatsAppConversation: {
    findMany: async ({where}) => conversations.filter(c => where.instanceId.in.includes(c.instanceId)),
    findUnique: async ({where}) => conversations.find(c => c.id === where.id),
    upsert: async ({where,create}) => {
      writes++;
      let c = conversations.find(c => c.instanceId === where.contactId_instanceId.instanceId && c.contact.id === where.contactId_instanceId.contactId);
      if (!c) { c = {id:'new-chat', ...create, contact:contacts.find(c => c.id===create.contactId), lastKnownJid:null}; conversations.push(c); }
      return c;
    },
    update: async ({where,data}) => { writes++; Object.assign(conversations.find(c => c.id === where.id),data); },
  },
  whatsAppContact: {
    findMany: async () => contacts,
    upsert: async ({create}) => { writes++; const c = {id:'contact',...create}; contacts.push(c); return c; },
    update: async ({where,data}) => { writes++; const c=contacts.find(c=>c.id===where.id); Object.assign(c,data);return c; },
  },
  whatsAppMessage: { create: async ({data}) => { writes++; messages.push(data); return data; } },
  automation: {
    findFirst: async () => automation,
    create: async ({data}) => { writes++; automation = {id:'automation',...data}; return automation; },
    upsert: async ({create}) => { if (!automation) { writes++; automation = {...create}; } return automation; },
    update: async () => { writes++; return automation; },
  },
  automationLog: {
    findFirst: async ({where}) => logs.find(l => l.automationId===where.automationId && where.result.in.includes(l.result) && l.triggerData.executionKey===where.OR[0].triggerData.equals),
    create: async ({data}) => { if(logs.some(l=>l.id===data.id)) throw Object.assign(new Error('unique'),{code:'P2002'}); writes++; logs.push({...data}); return data; },
    updateMany: async () => ({count:0}),
    update: async ({where,data}) => { writes++; Object.assign(logs.find(l=>l.id===where.id),data); },
  },
  $transaction: async operations => Promise.all(operations),
};
globalThis.fetch = async (url, options) => {
  assert.match(String(url), /^https:\/\/provider\.example\.invalid\/message\/sendText\//);
  sends.push(JSON.parse(options.body));
  if(providerFails) throw new Error('synthetic provider error');
  return new Response(JSON.stringify({key:{id:'provider-message'}}),{status:200});
};
const { NextRequest } = await import('next/server.js');
const { signToken } = await import('../src/lib/auth.ts');
const { evaluationAssignedUserMarker } = await import('../src/lib/evaluation-scheduling.ts');
const { getEvaluationScheduleUnitConfigByUnit } = await import('../src/lib/whatsapp/evaluation-schedule-confirmation-message.ts');
const { GET, POST } = await import('../src/app/api/crm/evaluations/[id]/confirmation/route.ts');

function setup(unit='SCS') {
  const config=getEvaluationScheduleUnitConfigByUnit(unit);
  instance={id:config.instanceId,name:'synthetic-instance',unit,userId:'operator',status:'connected',members:[],assignmentMode:'OWNER'};
  appointment={id:'appointment',clientName:'Cliente Instagram',clientPhone:'(11) 90000-0001',unit,procedimento:'Avaliação',status:'pendente',startTime:new Date(Date.now()+86400000),notes:`[pipelineDealId:deal] ${evaluationAssignedUserMarker('operator')}`,profissional:{name:'Operador Teste'}};
  deal={id:'deal',clientId:'client',unit,stage:'agendado',source:'Instagram'};
  client={id:'client',phone:'5511900000001',unit,originUnit:unit,source:'Instagram'};
  automation={id:'automation',unit,name:'Confirmação',description:'Confirmação',isActive:true,triggerConfig:{windowHours:72,windowConfigVersion:2},steps:[]};
  conversations=[];contacts=[];logs=[];messages=[];sends=[];writes=0;providerFails=false;
}
beforeEach(()=>setup());
async function request(method='GET', options={}) {
  const {role='VENDEDOR',unit=appointment?.unit||'SCS',permissions={crm:true},authenticated=true}=options;
  const token=authenticated?await signToken({userId:'operator',name:'Operador Teste',email:'synthetic@example.invalid',role,unit,permissions}):null;
  const req=new NextRequest('http://localhost/api/crm/evaluations/appointment/confirmation?unit=Osasco&targetInstanceId=forged',{
    method,headers:{...(token?{Authorization:`Bearer ${token}`} : {}),'x-user-id':'forged','x-user-role':'ADMINISTRADOR','x-user-unit':'SCS','x-user-permissions':'{"admin":true}'},
  });
  return (method==='GET'?GET:POST)(req,{params:Promise.resolve({id:'appointment'})});
}
test('consulta sem chat é somente leitura nas três unidades; origem Instagram não muda',async()=>{
  for(const unit of ['SCS','SBC','Osasco']) {
    setup(unit);const before=structuredClone(client);const res=await request();assert.equal(res.status,200);
    const data=await res.json();assert.equal(data.visible,true);assert.equal(data.startsConversation,true);assert.equal(data.phone,'5511900000001');
    assert.equal(writes,0);assert.equal(sends.length,0);assert.deepEqual(client,before);
  }
});
test('envio cria contato/chat na caixa da unidade, grava mensagem e não altera presença/origem',async()=>{
  const res=await request('POST');assert.equal(res.status,200);const data=await res.json();
  assert.equal(data.status,'sent');assert.equal(data.conversationId,'new-chat');assert.equal(data.targetInstanceId,instance.id);
  assert.equal(contacts.length,1);assert.equal(conversations.length,1);assert.equal(conversations[0].instanceId,instance.id);
  assert.equal(sends.length,1);assert.equal(sends[0].number,'5511900000001');assert.equal(messages.length,1);assert.equal(messages[0].conversationId,'new-chat');
  assert.equal(appointment.status,'pendente');assert.equal(client.source,'Instagram');assert.equal(deal.source,'Instagram');assert.equal(client.originUnit,'SCS');
  assert.equal(logs[0].result,'success');assert.equal(logs[0].triggerData.conversationId,'new-chat');
  assert.equal((await (await request('POST')).json()).status,'already_sent');assert.equal(sends.length,1);
});
test('dois cliques concorrentes disputam a reserva e enviam uma vez',async()=>{
  const results=await Promise.all([request('POST'),request('POST')]);
  assert.deepEqual((await Promise.all(results.map(r=>r.json()))).map(r=>r.status).sort(),['already_sent','sent']);
  assert.equal(sends.length,1);assert.equal(conversations.length,1);
});
test('primeiro envio concorrente sem automação materializada também não duplica',async()=>{
  automation=null;
  const results=await Promise.all([request('POST'),request('POST')]);
  assert.deepEqual((await Promise.all(results.map(r=>r.json()))).map(r=>r.status).sort(),['already_sent','sent']);
  assert.equal(sends.length,1);
});
test('reaproveita conversa apenas na instância autorizada e preserva JID LID',async()=>{
  const contact={id:'existing-contact',phone:'5511900000001',name:'Cliente'};contacts.push(contact);
  conversations.push({id:'other-unit',instanceId:'another-instance',contact,lastKnownJid:null},{id:'existing-chat',instanceId:instance.id,contact,lastKnownJid:'123456@lid'});
  assert.equal((await (await request()).json()).startsConversation,false);
  const data=await (await request('POST')).json();assert.equal(data.conversationId,'existing-chat');assert.equal(sends[0].number,'123456@lid');assert.equal(conversations.length,2);
});
test('usa telefone do cadastro vinculado quando avaliação só tem Instagram',async()=>{
  appointment.clientPhone='@cliente123';assert.equal((await (await request()).json()).phone,client.phone);
  const res=await request('POST');assert.equal(res.status,200);assert.equal(sends[0].number,client.phone);assert.equal(appointment.clientPhone,'@cliente123');
});
test('avaliação manual sem negócio também permite confirmação com telefone',async()=>{
  appointment.notes=evaluationAssignedUserMarker('operator');deal=null;
  assert.equal((await request('POST')).status,200);assert.equal(sends.length,1);
});
test('autenticação/CRM/unidade/atribuição e permissão de resposta são obrigatórios',async()=>{
  assert.equal((await request('POST',{authenticated:false})).status,401);
  assert.equal((await request('POST',{permissions:{}})).status,403);
  assert.equal((await request('POST',{unit:'Osasco'})).status,403);
  appointment.notes='[pipelineDealId:deal]';appointment.profissional={name:'Outra responsável'};
  assert.equal((await request('POST')).status,403);
  assert.equal((await request('POST',{permissions:{crm:true,crmEvaluationsAll:true}})).status,200);
  setup();instance.members=[{userId:'operator',role:'VIEWER',isActive:true}];assert.equal((await request('POST')).status,403);
  assert.equal(sends.length,0);assert.equal(writes,0);
});
test('telefone inválido, negócio fora de agendado, status e janela impedem criação/envio',async()=>{
  for(const invalid of [null,'@5511900000001','1234','00000000000','123456789012345678']) {
    setup();appointment.clientPhone=invalid;client.phone=invalid;assert.equal((await request('POST')).status,409);assert.equal(writes,0);
  }
  setup();deal=null;assert.equal((await request('POST')).status,409);
  setup();appointment.status='confirmado';assert.equal((await request('POST')).status,409);
  setup();appointment.startTime=new Date(Date.now()+8*86400000);assert.equal((await request('POST')).status,409);assert.equal(writes,0);
  assert.equal(sends.length,0);
});
test('desconectado e automação inativa não criam chat nem enviam',async()=>{
  instance.status='disconnected';assert.equal((await (await request()).json()).connected,false);assert.equal((await request('POST')).status,409);
  instance.status='connected';automation.isActive=false;assert.equal((await request('POST')).status,409);
  assert.equal(sends.length,0);assert.equal(conversations.length,0);assert.equal(writes,0);
});
test('conversa bloqueada nunca recebe mensagem',async()=>{
  conversations.push({id:'blocked',instanceId:instance.id,contact:{phone:client.phone,name:'Cliente'},lastKnownJid:null,blockedAt:new Date()});
  assert.equal((await request('POST')).status,500);assert.equal(sends.length,0);assert.equal(messages.length,0);
});
