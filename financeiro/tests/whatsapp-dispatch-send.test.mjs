import assert from 'node:assert/strict';
import test,{beforeEach} from 'node:test';
import {registerHooks} from 'node:module';
const modules={
  '@/lib/whatsapp/instance-resolver':'export async function getInstancesForRequest(){return {instances:globalThis.dispatchInstances,isProxy:false}}',
  '@/lib/whatsapp/callbacks':'export async function recordOutboundForCallbackTracking(){return false}',
  '@/lib/whatsapp/media-storage':'export const isPrivateBlobUrl=()=>false;export const signPrivateMediaUrls=async x=>x;export const inspectPrivateBlob=async()=>null;export const createPrivateBlobReadUrl=async x=>x;',
};
registerHooks({resolve(specifier,context,next){
  if(modules[specifier])return {url:'data:text/javascript,'+encodeURIComponent(modules[specifier]),shortCircuit:true};
  return next(specifier==='next/server'?'next/server.js':specifier,context);
}});
let conv, saved, sent, providerOk, echo, writes, missingMessageId;
const db={
  whatsAppConversation:{
    findFirst:async({where})=>where.id===conv.id&&where.instanceId.in.includes(conv.instanceId)?conv:null,
    updateMany:async()=>({count:1}),
    update:async()=>({callbackAttempts:[]}),
  },
  webhookLog:{create:async()=>({})},
  whatsAppMessage:{
    create:async({data})=>{writes++;saved={id:'message-db',...data};return saved;},
    upsert:async({where,create,update})=>{
      assert.deepEqual(where,{conversationId_messageId:{conversationId:conv.id,messageId:'wa-id'}});
      writes++;saved=echo?{...echo,...update}:{id:'message-db',...create};return saved;
    },
  },
  $transaction:async fn=>fn(db),
};
globalThis.prisma=db;
globalThis.fetch=async(url,options)=>{
  assert.match(String(url),/^http:\/\/localhost:8080\/message\/send(Text|Media)\/test-instance$/);
  sent.push(JSON.parse(options.body));
  return new Response(JSON.stringify(providerOk?(missingMessageId?{}:{key:{id:'wa-id'}}):{error:'Falha sintética'}),{status:providerOk?200:502});
};
const {POST}=await import('../src/app/api/whatsapp/send/route.ts');
const dispatch={batchId:'12345678-1234-1234-1234-123456789abc',size:2,source:'inbox_bulk',campaignName:'Botox'};
beforeEach(()=>{
  saved=null;sent=[];providerOk=true;echo=null;writes=0;missingMessageId=false;
  globalThis.dispatchInstances=[{id:'instance',unit:'Osasco',name:'test-instance',status:'connected',provider:'evolution',canReply:true}];
  conv={id:'chat',instanceId:'instance',assignedTo:'operator',contact:{phone:'5511900000000',name:'Teste',unit:'Osasco'}};
});
const send=async(extra={},query='')=>POST(new Request('http://localhost/api/whatsapp/send'+query,{method:'POST',headers:{'Content-Type':'application/json','x-user-id':'operator','x-user-name':'Operadora real'},body:JSON.stringify({conversationId:'chat',body:'Olá!',type:'text',claimConversation:true,dispatch,...extra})}));
test('novo lote grava origem/autoria na mensagem após envio e retorna selo',async()=>{
  const res=await send();assert.equal(res.status,200);const result=await res.json();
  assert.equal(sent.length,1);assert.equal(writes,1);assert.equal(saved.dispatchMetadata.unit,'Osasco');
  assert.equal(result.lastDispatch.sentByName,'Operadora real');assert.equal(result.lastDispatch.status,'sent');
  assert.equal(sent[0].dispatch,undefined,'metadados internos não são enviados ao WhatsApp');
});
test('individual e lotes de SBC/SCS mantêm envio sem marcação, mesmo com unit Osasco forjada',async()=>{
  assert.equal((await send({dispatch:undefined})).status,200);assert.equal(saved.dispatchMetadata,undefined);
  for(const unit of ['SBC','SCS']){
    globalThis.dispatchInstances[0].unit=unit;
    const res=await send({},'?unit=Osasco');assert.equal(res.status,200);
    assert.equal((await res.json()).lastDispatch,null);assert.equal(saved.dispatchMetadata,undefined);
  }
});
test('Todas depende da unidade real do contato e mídia também recebe identificação',async()=>{
  globalThis.dispatchInstances[0].unit='Todas';conv.contact.unit='SCS';
  assert.equal((await send()).status,200);assert.equal(saved.dispatchMetadata,undefined);
  conv.contact.unit='Osasco';assert.equal((await send({type:'image',file:'data:image/png;base64,dGVzdA=='})).status,200);
  assert.equal(saved.dispatchMetadata.unit,'Osasco');assert.equal(saved.type,'image');
});
test('falha, falta de permissão, lote inválido e rechame respondido não gravam selo',async()=>{
  providerOk=false;assert.equal((await send()).status,502);assert.equal(writes,0);
  providerOk=true;globalThis.dispatchInstances[0].canReply=false;assert.equal((await send()).status,403);assert.equal(writes,0);
  globalThis.dispatchInstances[0].canReply=true;
  assert.equal((await send({dispatch:{...dispatch,size:11}})).status,400);
  assert.equal((await send({conversationId:'other'})).status,404);
  assert.equal((await send({requireCallbackDue:true,dispatch:{...dispatch,source:'follow_up_bulk'}})).status,409);
  assert.equal(writes,0);assert.equal(sent.length,1);
});
test('eco anterior à resposta de envio recebe selo sem duplicar nem regredir ACK',async()=>{
  echo={id:'echo-db',conversationId:'chat',messageId:'wa-id',body:'Olá!',timestamp:new Date(),fromMe:true,status:'delivered'};
  const res=await send();assert.equal(res.status,200);assert.equal(writes,1);
  const result=await res.json();assert.equal(result.lastDispatch.id,'echo-db');assert.equal(result.lastDispatch.status,'delivered');
  assert.equal(saved.respondedByName,'Operadora real');assert.ok(saved.dispatchMetadata);
});
test('resposta sem identificador do provedor não inventa comprovação de disparo',async()=>{
  missingMessageId=true;
  const res=await send();assert.equal(res.status,200);
  assert.equal((await res.json()).lastDispatch,null);assert.equal(saved.dispatchMetadata,undefined);
});
