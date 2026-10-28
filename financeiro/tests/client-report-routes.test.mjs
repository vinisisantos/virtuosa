import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { NextRequest } from 'next/server.js';

const state = globalThis.clientReportRouteState = {};
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'next/server') return { url: `data:text/javascript,${encodeURIComponent(`export {NextRequest,NextResponse} from ${JSON.stringify(import.meta.resolve('next/server.js'))}`)}`, shortCircuit: true };
  if (specifier === '@/lib/db') return { url: 'data:text/javascript,export const prisma=globalThis.clientReportRouteState.database;', shortCircuit: true };
  if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
    const url = new URL(`${specifier}.ts`, context.parentURL);
    if (existsSync(url)) return next(url.href, context);
  }
  return next(specifier, context);
} });
const copy = value => structuredClone(value);
const database = {
  whatsAppInstance: { findUnique: async () => { state.calls.push('instance'); return copy(state.instance); } },
  whatsAppConversation: { findFirst: async ({ where }) => {
    state.calls.push('conversation'); assert.equal(where.instanceId, 'instance');
    return where.id === 'chat' ? { contact: copy(state.contact) } : null;
  } },
  client: { findMany: async ({ where, take }) => {
    state.calls.push('clients');
    if (where.id) return copy(state.clients.filter(c => where.id.in.includes(c.id)));
    assert.equal(where.unit, 'SBC'); assert.equal(take, 21);
    return copy(state.clients.filter(c => c.unit === where.unit));
  } },
  $queryRaw: async statement => {
    state.calls.push('clients');
    assert.deepEqual(statement.values, [state.unit, state.unit, '99999999']);
    assert.match(statement.sql, /LIMIT 21/);
    return copy(state.clients.filter(c => c.unit === state.unit || state.deals.some(d => d.clientId === c.id && d.unit === state.unit && d.stage === 'fechado')));
  },
  salesPipeline: { findMany: async ({ where, take }) => {
    state.calls.push('deals'); assert.equal(where.unit, state.unit); assert.equal(where.stage, 'fechado'); assert.equal(take, 101);
    return copy(state.deals.filter(d => d.unit === where.unit && d.stage === where.stage && where.clientId.in.includes(d.clientId)));
  } },
  auditLog: { findMany: async () => { state.calls.push('legacy'); return []; } },
  $transaction: async (operation, options) => {
    assert.equal(options.isolationLevel, 'RepeatableRead'); state.calls.push('transaction');
    return operation(database);
  },
};
for (const model of Object.values(database)) if (typeof model === 'object') {
  for (const method of ['create', 'update', 'delete', 'updateMany', 'deleteMany']) model[method] = () => { throw Error('Writes forbidden'); };
}
state.database = database;
const { GET } = await import('../src/app/api/whatsapp/client-report/route.ts');
beforeEach(() => {
  Object.assign(state, {
    database, calls: [], unit: 'SBC',
    instance: { id: 'instance', userId: 'owner', unit: 'SBC', status: 'connected', assignmentMode: 'OWNER', members: [] },
    contact: { name: 'Contato', phone: '5511999999999' },
    clients: [{ id: 'client', name: 'Cliente', phone: '5511999999999', unit: 'SBC', campaignName: 'Anúncio', campaignAttribution: 'automatic_meta', fbclid: 'https://example.com/ad' }],
    deals: [{ id: 'deal', clientId: 'client', clientName: 'Cliente', unit: 'SBC', stage: 'fechado', assignedTo: 'owner', value: 699, closedAt: new Date('2026-10-27T15:00:00Z'), campaignNameSnapshot: 'Anúncio', campaignAttributionSnapshot: 'automatic_meta', saleItems: [{ procedureName: 'Lipo Laser', sessions: 1, paidAmount: 699, itemType: 'paid' }] }],
  });
});
function request({ user = 'owner', role = 'VENDEDOR', unit = 'SBC', requestedUnit = 'SBC', conversation = 'chat' } = {}) {
  return new NextRequest(`http://localhost/api/whatsapp/client-report?unit=${requestedUnit}&conversationId=${conversation}&targetInstanceId=instance`, {
    headers: user ? { 'x-user-id': user, 'x-user-role': role, 'x-user-unit': unit, 'x-user-permissions': JSON.stringify({ crm: true }) } : {},
  });
}

test('relatório somente leitura retorna fechamento e não acrescenta consultas por item', async () => {
  const response = await GET(request()); assert.equal(response.status, 200);
  const data = await response.json(); assert.equal(data.closings.length, 1); assert.equal(data.closings[0].total, 699);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(state.calls, ['instance', 'transaction', 'conversation', 'clients', 'deals', 'clients']);
  assert.equal(JSON.stringify(data).includes('5511999999999'), false, 'telefone não é exposto no relatório');
});
test('autenticação e unidade são verificadas antes das leituras', async () => {
  assert.equal((await GET(request({ user: '' }))).status, 401);
  assert.equal((await GET(request({ unit: 'Osasco' }))).status, 403);
  assert.equal((await GET(request({ requestedUnit: 'Todas' }))).status, 403);
  assert.deepEqual(state.calls, []);
});
test('outra instância privada ou conversa fora da caixa não revela dados', async () => {
  assert.equal((await GET(request({ user: 'stranger' }))).status, 404);
  assert.deepEqual(state.calls, ['instance']);
  state.calls = [];
  assert.equal((await GET(request({ conversation: 'other-chat' }))).status, 404);
  assert.deepEqual(state.calls, ['instance', 'transaction', 'conversation']);
});
test('mesmo sufixo em DDD diferente e LID não são usados como cliente', async () => {
  state.clients[0].phone = '5521999999999';
  assert.deepEqual((await (await GET(request())).json()).closings, []);
  assert.equal(state.calls.includes('deals'), false);
  state.contact.phone = '123456789012345@lid';
  assert.equal((await GET(request())).status, 422);
});
test('telefone formatado e com ou sem país preserva o vínculo completo', async () => {
  state.clients[0].phone = '(11) 99999-9999';
  assert.equal((await (await GET(request())).json()).closings.length, 1);
});
test('propostas e vendas de outra unidade não entram no relatório', async () => {
  state.deals.push({ ...state.deals[0], id: 'other-unit', unit: 'Osasco' }, { ...state.deals[0], id: 'proposal', stage: 'em_negociacao' });
  assert.deepEqual((await (await GET(request())).json()).closings.map(c => c.id), ['deal']);
});
test('fechamento atribuído a outro responsável segue o isolamento existente do Pipeline', async () => {
  state.deals[0].assignedTo = 'other';
  assert.equal((await (await GET(request())).json()).closings.length, 0);
  state.instance.members = [{ userId: 'member', role: 'VIEWER', isActive: true }, { userId: 'owner', role: 'OWNER', isActive: true }];
  assert.equal((await (await GET(request({ user: 'member' }))).json()).closings.length, 0);
  state.instance.members[0].role = 'MANAGER';
  assert.equal((await (await GET(request({ user: 'member' }))).json()).closings.length, 1);
});
test('múltiplos fechamentos permanecem separados e não somam receita entre vendas', async () => {
  state.deals.push({ ...state.deals[0], id: 'second', value: 400, saleItems: [{ procedureName: 'Outro', sessions: 1, paidAmount: 400, itemType: 'paid' }] });
  const data = await (await GET(request())).json();
  assert.deepEqual(data.closings.map(c => c.total), [699, 400]);
});
test('falha de leitura não expõe detalhes internos e permite tentar novamente', async () => {
  const original = state.database.$transaction;
  state.database.$transaction = async () => { throw Error('sensitive connection'); };
  try { const response = await GET(request()); assert.equal(response.status, 500); assert.doesNotMatch(JSON.stringify(await response.json()), /sensitive/); }
  finally { state.database.$transaction = original; }
});
test('Osasco, SBC e SCS usam somente os próprios fechamentos', async () => {
  for (const unit of ['Osasco', 'SBC', 'SCS']) {
    state.unit = unit; state.instance.unit = unit; state.clients[0].unit = unit; state.deals[0].unit = unit;
    const response = await GET(request({ unit, requestedUnit: unit }));
    assert.equal(response.status, 200);
    const data = await response.json(); assert.equal(data.unit, unit); assert.equal(data.closings.length, 1);
  }
});
test('histórico excessivo é rejeitado sem devolver relatório parcial', async () => {
  state.deals = Array.from({ length: 101 }, (_,i) => ({ ...state.deals[0], id: `sale-${i}` }));
  const response = await GET(request()); assert.equal(response.status, 409);
  assert.equal('closings' in await response.json(), false);
});
test('transferir o cadastro não apaga o acesso ao fechamento histórico da unidade original', async () => {
  state.clients[0].unit = 'Osasco';
  assert.equal((await (await GET(request())).json()).closings.length, 1);
  state.deals[0].unit = 'Osasco';
  assert.equal((await (await GET(request())).json()).closings.length, 0);
});
