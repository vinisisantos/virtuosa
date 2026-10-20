import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { NextRequest } from 'next/server.js';

const replacements = {
  'next/server': `export { NextRequest, NextResponse } from ${JSON.stringify(import.meta.resolve('next/server.js'))}; export function after() { throw new Error('No group dispatch expected'); }`,
  '@/lib/db': 'export const prisma = globalThis.nameRoutes.database;',
  '@/lib/whatsapp/evaluation-group-notice': `
    export async function enqueueEvaluationGroupNotice() { return null; }
    export async function enqueueEvaluationGroupStatusNotice() { return { status: 'skipped', reason: 'disabled' }; }
    export async function dispatchEvaluationGroupNotice() { throw new Error('No dispatch expected'); }`,
  '@/lib/whatsapp/evaluation-no-show-notification': 'export async function sendEvaluationNoShowNotification() { return null; }',
  '@/lib/whatsapp/evaluation-reschedule-notification': 'export async function sendEvaluationRescheduleNotification() { return null; }',
  '@/lib/whatsapp/evaluation-schedule-confirmation': 'export async function sendEvaluationScheduleConfirmation() { return null; }',
  '@/lib/pipeline-owner-scope': `
    export async function resolvePipelineOwnerScope() { return null; }
    export async function canAccessPipelineDeal() { return true; }
    export async function filterDealsByPipelineOwnerScope(deals) { return deals; }
    export function isDealVisibleViaPipelineHandoff() { return false; }`,
};
registerHooks({ resolve(specifier, context, next) {
  if (replacements[specifier]) return { url: `data:text/javascript,${encodeURIComponent(replacements[specifier])}`, shortCircuit: true };
  if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
    const url = new URL(`${specifier}.ts`, context.parentURL);
    if (existsSync(url)) return next(url.href, context);
  }
  return next(specifier, context);
} });

const state = globalThis.nameRoutes = {};
const copy = value => structuredClone(value);
const updateAppointment = async ({ data }) => {
  state.writes.push('appointment');
  state.appointment = { ...state.appointment, ...data };
  return copy(state.appointment);
};
const tx = {
  $executeRaw: async () => 1,
  $queryRaw: async () => [{ ...state.appointment }],
  user: { findFirst: async () => ({ id: 'operator', name: 'Operadora', unit: state.unit, permissions: { crm: true } }) },
  profissional: { findFirst: async () => ({ id: 'professional', name: 'Operadora' }) },
  agendamento: {
    findUnique: async () => copy(state.appointment),
    findFirst: async () => state.existingAppointment ? copy(state.appointment) : null,
    findMany: async () => state.existingAppointment ? [copy(state.appointment)] : [],
    create: async ({ data }) => { state.writes.push('appointment'); state.appointment = { ...state.appointment, ...data }; return copy(state.appointment); },
    update: updateAppointment,
    updateMany: async args => { state.syncs.push({ model: 'appointment', ...args }); await updateAppointment(args); return { count: 1 }; },
  },
  salesPipeline: {
    findUnique: async () => copy(state.deal),
    findMany: async () => state.enrichDeal ? [copy(state.deal)] : [],
    update: async ({ data }) => { state.writes.push('deal'); state.deal = { ...state.deal, ...data }; return copy(state.deal); },
    updateMany: async args => {
      state.syncs.push({ model: 'deal', ...args });
      if (state.deal.unit !== args.where.unit) return { count: 0 };
      state.deal = { ...state.deal, ...args.data }; state.writes.push('deal'); return { count: 1 };
    },
  },
  client: {
    findUnique: async () => ({ phone: '5511999999999' }),
    findMany: async () => [],
    updateMany: async args => { state.syncs.push({ model: 'client', ...args }); state.writes.push('client'); return { count: 1 }; },
  },
  pipelineSaleItem: { findMany: async () => [] },
  auditLog: { findMany: async () => [], create: async () => ({ id: 'audit' }) },
};
state.database = {
  ...tx,
  $transaction: async operation => {
    const snapshot = copy({ appointment: state.appointment, deal: state.deal, writes: state.writes, syncs: state.syncs });
    try {
      const result = await operation(tx);
      if (state.failCommit) throw new Error('synthetic rollback');
      return result;
    } catch (error) { Object.assign(state, snapshot); throw error; }
  },
};
globalThis.fetch = async () => { throw new Error('Network forbidden'); };
const agenda = await import('../src/app/api/agenda/route.ts');
const evaluations = await import('../src/app/api/crm/evaluations/route.ts');
const pipeline = await import('../src/app/api/pipeline/route.ts');

beforeEach(() => {
  Object.assign(state, {
    unit: 'SCS', existingAppointment: true, writes: [], syncs: [], failCommit: false, enrichDeal: false,
    appointment: { id: 'appointment', unit: 'SCS', clientName: '(11) 99999-9999', clientPhone: '5511999999999',
      procedimento: 'Avaliação', evaluationProcedure: null, status: 'pendente', profissionalId: 'professional',
      notes: '[assignedUserId:operator]', profissional: { name: 'Operadora' },
      startTime: new Date('2026-10-20T15:00:00Z'), endTime: new Date('2026-10-20T16:00:00Z'), createdAt: new Date(0) },
    deal: { id: 'deal', clientId: 'client', unit: 'SCS', clientName: '(11) 99999-9999', stage: 'em_atendimento', value: 0 },
  });
});
function request(method, body) {
  return new NextRequest('http://localhost/api/synthetic', { method, headers: {
    'x-user-id': 'operator', 'x-user-name': 'Operadora', 'x-user-unit': state.unit, 'x-user-role': 'ADMIN',
  }, body: JSON.stringify(body) });
}
const nextDate = '2026-10-21T15:00:00Z';
async function assertNameError(response) {
  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, 'EVALUATION_CLIENT_NAME_REQUIRED');
  assert.deepEqual(state.writes, []);
}

test('Agenda POST e Pipeline POST rejeitam telefone antes de criar cliente ou agendamento, em todas as unidades', async () => {
  for (const unit of ['Osasco', 'SBC', 'SCS']) {
    state.unit = unit;
    await assertNameError(await agenda.POST(request('POST', { ...state.appointment, clientName: '5511999999999', profissionalId: 'user-Teste' })));
    await assertNameError(await pipeline.POST(request('POST', { clientName: '5511999999999', evaluationStartTime: nextDate })));
  }
});

test('agendamento novo válido normaliza o nome sem exigir sobrenome', async () => {
  const response = await agenda.POST(request('POST', { ...state.appointment, clientName: '  Érica  ' }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).clientName, 'Érica');
});

test('novas datas nas três rotas exigem nome válido antes de alterar registros', async () => {
  await assertNameError(await agenda.PUT(request('PUT', { id: 'appointment', startTime: nextDate })));
  await assertNameError(await evaluations.PATCH(request('PATCH', { id: 'appointment', startTime: nextDate })));
  await assertNameError(await pipeline.PUT(request('PUT', { id: 'deal', evaluationStartTime: nextDate })));
});

test('cancelar ou editar observações de legado sem nome continua permitido', async () => {
  assert.equal((await agenda.PUT(request('PUT', { id: 'appointment', status: 'cancelado', clientName: state.appointment.clientName }))).status, 200);
  assert.equal((await evaluations.PATCH(request('PATCH', { id: 'appointment', status: 'desmarcou' }))).status, 200);
  assert.equal((await pipeline.PUT(request('PUT', { id: 'deal', notes: 'Observação preservada' }))).status, 200);
  assert.equal(state.appointment.clientName, '(11) 99999-9999');
});

test('Avaliações aceita correção explícita de nome e procedimento sem inventar transição de status', async () => {
  const response = await evaluations.PATCH(request('PATCH', { id: 'appointment', evaluationClientName: 'Érica D’Ávila', evaluationProcedure: 'Tratamento corporal' }));
  assert.equal(response.status, 200);
  assert.equal(state.appointment.clientName, 'Érica D’Ávila');
  assert.equal(state.appointment.evaluationProcedure, 'Tratamento corporal');
  assert.equal(state.appointment.status, 'pendente');
});

test('correção em Agenda e Avaliações sincroniza somente deal e cliente ligados por ID e unidade', async () => {
  for (const [handler, method, nameKey] of [[agenda.PUT, 'PUT', 'clientName'], [evaluations.PATCH, 'PATCH', 'evaluationClientName']]) {
    state.appointment.notes = '[pipelineDealId:deal]\n[assignedUserId:operator]';
    state.appointment.clientName = '(11) 99999-9999'; state.syncs = [];
    const response = await handler(request(method, { id: 'appointment', [nameKey]: 'João da Silva', startTime: nextDate }));
    assert.equal(response.status, 200);
    assert.deepEqual(state.syncs.map(item => item.where), [{ id: 'deal', unit: 'SCS' }, { id: 'client', unit: 'SCS' }]);
  }
});

test('marker de outra unidade não renomeia outros clientes ou negócios', async () => {
  state.appointment.notes = '[pipelineDealId:deal]'; state.deal.unit = 'SBC';
  assert.equal((await agenda.PUT(request('PUT', { id: 'appointment', clientName: 'Ana' }))).status, 200);
  assert.deepEqual(state.syncs, []);
});

test('Pipeline PUT salva correção e avaliação na mesma transação e desfaz tudo em rollback', async t => {
  t.mock.method(console, 'error', () => {});
  const body = { id: 'deal', evaluationClientName: 'Maria da Conceição', evaluationStartTime: nextDate,
    evaluationAssigneeUserId: 'operator', forceScheduleConflict: true };
  const response = await pipeline.PUT(request('PUT', body));
  assert.equal(response.status, 200);
  assert.equal(state.deal.clientName, 'Maria da Conceição');
  assert.equal(state.appointment.clientName, 'Maria da Conceição');
  assert.deepEqual(state.syncs.find(item => item.model === 'client').where, { id: 'client', unit: 'SCS' });
  state.deal.clientName = '(11) 99999-9999'; state.appointment.clientName = '(11) 99999-9999';
  state.writes = []; state.syncs = []; state.failCommit = true;
  assert.equal((await pipeline.PUT(request('PUT', body))).status, 500);
  assert.equal(state.deal.clientName, '(11) 99999-9999');
  assert.equal(state.appointment.clientName, '(11) 99999-9999');
  assert.deepEqual(state.writes, []);
});

test('Pipeline agenda uma nova avaliação com nome corrigido nas três unidades', async () => {
  for (const unit of ['Osasco', 'SBC', 'SCS']) {
    state.unit = unit; state.deal.unit = unit; state.appointment.unit = unit;
    state.deal.clientName = '(11) 99999-9999'; state.existingAppointment = false;
    const response = await pipeline.PUT(request('PUT', {
      id: 'deal', evaluationClientName: 'João', evaluationStartTime: nextDate,
      evaluationProcedure: 'Tratamento corporal', evaluationAssigneeUserId: 'operator', forceScheduleConflict: true,
    }));
    assert.equal(response.status, 200, unit);
    assert.equal(state.appointment.clientName, 'João');
    assert.equal(state.appointment.evaluationProcedure, 'Tratamento corporal');
    assert.equal(state.deal.clientName, 'João');
  }
});

test('falha de transação também desfaz correção vinculada de Avaliações', async t => {
  t.mock.method(console, 'error', () => {});
  state.appointment.notes = '[pipelineDealId:deal]\n[assignedUserId:operator]'; state.failCommit = true;
  assert.equal((await evaluations.PATCH(request('PATCH', { id: 'appointment', evaluationClientName: 'Ana', startTime: nextDate }))).status, 500);
  assert.equal(state.appointment.clientName, '(11) 99999-9999');
  assert.equal(state.deal.clientName, '(11) 99999-9999');
  assert.deepEqual(state.writes, []);
});
