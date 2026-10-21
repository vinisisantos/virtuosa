import assert from 'node:assert/strict';
import test, {beforeEach} from 'node:test';
import {registerHooks} from 'node:module';
import {existsSync} from 'node:fs';

const state={calls:[],adjustments:[]};
globalThis.dashboardScopeFixture=state;
const record=(kind,args,result)=>{state.calls.push({kind,args});return result;};
state.prisma={
  whatsAppConversation:{count:async args=>record('conversations',args,args.where.assignedTo?5:65)},
  salesPipeline:{aggregate:async args=>record('pipeline',args,{_sum:{value:0},_count:args.where.assignedTo?65:74})},
  whatsAppInstance:{findMany:async args=>record('instances',args,[])},
};
state.leads=async args=>{
  record('leads',args,null);
  const counts=args.assignedTo?[43,5]:[234,62];
  return counts.flatMap((count,index)=>Array.from({length:count},()=>({receivedAt:new Date(`2026-10-${20+index}T15:00:00Z`)})));
};
state.adjustmentsFor=async args=>record('adjustments',args,state.adjustments.filter(a=>!args.assignedTo||a.assignedTo===args.assignedTo));
registerHooks({resolve(s,c,n){
  const mocks={
    '@/lib/db':'export const prisma=globalThis.dashboardScopeFixture.prisma;',
    '@/lib/whatsapp/qualified-leads':'export const getQualifiedWhatsappLeads=p=>globalThis.dashboardScopeFixture.leads(p);',
    '@/lib/crm/lead-count-adjustments':'export const getCrmLeadCountAdjustments=p=>globalThis.dashboardScopeFixture.adjustmentsFor(p);',
  };
  if(mocks[s])return {url:`data:text/javascript,${encodeURIComponent(mocks[s])}`,shortCircuit:true};
  if(s.startsWith('.')&&c.parentURL&&existsSync(new URL(`${s}.ts`,c.parentURL)))return n(`${s}.ts`,c);
  return n(s==='next/server'?'next/server.js':s,c);
}});
const {NextRequest}=await import('next/server.js');
const {GET}=await import('../src/app/api/crm/dashboard/route.ts');
function request({role='VENDEDOR',unit='Osasco',permissions={crm:true},query='',authenticated=true}={}){
  return new NextRequest(`http://localhost/api/crm/dashboard?unit=Osasco&startDate=2026-10-01&endDate=2026-10-21${query}`,{
    headers:authenticated?{'x-user-id':'operator','x-user-name':'Operadora sintética','x-user-role':role,'x-user-unit':unit,'x-user-permissions':JSON.stringify(permissions)}:{},
  });
}
beforeEach(()=>{state.calls=[];state.adjustments=[];});
test('permissão específica iguala todos os cards e a série do administrador sem consultas adicionais',async()=>{
  const admin=await GET(request({role:'ADMINISTRADOR',unit:'Todas'}));const expected=await admin.json();
  const adminCalls=structuredClone(state.calls);state.calls=[];
  const response=await GET(request({permissions:{crm:true,crmDashboardUnit:true}}));
  assert.equal(response.status,200);const body=await response.json();
  assert.deepEqual(body,expected);assert.deepEqual(state.calls,adminCalls);assert.equal(state.calls.length,8);
  assert.equal(body.leadsSeries.at(-1).newLeads,62);assert.equal(body.leadsSeries.reduce((sum,d)=>sum+d.newLeads,0),296);
  assert.match(response.headers.get('cache-control'),/no-store/);
});
test('sem a nova permissão mantém visão pessoal e não altera a política dos outros operadores',async()=>{
  const body=await(await GET(request())).json();
  assert.equal(body.leadsSeries.at(-1).newLeads,5);assert.equal(body.leadsSeries.reduce((sum,d)=>sum+d.newLeads,0),48);
  assert.ok(state.calls.filter(c=>c.kind==='conversations'||c.kind==='pipeline').every(c=>c.args.where.assignedTo==='operator'));
});
test('permissão é estritamente booleana e exige acesso CRM',async()=>{
  for(const permissions of [{crm:true,crmDashboardUnit:'true'},{crm:true,crmDashboardUnit:1},{crm:false,crmDashboardUnit:true}]){
    state.calls=[];const body=await(await GET(request({permissions}))).json();assert.equal(body.leadsSeries.at(-1).newLeads,5);
  }
});
test('flag específica com unidade ausente, global ou inválida falha fechada sem banco',async()=>{
  for(const unit of ['', 'Todas','Barueri']){
    state.calls=[];assert.equal((await GET(request({unit,permissions:{crm:true,crmDashboardUnit:true}}))).status,403);assert.equal(state.calls.length,0);
  }
});
test('pedido de unidade não autorizada continua em Osasco e nunca abre resumo de SBC',async()=>{
  const req=request({permissions:{crm:true,crmDashboardUnit:true}});req.nextUrl.searchParams.set('unit','SBC');await GET(req);
  for(const c of state.calls){
    if(c.kind==='leads'||c.kind==='adjustments')assert.equal(c.args.unit,'Osasco');
    if(c.kind==='pipeline')assert.equal(c.args.where.unit,'Osasco');
  }
});
test('unidade adicional autorizada continua pessoal; nova flag só agrega a própria unidade',async()=>{
  const req=request({permissions:{crm:true,crmDashboardUnit:true,unitSCS:true}});req.nextUrl.searchParams.set('unit','SCS');
  const body=await(await GET(req)).json();assert.equal(body.leadsSeries.at(-1).newLeads,5);
  assert.equal(state.calls.find(c=>c.kind==='leads').args.unit,'SCS');
});
test('userId arbitrário não permite consultar outro operador',async()=>{
  await GET(request({permissions:{crm:true,crmDashboardUnit:true},query:'&userId=someone-else'}));
  assert.ok(state.calls.filter(c=>c.kind==='conversations'||c.kind==='pipeline').every(c=>c.args.where.assignedTo==='operator'));
  assert.equal(state.calls.find(c=>c.kind==='leads').args.assignedTo,'operator');
});
test('filtros administrativos e papéis com visão unitária anterior permanecem iguais',async()=>{
  for(const params of [{role:'MARKETING'},{permissions:{dashboard:true}},{permissions:{crmEstatistica:true}}]){
    assert.equal((await(await GET(request(params))).json()).leadsSeries.at(-1).newLeads,62);
  }
  state.calls=[];await GET(request({role:'ADMINISTRADOR',query:'&userId=chosen'}));
  assert.equal(state.calls.find(c=>c.kind==='leads').args.assignedTo,'chosen');
});
test('ajustes auditáveis acompanham o mesmo recorte de unidade sem duplicação',async()=>{
  state.adjustments=[{date:'2026-10-21',count:4,assignedTo:'another',unit:'Osasco'}];
  const admin=await(await GET(request({role:'ADMINISTRADOR'}))).json();
  const operator=await(await GET(request({permissions:{crm:true,crmDashboardUnit:true}}))).json();
  assert.deepEqual(operator,admin);assert.equal(operator.leadsSeries.at(-1).newLeads,66);assert.equal(operator.leadsSeries.at(-1).manualAdjustments,4);
});
test('sem autenticação não consulta banco',async()=>{
  assert.equal((await GET(request({authenticated:false}))).status,401);assert.equal(state.calls.length,0);
});
