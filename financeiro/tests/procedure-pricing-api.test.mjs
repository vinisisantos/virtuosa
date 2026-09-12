import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
registerHooks({ resolve(specifier, context, next) {
  if (specifier.startsWith('.') && context.parentURL && existsSync(new URL(`${specifier}.ts`, context.parentURL))) return next(`${specifier}.ts`, context);
  return next(specifier === 'next/server' ? 'next/server.js' : specifier, context);
} });
let existing, calls;
globalThis.prisma = { pricingProtocol: {
  findMany: async args => { calls.push(['list', args]); return []; },
  findFirst: async args => { calls.push(['find', args]); return null; },
  findUnique: async args => { calls.push(['read', args]); return existing; },
  create: async args => { calls.push(['create', args]); return { id: 'created', ...args.data }; },
  update: async args => { calls.push(['update', args]); return { id: args.where.id, ...args.data }; },
  delete: async args => { calls.push(['delete', args]); return {}; },
} };
const { NextRequest } = await import('next/server.js');
const { GET, POST, PUT, DELETE } = await import('../src/app/api/pricing/route.ts');
const { defaultState, defaultPricing, serializeProtocol } = await import('../src/lib/procedure-pricing.ts');
const state = () => ({ ...defaultState, nome: 'Procedimento fictício', aluguel: 12000, diasTrabalhados: 20, horasDia: 5, qtdSalas: 2, duracaoHoras: 1, insumos: [{ nome: 'Produto', valor: 300, quantidade: 1 }], impostos: 6, taxaCartao: 4, pricing: { ...defaultPricing, unit: 'Osasco', referenceMonth: '2026-09', occupancy: 50, targetMargin: 20, salesCommission: 10 } });
function req(method, body, { unit = 'Osasco', role = 'VENDEDOR', auth = true, query = '' } = {}) {
  return new NextRequest(`http://localhost/api/pricing${query}`, { method, headers: { 'Content-Type': 'application/json', ...(auth ? { 'x-user-id': 'test-user', 'x-user-role': role, 'x-user-unit': unit } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
}
beforeEach(() => { calls = []; existing = { unit: 'Osasco', insumos: serializeProtocol(state()).insumos }; });
test('sem sessão não há leitura nem escrita', async () => {
  for (const [method, handler] of [['GET', GET], ['POST', POST], ['PUT', PUT], ['DELETE', DELETE]]) assert.equal((await handler(req(method, null, { auth: false }))).status, 401);
  assert.deepEqual(calls, []);
});
test('listagem preserva globais legados mas isola unidade permitida', async () => {
  assert.equal((await GET(req('GET', null, { query: '?unit=SBC' }))).status, 200);
  assert.deepEqual(calls[0][1].where, { OR: [{ unit: 'Osasco' }, { unit: 'Todas' }] });
  calls = [];
  assert.equal((await GET(req('GET', null, { query: '?id=other&unit=SBC' }))).status, 404);
  assert.deepEqual(calls[0][1].where, { OR: [{ unit: 'Osasco' }, { unit: 'Todas' }], id: 'other' });
});
test('servidor recalcula preço e ignora campos não autorizados', async () => {
  const body = { ...serializeProtocol(state()), precoSugerido: 1, createdAt: '2000-01-01', id: 'injected', unit: 'Osasco' };
  const res = await POST(req('POST', body));
  assert.equal(res.status, 201);
  const result = await res.json();
  assert.equal(result.precoSugerido, 700);
  assert.equal(result.id, 'created');
  assert.equal(result.createdAt, undefined);
  assert.equal(calls.length, 1);
});
test('não permite criar em unidade alheia nem salvar denominador inválido', async () => {
  const body = serializeProtocol(state());
  body.insumos.pricing.unit = 'SBC'; body.unit = 'SBC';
  assert.equal((await POST(req('POST', body))).status, 403);
  const invalid = serializeProtocol(state()); invalid.impostos = 100;
  assert.equal((await POST(req('POST', invalid))).status, 400);
  assert.equal(calls.length, 0);
});
test('edição/exclusão verificam unidade antes da escrita', async () => {
  existing = { ...existing, unit: 'SBC' };
  assert.equal((await PUT(req('PUT', { ...serializeProtocol(state()), id: 'other' }))).status, 403);
  assert.equal((await DELETE(req('DELETE', null, { query: '?id=other' }))).status, 403);
  assert.equal(calls.filter(([op]) => ['create', 'update', 'delete'].includes(op)).length, 0);
});
test('troca de versão exige cópia e não reinterpreta legado', async () => {
  existing = { unit: 'Todas', insumos: [] };
  const res = await PUT(req('PUT', { ...serializeProtocol(state()), id: 'legacy' }, { role: 'ADMINISTRADOR' }));
  assert.equal(res.status, 400);
  assert.equal(calls.filter(([op]) => op === 'update').length, 0);
});
test('rejeita snapshot de versão desconhecida sem escrever', async () => {
  const body = serializeProtocol(state()); body.insumos.version = 99;
  assert.equal((await POST(req('POST', body))).status, 400);
  assert.deepEqual(calls, []);
});
test('edição v2 mantém unidade e recalcula preço', async () => {
  const body = { ...serializeProtocol(state()), id: 'known', precoSugerido: 0 };
  const res = await PUT(req('PUT', body));
  assert.equal(res.status, 200); assert.equal((await res.json()).precoSugerido, 700);
  assert.deepEqual(calls.map(([op]) => op), ['read', 'update']);
});
test('mesmo admin precisa copiar para mudar unidade', async () => {
  const body = serializeProtocol(state()); body.unit = 'SBC'; body.insumos.pricing.unit = 'SBC';
  assert.equal((await PUT(req('PUT', { ...body, id: 'known' }, { role: 'ADMINISTRADOR' }))).status, 400);
  assert.deepEqual(calls.map(([op]) => op), ['read']);
});
test('legado global não pode ser excluído por usuário de uma unidade', async () => {
  existing = { unit: 'Todas', insumos: [] };
  assert.equal((await DELETE(req('DELETE', null, { query: '?id=global' }))).status, 403);
  assert.deepEqual(calls.map(([op]) => op), ['read']);
});
test('unidade inválida e snapshot divergente não escrevem', async () => {
  const body = serializeProtocol(state());
  assert.equal((await POST(req('POST', { ...body, unit: 'inexistente' }, { role: 'ADMINISTRADOR' }))).status, 400);
  assert.equal((await POST(req('POST', { ...body, unit: 'SBC' }, { role: 'ADMINISTRADOR' }))).status, 400);
  assert.deepEqual(calls, []);
});
