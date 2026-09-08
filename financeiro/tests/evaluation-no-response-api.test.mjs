import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import { registerHooks } from 'node:module';

// API real com autenticação sintética e banco substituído, sem .env/produção.
registerHooks({ resolve(specifier, context, nextResolve) {
  return nextResolve(specifier === 'next/server' ? 'next/server.js' : specifier, context);
} });
process.env.JWT_SECRET = 'synthetic-no-response-api-test-secret';
let record, reads = 0, writes = 0, instance, lastConversationWhere, rawQueries = [];
globalThis.prisma = {
  automation: {
    findUnique: async () => { reads++; return record; },
    findFirst: async () => { reads++; return record; },
    update: async ({ data }) => { writes++; record = { ...record, ...data }; return record; },
    delete: async () => { writes++; return {}; },
  },
  whatsAppInstance: { findUnique: async () => instance },
  whatsAppConversation: { findFirst: async ({where}) => { lastConversationWhere=where; return where.id==='chat'&&where.instanceId.in.includes(instance.id)?{instanceId:instance.id}:null; } },
  $queryRaw: async q => { rawQueries.push(q); return []; },
};
const { NextRequest } = await import('next/server.js');
const { signToken } = await import('../src/lib/auth.ts');
const { PUT, POST, DELETE, GET } = await import('../src/app/api/crm/automations/route.ts');
const { noResponseAutomationData } = await import('../src/lib/whatsapp/evaluation-no-response-automation.ts');
const { POST: sendReminder } = await import('../src/app/api/whatsapp/conversations/[id]/evaluation-no-response/route.ts');
const { getEvaluationScheduleUnitConfigByUnit } = await import('../src/lib/whatsapp/evaluation-schedule-confirmation-message.ts');
const date = new Date('2026-09-07T15:00:00Z');
beforeEach(() => {
  reads = 0; writes = 0; rawQueries=[]; lastConversationWhere=null;
  record = {...noResponseAutomationData('SCS', date),updatedAt:date};
  instance={id:getEvaluationScheduleUnitConfigByUnit('SCS').instanceId,unit:'SCS',userId:'synthetic',status:'connected',members:[],assignmentMode:'OWNER'};
});
async function request(method, body, role = 'ADMINISTRADOR') {
  const token = role ? await signToken({ userId: 'synthetic', name: 'Teste', email: 'test@example.invalid', role }) : '';
  return new NextRequest('http://localhost/api/crm/automations?id=test', {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
test('sem sessão e sem perfil administrativo não lê nem altera configuração', async () => {
  assert.equal((await PUT(await request('PUT', { id: 'test' }, null))).status, 401);
  assert.equal((await PUT(await request('PUT', { id: 'test' }, 'VENDEDOR'))).status, 403);
  assert.equal((await GET(await request('GET', null, 'VENDEDOR'))).status, 403);
  assert.equal(reads, 0); assert.equal(writes, 0);
});
test('administrador edita prazo/mensagem sem mover unidade ou retroagir ativação', async () => {
  const id = record.id;
  const res = await PUT(await request('PUT', { id, unit: 'Osasco', triggerType: 'new_message', name: 'Outro nome', createdBy: 'Outro',
    triggerConfig: { delayHours: 3, activatedAt: '2000-01-01', instanceIds: ['outra'] },
    steps: [{ type: 'send_message', config: { message: 'Mensagem editada' } }], isActive: true }));
  assert.equal(res.status, 200);
  const a = (await res.json()).automation;
  assert.equal(a.id, id); assert.equal(a.unit, 'SCS'); assert.equal(a.name, 'Lembrete sem resposta — SCS');
  assert.equal(a.triggerConfig.activatedAt, date.toISOString()); assert.equal(a.triggerConfig.delayHours, 3);
  assert.equal(a.steps[0].config.message, 'Mensagem editada'); assert.equal(writes, 1);
});
test('validação rejeita prazo inválido e texto vazio sem gravar', async () => {
  assert.equal((await PUT(await request('PUT', { id: record.id, triggerConfig: { delayHours: 0 } }))).status, 400);
  assert.equal((await PUT(await request('PUT', { id: record.id, steps: [{ type: 'send_message', config: { message: '  ' } }] }))).status, 400);
  assert.equal(writes, 0);
});
test('reativação reinicia marco e tipo nativo não pode ser duplicado/excluído', async () => {
  record.isActive = false;
  assert.equal((await PUT(await request('PUT', { id: record.id, isActive: true }))).status, 200);
  assert.ok(new Date(record.triggerConfig.activatedAt) > date);
  assert.equal((await POST(await request('POST', { name: 'Cópia', triggerType: record.triggerType, steps: record.steps }))).status, 400);
  assert.equal((await DELETE(await request('DELETE'))).status, 400);
  assert.equal(writes, 1);
});
async function sendRequest({role='VENDEDOR',unit='SCS',id='chat',token=true}={}) {
  const auth = token ? await signToken({userId:'synthetic',name:'Operador',email:'test@example.invalid',role,unit}) : '';
  return sendReminder(new NextRequest(`http://localhost/api/whatsapp/conversations/${id}/evaluation-no-response?targetInstanceId=${instance.id}&unit=${unit}`,{
    method:'POST',headers:{...(auth?{Authorization:`Bearer ${auth}`} : {}),'x-user-id':'forged-admin','x-user-role':'ADMINISTRADOR'},
  }),{params:Promise.resolve({id})});
}
test('envio exige sessão e ignora identidade forjada nos cabeçalhos',async()=>{
  assert.equal((await sendRequest({token:false})).status,401);
  instance.userId='another-owner';
  assert.equal((await sendRequest()).status,403);
  assert.equal(reads,0);assert.equal(writes,0);assert.equal(rawQueries.length,0);
});
test('consulta e unidade divergente não podem enviar, mesmo sendo proprietário',async()=>{
  instance.members=[{userId:'synthetic',role:'VIEWER',isActive:true}];
  assert.equal((await sendRequest()).status,403);
  instance.members=[];
  assert.equal((await sendRequest({unit:'Osasco'})).status,403);
  assert.equal(rawQueries.length,0);assert.equal(writes,0);
});
test('membro AGENT usa apenas o chat selecionado e recebe erro quando não elegível',async t=>{
  t.mock.timers.enable({apis:['Date'],now:new Date('2026-09-09T02:00:00Z')});
  instance.userId='another-owner';instance.members=[{userId:'synthetic',role:'AGENT',isActive:true}];
  assert.equal((await sendRequest({id:'other-chat'})).status,403);
  const res=await sendRequest();assert.equal(res.status,409);
  assert.match((await res.json()).error,/2 horas/);
  assert.deepEqual(lastConversationWhere,{id:'chat',instanceId:{in:[instance.id]}});
  assert.equal(rawQueries.length,1);assert.ok(rawQueries[0].values.includes('chat'));assert.equal(writes,0);
});
