import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';

const state={calls:[],fail:false,created:null};
globalThis.catalogSuggestionFixture=state;
state.prisma={
  procedimentoTermo:{findMany:async args=>{state.calls.push({kind:'terms',args});return [{name:'Personalizado'},{name:'Retorno SBC'}];}},
  serviceCatalog:{findMany:async args=>{
    state.calls.push({kind:'catalog',args});if(state.fail)throw new Error('Falha sintética');
    return [
      {name:'Retorno SBC',unit:'SBC',active:true}, {name:'Novo SBC',unit:'SBC',active:true},
      {name:'Outro Osasco',unit:'Osasco',active:true}, {name:'Inativo',unit:'SBC',active:false},
      {name:'Compartilhado',unit:'Todas',active:true},
    ].filter(r=>r.active&&(!args.where.unit||args.where.unit.in.includes(r.unit))).map(({name})=>({name}));
  },create:async({data})=>{state.created=data;return {id:'synthetic',...data};}},
};
registerHooks({resolve(s,c,n){
  if(s==='@/lib/db')return {url:'data:text/javascript,export const prisma=globalThis.catalogSuggestionFixture.prisma;',shortCircuit:true};
  if(s.startsWith('.')&&c.parentURL&&existsSync(new URL(`${s}.ts`,c.parentURL)))return n(`${s}.ts`,c);
  return n(s==='next/server'?'next/server.js':s,c);
}});
const {NextRequest}=await import('next/server.js');
const {GET}=await import('../src/app/api/procedimentos/route.ts');
const {POST}=await import('../src/app/api/catalog/route.ts');
const request=({unit='SBC',query='SBC',role='VENDEDOR',permissions={},authenticated=true}={})=>new NextRequest(`http://localhost/api/procedimentos?unit=${query}`,{
  headers:authenticated?{'x-user-id':'synthetic','x-user-role':role,'x-user-unit':unit,'x-user-permissions':JSON.stringify(permissions)}:{},
});
beforeEach(()=>{state.calls=[];state.fail=false;});
test('Termos une nomes do catálogo ativo da unidade com sugestões manuais sem gravar ou duplicar',async()=>{
  const response=await GET(request());assert.equal(response.status,200);
  assert.deepEqual(await response.json(),['Compartilhado','Novo SBC','Personalizado','Retorno SBC']);
  assert.equal(state.calls.length,2);
  assert.deepEqual(state.calls.find(c=>c.kind==='catalog').args.where,{active:true,unit:{in:['SBC','Todas']}});
});
test('admin escolhe SBC; usuário sem permissão não abre outra unidade',async()=>{
  assert.ok(!(await(await GET(request({query:'Osasco'}))).json()).includes('Outro Osasco'));
  state.calls=[];await GET(request({unit:'Todas',role:'ADMINISTRADOR'}));
  assert.deepEqual(state.calls.find(c=>c.kind==='catalog').args.where.unit.in,['SBC','Todas']);
});
test('unidade adicional autorizada continua filtrada e catálogo não é copiado para lista global',async()=>{
  const response=await GET(request({unit:'Osasco',permissions:{unitSBC:true}}));
  assert.ok((await response.json()).includes('Novo SBC'));
  assert.equal(state.calls.length,2);
});
test('sem autenticação não consulta e falha do banco não retorna lista de outra unidade',async()=>{
  assert.equal((await GET(request({authenticated:false}))).status,401);assert.equal(state.calls.length,0);
  state.fail=true;const response=await GET(request());assert.equal(response.status,500);assert.deepEqual(await response.json(),[]);
});
test('cadastro manual preserva duração zero, mas mantém o padrão 60 quando omitida',async()=>{
  for(const duration of [0,undefined]){
    const req=new NextRequest('http://localhost/api/catalog',{
      method:'POST',headers:{'x-user-id':'synthetic','x-user-role':'VENDEDOR','x-user-unit':'SBC','content-type':'application/json'},
      body:JSON.stringify({name:'Retorno',price:0,duration}),
    });
    assert.equal((await POST(req)).status,200);assert.equal(state.created.duration,duration??60);
  }
});
