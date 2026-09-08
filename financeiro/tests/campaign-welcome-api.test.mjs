import assert from 'node:assert/strict';
import test, {beforeEach} from 'node:test';
import {registerHooks} from 'node:module';
import {createHash} from 'node:crypto';
registerHooks({resolve(specifier,context,next){return next(specifier==='next/server'?'next/server.js':specifier,context);}});
process.env.JWT_SECRET='synthetic-welcome-test-key';
process.env.CRON_SECRET='synthetic-welcome-cron-secret-123456789';
let record, reads, writes, setting, reply, blocked, providerResponse, sent, messages;
globalThis.prisma={
  automation:{findUnique:async()=>{reads++;return record;},update:async({data})=>{writes++;record={...record,...data};return record;},delete:async()=>{writes++;}},
  whatsAppSavedReply:{findMany:async()=>{reads++;return [reply];}},
  appSetting:{findUnique:async()=>{reads++;return setting;}},
  $executeRaw:async()=>{writes++;return 1;},
  whatsAppConversation:{findUnique:async()=>({blockedAt:blocked}),update:async()=>{writes++;}},
  whatsAppMessage:{create:async({data})=>{messages.push(data);writes++;return data;}},
};
globalThis.fetch=async(url,options)=>{sent.push({url,body:JSON.parse(options.body)});return new Response(JSON.stringify(providerResponse),{status:200});};
const {NextRequest}=await import('next/server.js');
const {signToken}=await import('../src/lib/auth.ts');
const {PUT,POST,DELETE,GET}=await import('../src/app/api/crm/automations/route.ts');
const {POST:worker}=await import('../src/app/api/cron/campaign-welcome/route.ts');
const {sendAutomationText}=await import('../src/lib/whatsapp/automation-sender.ts');
const {DEFAULT_WELCOME_GREETING,WELCOME_LIBRARY_USER_ID}=await import('../src/lib/whatsapp/campaign-welcome-policy.ts');
beforeEach(()=>{
  reads=0;writes=0;setting=null;blocked=null;sent=[];messages=[];providerResponse={key:{id:'provider-message'}};
  reply={id:'reply',userId:WELCOME_LIBRARY_USER_ID,title:'Entendendo',content:'O que te incomoda?',category:{userId:WELCOME_LIBRARY_USER_ID,title:'Barriga Trincada',campaignName:null}};
  record={id:'campaign_welcome:SCS',unit:'SCS',triggerType:'campaign_welcome',isActive:true,triggerConfig:{libraryUserId:WELCOME_LIBRARY_USER_ID,greeting:DEFAULT_WELCOME_GREETING,replyIds:{'barriga-trincada':'reply'}},steps:[]};
});
async function request(method,body,role='ADMINISTRADOR') {
  const token=role?await signToken({userId:'test',name:'Teste',email:'test@example.invalid',role}):'';
  return new NextRequest('http://localhost/api/crm/automations?id=campaign_welcome:SCS&welcomeUnit=SCS',{method,headers:{'content-type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});
}
test('sem autorização não lê biblioteca nem escreve configuração',async()=>{
  assert.equal((await GET(await request('GET',null,null))).status,401);
  assert.equal((await GET(await request('GET',null,'VENDEDOR'))).status,403);
  assert.equal((await PUT(await request('PUT',{id:record.id},'VENDEDOR'))).status,403);
  assert.equal(reads,0);assert.equal(writes,0);
});
test('edição administrativa conserva fonte, unidade, tipo e atraso',async()=>{
  const res=await PUT(await request('PUT',{id:record.id,unit:'Osasco',triggerType:'keyword',triggerConfig:record.triggerConfig,steps:[{type:'wait',config:{seconds:0}}]}));
  assert.equal(res.status,200);const value=(await res.json()).automation;
  assert.equal(value.unit,'SCS');assert.equal(value.triggerType,'campaign_welcome');assert.equal(value.steps[0].config.seconds,60);assert.equal(value.triggerConfig.libraryUserId,WELCOME_LIBRARY_USER_ID);
});
test('rejeita biblioteca alheia, campanha incompatível e nome personalizado',async()=>{
  for(const triggerConfig of [{...record.triggerConfig,libraryUserId:'other'},{...record.triggerConfig,replyIds:{botox:'reply'}},{...record.triggerConfig,greeting:'Olá {{nome}}'}]){
    assert.equal((await PUT(await request('PUT',{id:record.id,triggerConfig}))).status,400);
  }
  assert.equal(writes,0);
});
test('permite remover pergunta, mas não duplicar/excluir gatilho nativo',async()=>{
  assert.equal((await PUT(await request('PUT',{id:record.id,triggerConfig:{...record.triggerConfig,replyIds:{}}}))).status,200);
  assert.equal((await POST(await request('POST',{name:'Outra',triggerType:record.triggerType,steps:[]}))).status,400);
  assert.equal((await DELETE(await request('DELETE'))).status,400);
  assert.equal(writes,1);
});
test('worker aceita só credencial cron, nunca JWT administrativo ou cabeçalhos forjados',async()=>{
  assert.equal((await worker(new Request('http://localhost',{method:'POST'}))).status,401);
  assert.equal((await worker(await request('POST',{}))).status,401);assert.equal(reads,0);
});
test('primeiro worker autenticado ativa marco sem enviar nem percorrer histórico',async()=>{
  setting={value:JSON.stringify({secretHash:createHash('sha256').update(process.env.CRON_SECRET).digest('hex'),readyAt:null})};
  const res=await worker(new Request('http://localhost',{method:'POST',headers:{Authorization:`Bearer ${process.env.CRON_SECRET}`}}));
  assert.equal(res.status,200);assert.equal((await res.json()).sent,0);assert.equal(writes,1);assert.equal(sent.length,0);
});
test('estado de outro ambiente não pode ativar fila',async()=>{
  setting={value:JSON.stringify({secretHash:'wrong',readyAt:null})};
  assert.equal((await worker(new Request('http://localhost',{method:'POST',headers:{Authorization:`Bearer ${process.env.CRON_SECRET}`}}))).status,503);assert.equal(writes,0);
});
const sendParams=()=>({dbInstance:{name:'synthetic',provider:'evolution'},conversationId:'chat',contactPhone:'5511900000000',lastKnownJid:'123@lid',message:'Olá',requireProviderMessageId:true});
test('sender exige comprovante real do provedor e não salva ID fabricado',async()=>{
  providerResponse={};await assert.rejects(()=>sendAutomationText(sendParams()),/identificador/);assert.equal(sent.length,1);assert.equal(messages.length,0);
});
test('sender envia por LID e guarda mensagem por conversa; bloqueio impede saída',async()=>{
  const receipt=await sendAutomationText(sendParams());assert.equal(receipt.messageId,'provider-message');assert.equal(sent[0].body.number,'123@lid');assert.equal(messages[0].conversationId,'chat');
  blocked=new Date();await assert.rejects(()=>sendAutomationText(sendParams()),/bloqueado/);assert.equal(sent.length,1);
});
