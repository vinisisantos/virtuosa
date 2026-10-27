import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { NextRequest } from 'next/server.js';

const replacements = {
  'next/server': `export { NextRequest, NextResponse } from ${JSON.stringify(import.meta.resolve('next/server.js'))}; export function after() { throw new Error('No dispatch expected'); }`,
  '@/lib/db': 'export const prisma = globalThis.sharedEvaluationAccess.database;',
  '@/lib/whatsapp/evaluation-group-notice': `
    export async function enqueueEvaluationGroupStatusNotice() { return {status:'skipped',reason:'synthetic'}; }
    export async function enqueueEvaluationGroupConfirmation() { return {status:'skipped',reason:'synthetic'}; }
    export async function enqueueEvaluationGroupNotice() { return null; }
    export async function dispatchEvaluationGroupNotice() { throw new Error('No send allowed'); }`,
};
registerHooks({ resolve(specifier, context, next) {
  if (replacements[specifier]) return { url: `data:text/javascript,${encodeURIComponent(replacements[specifier])}`, shortCircuit: true };
  if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
    const url = new URL(`${specifier}.ts`, context.parentURL);
    if (existsSync(url)) return next(url.href, context);
  }
  return next(specifier, context);
} });
globalThis.fetch = async () => { throw new Error('Network forbidden'); };
const state = globalThis.sharedEvaluationAccess = {};
const copy = value => structuredClone(value);
const now = new Date();
const professionals = ['Osasco', 'SBC', 'SCS'].flatMap(unit => ['own', 'other'].map(owner => ({
  id: `${unit}-${owner}`, name: owner === 'own' ? 'Pessoa Operadora' : 'Outra Responsável', unit, isActive: true,
})));
function appointment(unit, owner) {
  return { id: `${unit}-${owner}`, clientName: `Cliente ${owner}`, procedimento: 'Avaliação', evaluationProcedure: 'Procedimento sintético',
    notes: `[assignedUserId:${owner === 'own' ? 'operator' : 'another'}]`, profissionalId: `${unit}-${owner}`,
    profissional: professionals.find(p => p.id === `${unit}-${owner}`), unit, status: 'pendente', createdAt: now,
    startTime: now, endTime: new Date(+now + 3600000) };
}
const findUnique = async ({ where }) => { state.reads++; return copy(state.records.find(item => item.id === where.id) || null); };
const database = state.database = {
  profissional: { findMany: async ({ where }) => { state.professionalQueries++; return copy(professionals.filter(p => p.unit === where.unit)); } },
  agendamento: {
    findMany: async ({ where }) => {
      state.appointmentQueries++;
      return copy(state.records.filter(item => item.unit === where.unit && (!where.profissionalId || item.profissionalId === where.profissionalId)));
    },
    findUnique,
    update: async ({ where, data }) => {
      state.writes++;
      const item = state.records.find(item => item.id === where.id);
      Object.assign(item, data);
      return copy(item);
    },
    delete: async () => { state.writes++; return {}; },
  },
  auditLog: { findMany: async () => [], create: async () => { state.audits++; return {}; } },
  $queryRaw: async (_strings, id) => copy(state.records.filter(item => item.id === id)),
  $transaction: async callback => {
    state.beforeTransaction?.(); state.beforeTransaction = null;
    return callback(database);
  },
};
const { GET, PATCH } = await import('../src/app/api/crm/evaluations/route.ts');
const { PUT, DELETE } = await import('../src/app/api/agenda/route.ts');
const { POST: checkin } = await import('../src/app/api/checkin/route.ts');
const { canViewAllEvaluations, canManageAllEvaluations, enforceSharedEvaluationWriteAccess } = await import('../src/lib/evaluation-access.ts');
beforeEach(() => {
  Object.assign(state, { records: ['Osasco', 'SBC', 'SCS'].flatMap(unit => ['own', 'other'].map(owner => appointment(unit, owner))),
    reads: 0, writes: 0, audits: 0, professionalQueries: 0, appointmentQueries: 0, beforeTransaction: null });
});
function request(method = 'GET', body, { permissions = { crm: true, crmEvaluationsViewUnit: true }, unit = 'Osasco', query = '', authenticated = true, name = 'Pessoa Operadora' } = {}) {
  return new NextRequest(`http://localhost/api/synthetic?unit=${unit}${query}`, { method,
    headers: { ...(authenticated ? { 'x-user-id': 'operator' } : {}), 'x-user-name': name, 'x-user-unit': 'Osasco',
      'x-user-role': 'VENDEDOR', 'x-user-permissions': JSON.stringify(permissions), 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
test('Aline e Thais consultam o mesmo conjunto de Osasco sem ganhar gestão', async () => {
  for (const name of ['Aline Fernanda', 'Thais Amorim']) {
    const result = await GET(request('GET', null, { name }));
    assert.equal(result.status, 200);
    const data = await result.json();
    assert.equal(data.unit, 'Osasco'); assert.equal(data.canViewAll, true); assert.equal(data.canManageAll, false);
    assert.deepEqual(data.evaluations.map(item => item.id), ['Osasco-own', 'Osasco-other']);
    assert.deepEqual(data.evaluations.map(item => item.canEdit), [true, false]);
    assert.equal(data.newEvaluationsToday, 2); assert.equal(data.professionals.length, 2);
  }
  assert.equal(state.professionalQueries, 2); assert.equal(state.appointmentQueries, 4);
  assert.equal(state.writes, 0);
});
test('sem a nova permissão a consulta permanece pessoal e exige sessão', async () => {
  const data = await (await GET(request('GET', null, { permissions: { crm: true } }))).json();
  assert.equal(data.canViewAll, false); assert.deepEqual(data.evaluations.map(item => item.id), ['Osasco-own']);
  assert.equal(data.newEvaluationsToday, 1); assert.equal(data.evaluations[0].canEdit, true);
  assert.equal((await GET(request('GET', null, { authenticated: false }))).status, 401);
});
test('permissões prévias de outras unidades não recebem compartilhamento nem gestão', async () => {
  const permissions = { crm: true, crmEvaluationsViewUnit: true, unitSBC: true, unitSCS: true };
  for (const unit of ['SBC', 'SCS']) {
    const data = await (await GET(request('GET', null, { unit, permissions }))).json();
    assert.equal(data.unit, unit); assert.equal(data.canViewAll, false); assert.equal(data.canManageAll, false);
    assert.deepEqual(data.evaluations.map(item => item.id), [`${unit}-own`]);
  }
  const fallback = await (await GET(request('GET', null, { unit: 'SBC' }))).json();
  assert.equal(fallback.unit, 'Osasco'); assert.ok(fallback.evaluations.every(item => item.unit === 'Osasco'));
});
test('filtro de responsável e de unidade não pode buscar registros fora do conjunto permitido', async () => {
  const data = await (await GET(request('GET', null, { query: '&profissionalId=Osasco-other' }))).json();
  assert.deepEqual(data.evaluations.map(item => item.id), ['Osasco-other']); assert.equal(data.evaluations[0].canEdit, false);
  assert.equal((await GET(request('GET', null, { query: '&profissionalId=SBC-other' }))).status, 403);
});
test('compartilhamento de consulta é recusado com unidade ausente/inválida ou sem CRM', () => {
  for (const permissions of [{ crmEvaluationsViewUnit: true }, { crm: true }, {}]) {
    assert.equal(canViewAllEvaluations({ permissions, userUnit: 'Osasco', unitFilter: 'Osasco' }, 'Osasco'), false);
  }
  for (const unit of ['', 'Todas', 'Desconhecida']) {
    assert.equal(canViewAllEvaluations({ permissions: { crm: true, crmEvaluationsViewUnit: true }, userUnit: unit, unitFilter: unit }, unit), false);
  }
  assert.equal(canViewAllEvaluations({ permissions: { crm: true, crmEvaluationsViewUnit: true }, userUnit: 'Osasco' }, 'Osasco'), false);
});
test('consulta não permite editar status, data, nome ou responsável de outra avaliação', async () => {
  for (const changes of [{ status: 'confirmado' }, { startTime: new Date(+now + 86400000).toISOString() },
    { evaluationClientName: 'Novo Nome' }, { assigneeUserId: 'operator' }]) {
    const res = await PATCH(request('PATCH', { id: 'Osasco-other', ...changes }));
    assert.equal(res.status, 403);
  }
  assert.equal(state.writes, 0); assert.equal(state.audits, 0);
});
test('avaliação própria continua editável, sem poder reatribuir para outra pessoa', async () => {
  assert.equal((await PATCH(request('PATCH', { id: 'Osasco-own', evaluationClientName: 'Nome Atualizado' }))).status, 200);
  assert.equal(state.writes, 1); assert.equal(state.audits, 1);
  assert.equal((await PATCH(request('PATCH', { id: 'Osasco-own', assigneeUserId: 'another' }))).status, 403);
  assert.equal(state.writes, 1);
});
test('rotas alternativas da agenda e check-in também bloqueiam alteração e exclusão alheia', async () => {
  assert.equal((await PUT(request('PUT', { id: 'Osasco-other', status: 'confirmado' }))).status, 403);
  assert.equal((await DELETE(request('DELETE', null, { query: '&id=Osasco-other' }))).status, 403);
  assert.equal((await checkin(request('POST', { agendamentoId: 'Osasco-other' }))).status, 403);
  assert.equal(state.writes, 0); assert.equal(state.audits, 0);
});
test('agenda revalida a atribuição dentro da transação antes de escrever', async () => {
  state.beforeTransaction = () => {
    const item = state.records.find(item => item.id === 'Osasco-own');
    item.notes = '[assignedUserId:another]'; item.profissional = { name: 'Outra Responsável' };
  };
  assert.equal((await PUT(request('PUT', { id: 'Osasco-own', status: 'confirmado' }))).status, 403);
  assert.equal(state.writes, 0);
});
test('gestão existente e acesso explícito à Agenda geral permanecem intactos', async () => {
  const permissions = { crm: true, crmEvaluationsAll: true };
  const data = await (await GET(request('GET', null, { permissions }))).json();
  assert.equal(data.canManageAll, true); assert.ok(data.evaluations.every(item => item.canEdit));
  assert.equal(canManageAllEvaluations({ permissions: { crmEvaluationsViewUnit: true } }), false);
  assert.doesNotThrow(() => enforceSharedEvaluationWriteAccess({ permissions: { crmEvaluationsViewUnit: true, agenda: true } }, appointment('Osasco', 'other')));
});

const unitManagerPermissions = { crm: true, crmEvaluationsManageUnit: true, crmEvaluationsViewUnit: true, unitSBC: true, unitSCS: true };
test('gestão da unidade do cadastro libera edição alheia somente em Osasco', async () => {
  const data = await (await GET(request('GET', null, { permissions: unitManagerPermissions }))).json();
  assert.equal(data.canViewAll, true); assert.equal(data.canManageAll, true);
  assert.ok(data.evaluations.every(item => item.canEdit));
  assert.equal((await PATCH(request('PATCH', { id: 'Osasco-other', evaluationClientName: 'Nome Atualizado' }, { permissions: unitManagerPermissions }))).status, 200);
  assert.equal((await PUT(request('PUT', { id: 'Osasco-other', status: 'confirmado' }, { permissions: unitManagerPermissions }))).status, 200);
  assert.equal((await checkin(request('POST', { agendamentoId: 'Osasco-other' }, { permissions: unitManagerPermissions }))).status, 200);
});
test('gestão restrita não amplia consulta nem escrita de SBC/SCS mesmo com filtro forjado', async () => {
  for (const unit of ['SBC', 'SCS']) {
    const data = await (await GET(request('GET', null, { unit, permissions: unitManagerPermissions }))).json();
    assert.equal(data.canViewAll, false); assert.equal(data.canManageAll, false);
    assert.deepEqual(data.evaluations.map(item => item.id), [`${unit}-own`]);
    for (const queryUnit of [unit, 'Osasco']) {
      const options = { unit: queryUnit, permissions: unitManagerPermissions };
      assert.equal((await PATCH(request('PATCH', { id: `${unit}-other`, status: 'confirmado' }, options))).status, 403);
      assert.equal((await PUT(request('PUT', { id: `${unit}-other`, status: 'confirmado' }, options))).status, 403);
      assert.equal((await checkin(request('POST', { agendamentoId: `${unit}-other` }, options))).status, 403);
      assert.equal((await DELETE(request('DELETE', null, { ...options, query: `&id=${unit}-other` }))).status, 403);
    }
  }
  assert.equal(state.writes, 0); assert.equal(state.audits, 0);
});
test('gestão restrita exige CRM, unidade real e filtro da unidade do cadastro', () => {
  const guard = { permissions: unitManagerPermissions, userUnit: 'Osasco', unitFilter: 'Osasco' };
  assert.equal(canManageAllEvaluations(guard, 'Osasco'), true);
  for (const unit of [undefined, '', 'Todas', 'SBC', 'SCS']) assert.equal(canManageAllEvaluations(guard, unit), false);
  assert.equal(canManageAllEvaluations({ ...guard, permissions: { crmEvaluationsManageUnit: true } }, 'Osasco'), false);
  assert.equal(canManageAllEvaluations({ ...guard, unitFilter: 'SBC' }, 'Osasco'), false);
  assert.equal(canManageAllEvaluations({ ...guard, userUnit: 'Todas', unitFilter: 'Todas' }, 'Todas'), false);
  const withoutView = { ...guard, permissions: { ...unitManagerPermissions, crmEvaluationsViewUnit: false }, userId: 'operator', userName: 'Pessoa Operadora' };
  assert.throws(() => enforceSharedEvaluationWriteAccess(withoutView, appointment('SBC', 'other')));
  assert.doesNotThrow(() => enforceSharedEvaluationWriteAccess(withoutView, appointment('Osasco', 'other')));
});
