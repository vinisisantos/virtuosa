import assert from 'node:assert/strict';
import test, {beforeEach} from 'node:test';
import {registerHooks} from 'node:module';
const resolver='data:text/javascript,'+encodeURIComponent('export async function getInstancesForRequest(){ return {instances:globalThis.campaignInstances}; }');
registerHooks({resolve(specifier,context,next){
  if(specifier==='@/lib/whatsapp/instance-resolver')return {url:resolver,shortCircuit:true};
  return next(specifier==='next/server'?'next/server.js':specifier,context);
}});
let clients,conversations,queries,clientWhere,dispatchQueries;
globalThis.prisma={
  $executeRawUnsafe:async()=>0,
  $queryRaw:async query=>{
    if(query.text.includes('dispatchMetadata')){
      dispatchQueries.push(query);
      return query.values.filter(value=>value==='chat-Osasco').map(conversationId=>({id:'dispatch-msg',conversationId,fromMe:true,timestamp:new Date(),status:'delivered',respondedByName:'Teste',dispatchMetadata:{version:1,unit:'Osasco',batchId:'12345678-1234-1234-1234-123456789abc',source:'inbox_bulk',campaignName:'Botox'}}));
    }
    return [];
  },
  client:{findMany:async({where})=>{queries++;clientWhere=where;return clients.filter(c=>where.unit.in.includes(c.unit));}},
  whatsAppConversation:{findMany:async()=>conversations},
};
const {GET}=await import('../src/app/api/whatsapp/conversations/route.ts');
const {NextRequest}=await import('next/server.js');
const phone='5511999991234';
beforeEach(()=>{
  queries=0;clientWhere=null;dispatchQueries=[];
  globalThis.campaignInstances=['SBC','SCS','Osasco'].map(unit=>({id:unit,unit,canReply:true}));
  clients=['SBC','SCS','Osasco'].map((unit,i)=>({phone,unit,originUnit:unit,campaignName:['Glúteo Perfeito','Harmonização de Mamas','Botox'][i],campaignId:null,fbclid:null,updatedAt:new Date(2026,8,8,i)}));
  conversations=globalThis.campaignInstances.map(instance=>({id:'chat-'+instance.id,instanceId:instance.id,status:'open',followUps:[],contact:{id:'contact',phone,unit:'SCS'},lastMessageAt:new Date().toISOString()}));
});
const load=async(query='')=>{
  const res=await GET(new NextRequest('http://localhost/api/whatsapp/conversations'+query,{headers:{'x-user-id':'synthetic','x-user-role':'ADMINISTRADOR','x-user-unit':'SBC'}}));
  assert.equal(res.status,200);return res.json();
};
test('Inbox retorna três tags independentes para o mesmo telefone em uma única consulta',async()=>{
  const data=await load('?unit=SBC');
  assert.deepEqual(data.conversations.map(c=>c.campaignName),['Glúteo Perfeito','Harmonização de Mamas','Botox']);
  assert.equal(queries,1);assert.deepEqual(clientWhere.unit.in,['SBC','SCS','Osasco']);
});
test('sem cadastro da unidade, não herda campanha da outra',async()=>{
  clients=clients.filter(c=>c.unit==='SCS');conversations=conversations.filter(c=>c.instanceId==='SBC');
  const data=await load();assert.equal(data.conversations[0].campaignName,null);assert.equal(queries,1);
});
test('telefone com mesmo sufixo mas DDD distinto não recebe tag alheia',async()=>{
  clients=[{...clients[0],phone:'5513999991234'}];conversations=[conversations[0]];
  assert.equal((await load()).conversations[0].campaignName,null);
});
test('caixa compartilhada usa unidade selecionada, sem seleção arbitrária global',async()=>{
  globalThis.campaignInstances=[{id:'shared',unit:'Todas'}];
  conversations=[{...conversations[0],instanceId:'shared'}];
  assert.equal((await load('?unit=Osasco')).conversations[0].campaignName,'Botox');
  conversations[0].contact.unit=null;
  queries=0;assert.equal((await load()).conversations[0].campaignName,null);assert.equal(queries,0);
});
test('selo tem uma leitura agrupada exclusivamente para as conversas reais de Osasco',async()=>{
  const data=await load('?unit=SCS');
  assert.equal(dispatchQueries.length,1);
  assert.deepEqual(dispatchQueries[0].values,['chat-Osasco']);
  assert.equal(data.conversations.find(c=>c.instanceId==='Osasco').lastDispatch.status,'delivered');
  assert.equal(data.conversations.find(c=>c.instanceId==='SCS').lastDispatch,null);
  assert.equal(data.conversations.find(c=>c.instanceId==='SBC').lastDispatch,null);
});
test('sem conversas de Osasco não acrescenta consulta nem confia no filtro para criar selo',async()=>{
  conversations=conversations.filter(c=>c.instanceId==='SCS');
  assert.equal((await load('?unit=Osasco')).conversations[0].lastDispatch,null);
  assert.equal(dispatchQueries.length,0);
});
