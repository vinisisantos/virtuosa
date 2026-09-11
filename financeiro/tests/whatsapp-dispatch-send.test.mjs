import assert from 'node:assert/strict';
import test,{beforeEach} from 'node:test';
import {registerHooks} from 'node:module';
const modules={
  '@/lib/whatsapp/instance-resolver':'export async function getInstancesForRequest(){return {instances:globalThis.dispatchInstances,isProxy:false}}',
  '@/lib/whatsapp/callbacks':'export async function recordOutboundForCallbackTracking(){return false}',
  '@/lib/whatsapp/media-storage':'export const isPrivateBlobUrl=()=>!!globalThis.dispatchPrivateBlob;export const signPrivateMediaUrls=async x=>x;export const inspectPrivateBlob=async()=>globalThis.dispatchPrivateBlob;export const createPrivateBlobReadUrl=async x=>x+"?signed=mock";',
  '@/lib/whatsapp/link-preview':'export const firstWhatsAppLink=text=>text.match(/https:\\/\\/[^ ]+/)?.[0]||null;export const loadWhatsAppLinkPreview=async()=>globalThis.dispatchLinkPreview;',
};
registerHooks({resolve(specifier,context,next){
  if(modules[specifier])return {url:'data:text/javascript,'+encodeURIComponent(modules[specifier]),shortCircuit:true};
  return next(specifier==='next/server'?'next/server.js':specifier,context);
}});
let conv, saved, sent, providerOk, echo, writes, missingMessageId, providerStatus;
const db={
  whatsAppConversation:{
    findFirst:async({where})=>where.id===conv.id&&where.instanceId.in.includes(conv.instanceId)?conv:null,
    updateMany:async()=>({count:1}),
    update:async()=>({callbackAttempts:[]}),
  },
  webhookLog:{create:async()=>({})},
  whatsAppMessage:{
    findFirst:async({where})=>{
      assert.equal(where.conversationId,conv.id);
      assert.equal(where.messageId,globalThis.dispatchQuotedMessage?.messageId);
      return globalThis.dispatchQuotedMessage;
    },
    create:async({data})=>{writes++;saved={id:'message-db',...data};return saved;},
    upsert:async({where,create,update})=>{
      assert.deepEqual(where,{conversationId_messageId:{conversationId:conv.id,messageId:'wa-id'}});
      writes++;saved=echo?{...echo,...update}:{id:'message-db',...create};return saved;
    },
    updateMany:async({where,data})=>{
      writes++;assert.equal(where.id,saved.id);assert.equal(where.fromMe,true);
      if(where.status.notIn.some(status=>status.toUpperCase()===saved.status.toUpperCase()))return {count:0};
      Object.assign(saved,data);return {count:1};
    },
  },
  $transaction:async fn=>fn(db),
};
globalThis.prisma=db;
globalThis.fetch=async(url,options)=>{
  assert.match(String(url),/^http:\/\/localhost:8080\/message\/send(Text|Media)\/test-instance$/);
  sent.push(JSON.parse(options.body));
  return new Response(JSON.stringify(providerOk?(missingMessageId?{}:{key:{id:'wa-id'},status:providerStatus}):{error:'Falha sintética'}),{status:providerOk?200:502});
};
const {POST}=await import('../src/app/api/whatsapp/send/route.ts');
const dispatch={batchId:'12345678-1234-1234-1234-123456789abc',size:2,source:'inbox_bulk',campaignName:'Botox'};
beforeEach(()=>{
  saved=null;sent=[];providerOk=true;echo=null;writes=0;missingMessageId=false;providerStatus=undefined;
  globalThis.dispatchLinkPreview=null;globalThis.dispatchPrivateBlob=null;globalThis.dispatchQuotedMessage=null;
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
test('individual não recebe marcação e lote usa a unidade real da caixa, nunca a forjada',async()=>{
  assert.equal((await send({dispatch:undefined})).status,200);assert.equal(saved.dispatchMetadata,undefined);
  for(const unit of ['SBC','SCS']){
    globalThis.dispatchInstances[0].unit=unit;
    const res=await send({},'?unit=Osasco');assert.equal(res.status,200);
    assert.equal((await res.json()).lastDispatch.metadata.unit,unit);assert.equal(saved.dispatchMetadata.unit,unit);
  }
});
test('Todas depende da unidade real do contato e mídia também recebe identificação',async()=>{
  globalThis.dispatchInstances[0].unit='Todas';conv.contact.unit='SCS';
  assert.equal((await send()).status,200);assert.equal(saved.dispatchMetadata.unit,'SCS');
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
test('envio individual preserva leitura recebida antes da resposta, sem duplicar',async()=>{
  echo={id:'echo-db',conversationId:'chat',messageId:'wa-id',body:'Olá!',timestamp:new Date(),fromMe:true,status:'read'};
  providerStatus='PENDING';
  const res=await send({dispatch:undefined});assert.equal(res.status,200);assert.equal(writes,1);
  assert.equal(saved.status,'read');assert.equal(saved.id,'echo-db');assert.equal(saved.respondedByName,'Operadora real');
});
test('retorno PENDING não vira entrega e enums do provedor são normalizados',async()=>{
  for(const [status,expected] of [['PENDING','pending'],['SERVER_ACK','sent'],['DELIVERY_ACK','delivered'],['READ','read']]){
    providerStatus=status;
    const res=await send({dispatch:undefined});assert.equal(res.status,200);assert.equal(saved.status,expected);
  }
});
test('ACK avançado na resposta promove eco PENDING sem deixar o status parado',async()=>{
  echo={id:'echo-db',conversationId:'chat',messageId:'wa-id',body:'Olá!',timestamp:new Date(),fromMe:true,status:'pending'};
  providerStatus='READ';
  const res=await send();assert.equal(res.status,200);assert.equal(writes,2);
  assert.equal(saved.status,'read');assert.equal((await res.json()).lastDispatch.status,'read');
});
test('SERVER_ACK tardio da resposta não apaga falha confirmada pelo webhook',async()=>{
  echo={id:'echo-db',conversationId:'chat',messageId:'wa-id',body:'Olá!',timestamp:new Date(),fromMe:true,status:'error'};
  providerStatus='SERVER_ACK';
  const res=await send();assert.equal(res.status,200);assert.equal(writes,1);
  assert.equal(saved.status,'error');assert.equal((await res.json()).lastDispatch.status,'error');
});
test('eco anterior recebe preview confirmado sem alterar corpo editado, data ou leitura',async()=>{
  const timestamp=new Date('2026-09-10T10:00:00Z');
  echo={id:'echo-db',conversationId:'chat',messageId:'wa-id',body:'Corpo já editado',timestamp,fromMe:true,status:'read'};
  globalThis.dispatchLinkPreview={url:'https://example.test',title:'Página',description:'Descrição',thumbnailUrl:'https://example.test/thumb.jpg'};
  const res=await send({dispatch:undefined,body:'Veja https://example.test'});assert.equal(res.status,200);
  assert.equal(saved.linkPreviewTitle,'Página');assert.equal(saved.linkPreviewUrl,'https://example.test');
  assert.equal(saved.linkPreviewDescription,'Descrição');assert.equal(saved.linkPreviewThumbnailUrl,'https://example.test/thumb.jpg');
  assert.equal(saved.status,'read');assert.equal(saved.body,'Corpo já editado');assert.equal(saved.timestamp,timestamp);
});
test('eco anterior recebe mídia privada permanente e citação, omissões não apagam preview existente',async()=>{
  echo={id:'echo-db',conversationId:'chat',messageId:'wa-id',body:'',timestamp:new Date(),fromMe:true,status:'delivered',linkPreviewTitle:'Preservado'};
  globalThis.dispatchPrivateBlob={pathname:'whatsapp/chat/photo.png',size:321,contentType:'image/png'};
  globalThis.dispatchQuotedMessage={messageId:'quote-id',body:'Mensagem original',type:'text',fromMe:false};
  const file='https://mock.private.blob.vercel-storage.com/whatsapp/chat/photo.png';
  const res=await send({dispatch:undefined,type:'image',file,body:'',fileName:'photo.png',replyid:'quote-id'});assert.equal(res.status,200);
  assert.equal(saved.mediaUrl,file);assert.equal(saved.mediaFileName,'photo.png');assert.equal(saved.mediaMimeType,'image/png');assert.equal(saved.mediaSizeBytes,321);
  assert.equal(saved.quotedMessageId,'quote-id');assert.equal(saved.quotedMessageBody,'Mensagem original');assert.equal(saved.quotedMessageFromMe,false);
  assert.equal(saved.linkPreviewTitle,'Preservado');assert.equal(saved.status,'delivered');
});
