import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { NextRequest } from 'next/server.js';

// Only route orchestration is exercised here; outbox eligibility/dedupe has its own tests.
const replacements = {
  'next/server': `export { NextRequest, NextResponse } from ${JSON.stringify(import.meta.resolve('next/server.js'))};
    export function after(callback) { globalThis.confirmationRoutes.schedule(callback); }`,
  '@/lib/db': 'export const prisma = globalThis.confirmationRoutes.database;',
  '@/lib/whatsapp/evaluation-group-notice': `
    export async function enqueueEvaluationGroupConfirmation(tx, params) { return globalThis.confirmationRoutes.enqueue(tx, params); }
    export async function enqueueEvaluationGroupNotice(tx, params) { globalThis.confirmationRoutes.events.push({ kind: 'creation-notice', params }); return null; }
    export async function dispatchEvaluationGroupNotice(id) { return globalThis.confirmationRoutes.dispatch(id); }`,
  '@/lib/whatsapp/evaluation-no-show-notification': `export async function sendEvaluationNoShowNotification(params) {
    globalThis.confirmationRoutes.events.push({ kind: 'no-show', params }); return null; }`,
  '@/lib/whatsapp/evaluation-reschedule-notification': `export async function sendEvaluationRescheduleNotification(params) {
    globalThis.confirmationRoutes.events.push({ kind: 'reschedule', params }); return null; }`,
};
registerHooks({ resolve(specifier, context, next) {
  if (replacements[specifier]) return { url: `data:text/javascript,${encodeURIComponent(replacements[specifier])}`, shortCircuit: true };
  if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
    const url = new URL(`${specifier}.ts`, context.parentURL);
    if (existsSync(url)) return next(url.href, context);
  }
  return next(specifier, context);
} });

const state = globalThis.confirmationRoutes = {};
let transactionTail = Promise.resolve();
const copy = value => structuredClone(value);
const tx = {
  $queryRaw: async (strings, id) => {
    assert.match(strings.join('?'), /SELECT "id"(?:, "status", "unit")? FROM "Agendamento" WHERE "id" = \? FOR UPDATE/);
    assert.equal(id, 'appointment');
    state.events.push({ kind: 'lock' });
    return state.appointment ? [{ id, status: state.appointment.status, unit: state.appointment.unit }] : [];
  },
  agendamento: {
    findUnique: async () => { state.events.push({ kind: 'tx-read' }); return copy(state.appointment); },
    update: async ({ data }) => {
      state.events.push({ kind: 'update', data });
      if (!state.appointment) throw new Error('not found');
      state.appointment = { ...state.appointment, ...data };
      return copy(state.appointment);
    },
    create: async ({ data }) => { state.appointment = { id: 'appointment', ...data }; return copy(state.appointment); },
  },
  auditLog: { create: async ({ data }) => { state.events.push({ kind: 'audit', data }); return data; } },
};
state.database = {
  agendamento: { findUnique: async () => { state.events.push({ kind: 'initial-read' }); return copy(state.appointment); } },
  auditLog: { findMany: async () => [] },
  $transaction: async (operation, options) => {
    const waiting = transactionTail;
    let release;
    transactionTail = new Promise(resolve => { release = resolve; });
    await waiting;
    state.beforeTransaction?.();
    state.beforeTransaction = null;
    const snapshot = { appointment: copy(state.appointment), notices: copy(state.notices) };
    state.events.push({ kind: 'begin', options });
    state.inTransaction = true;
    try {
      const result = await operation(tx);
      if (state.failCommit) throw new Error('synthetic commit failure');
      state.events.push({ kind: 'commit' });
      return result;
    } catch (error) {
      Object.assign(state, snapshot);
      state.events.push({ kind: 'rollback' });
      throw error;
    } finally {
      state.inTransaction = false;
      release();
    }
  },
};
state.schedule = callback => {
  assert.ok(events('commit').length > events('after').length, 'each after() registration follows a committed transaction');
  state.events.push({ kind: 'after' });
  state.callbacks.push(callback);
};
state.enqueue = async (database, params) => {
  assert.equal(database, tx);
  assert.equal(state.inTransaction, true);
  state.events.push({ kind: 'enqueue', params: copy(params) });
  if (params.appointment.status !== 'confirmado' || params.previousStatus === 'confirmado') return null;
  if (params.appointment.unit !== 'SBC' || params.appointment.procedimento !== 'Avaliação') return null;
  const key = `${params.appointment.id}:${params.appointment.startTime.toISOString()}`;
  if (state.notices.includes(key)) return null;
  state.notices.push(key);
  return key;
};
state.dispatch = async id => {
  assert.equal(state.inTransaction, false, 'dispatch never runs in transaction');
  state.events.push({ kind: 'dispatch', id });
  if (state.failDispatch) throw new Error('synthetic provider failure');
};
globalThis.fetch = async () => { throw new Error('Network forbidden in route tests'); };

const { PATCH } = await import('../src/app/api/crm/evaluations/route.ts');
const { PUT, POST: createAppointment } = await import('../src/app/api/agenda/route.ts');
const { POST: checkin } = await import('../src/app/api/checkin/route.ts');
const routes = [
  { name: 'evaluations PATCH', handler: PATCH, method: 'PATCH', body: { id: 'appointment', status: 'confirmado' } },
  { name: 'agenda PUT', handler: PUT, method: 'PUT', body: { id: 'appointment', status: 'confirmado' } },
  { name: 'checkin POST', handler: checkin, method: 'POST', body: { agendamentoId: 'appointment' } },
];
function reset() {
  Object.assign(state, {
    appointment: {
      id: 'appointment', clientName: 'Cliente Sintética', clientPhone: '5511999999999', unit: 'SBC',
      procedimento: 'Avaliação', evaluationProcedure: 'Procedimento sintético', status: 'pendente',
      startTime: new Date('2026-10-10T15:00:00Z'), endTime: new Date('2026-10-10T16:00:00Z'),
      notes: '[evaluationAssignedUserId:operator]', profissional: { id: 'professional', name: 'Operadora' },
    },
    notices: [], events: [], callbacks: [], inTransaction: false,
    beforeTransaction: null, failCommit: false, failDispatch: false,
  });
}
beforeEach(reset);
function request(route, { body = route.body, unit = 'SBC', authenticated = true, role = 'CONSULTORA', permissions = {} } = {}) {
  return new NextRequest('http://localhost/api/synthetic', {
    method: route.method,
    headers: {
      ...(authenticated ? { 'x-user-id': 'operator' } : {}),
      'x-user-name': 'Operadora', 'x-user-unit': unit, 'x-user-role': role,
      'x-user-permissions': JSON.stringify(permissions),
    },
    body: JSON.stringify(body),
  });
}
const events = kind => state.events.filter(event => event.kind === kind);

test('as três rotas persistem confirmação e aviso juntos e despacham somente após commit', async () => {
  for (const route of routes) {
    reset();
    const response = await route.handler(request(route));
    assert.equal(response.status, 200, route.name);
    const body = await response.json();
    const appointment = body.evaluation || body.agendamento || body;
    assert.equal(appointment.status, 'confirmado');
    assert.equal(events('enqueue')[0].params.previousStatus, 'pendente');
    assert.equal(state.notices.length, 1);
    assert.equal(state.callbacks.length, 1);
    assert.equal(events('dispatch').length, 0);
    const kinds = state.events.map(event => event.kind);
    assert.ok(kinds.indexOf('update') < kinds.indexOf('enqueue'));
    assert.ok(kinds.indexOf('enqueue') < kinds.indexOf('commit'));
    assert.ok(kinds.indexOf('commit') < kinds.indexOf('after'));
    if (route.method === 'PUT') {
      assert.equal(events('begin')[0].options.isolationLevel, 'Serializable');
    } else {
      assert.equal(events('initial-read').length, 0, 'no redundant read outside the transaction');
      assert.equal(events('lock').length, 1);
      if (route.handler === PATCH) {
        assert.equal(events('tx-read').length, 1);
        assert.ok(kinds.indexOf('lock') < kinds.indexOf('tx-read'));
      } else {
        assert.equal(events('tx-read').length, 0, 'check-in reuses the fields returned by its lock');
        assert.ok(kinds.indexOf('lock') < kinds.indexOf('update'));
      }
    }
    await state.callbacks[0]();
    assert.equal(events('dispatch').length, 1);
    if (route.handler === checkin) assert.equal(body.success, true);
  }
});

test('releitura transacional substitui status antigo e não duplica confirmação', async () => {
  for (const route of routes) {
    reset();
    state.beforeTransaction = () => { state.appointment.status = 'confirmado'; };
    assert.equal((await route.handler(request(route))).status, 200);
    assert.equal(events('enqueue')[0].params.previousStatus, 'confirmado', route.name);
    assert.equal(state.notices.length, 0);
    assert.equal(state.callbacks.length, 0);
    if (route.handler === PATCH) assert.equal(JSON.parse(events('audit')[0].data.details).from, 'confirmado');
  }
});

test('confirmações concorrentes entre Avaliações e check-in agendam um único despacho', async () => {
  const responses = await Promise.all([PATCH(request(routes[0])), checkin(request(routes[2]))]);
  assert.deepEqual(responses.map(response => response.status), [200, 200]);
  assert.deepEqual(events('enqueue').map(event => event.params.previousStatus), ['pendente', 'confirmado']);
  assert.equal(state.notices.length, 1);
  assert.equal(state.callbacks.length, 1);
});

test('rollback desfaz status e aviso e não registra after em nenhuma rota', async t => {
  t.mock.method(console, 'error', () => {});
  for (const route of routes) {
    reset();
    state.failCommit = true;
    assert.ok((await route.handler(request(route))).status >= 400);
    assert.equal(state.appointment.status, 'pendente', route.name);
    assert.equal(state.notices.length, 0);
    assert.equal(state.callbacks.length, 0);
    assert.equal(events('dispatch').length, 0);
  }
});

test('falha no despacho posterior não desfaz confirmação válida', async () => {
  for (const route of routes) {
    reset();
    state.failDispatch = true;
    assert.equal((await route.handler(request(route))).status, 200);
    await assert.rejects(state.callbacks[0](), /synthetic provider failure/);
    assert.equal(state.appointment.status, 'confirmado');
    assert.equal(state.notices.length, 1);
  }
});

test('sessão e unidade são obrigatórias; mudança concorrente de unidade é revalidada', async () => {
  for (const route of routes) {
    reset();
    assert.equal((await route.handler(request(route, { authenticated: false }))).status, 401);
    assert.equal(state.events.length, 0);
    assert.equal((await route.handler(request(route, { unit: 'Osasco' }))).status, 403);
    assert.equal(events('update').length, 0);
    assert.equal(state.notices.length, 0);
    reset();
    state.beforeTransaction = () => { state.appointment.unit = 'Osasco'; };
    assert.equal((await route.handler(request(route))).status, 403, route.name);
    assert.equal(events('update').length, 0);
    assert.equal(state.callbacks.length, 0);
  }
});

test('Avaliações revalida a responsável depois do lock, preservando permissão compartilhada', async () => {
  state.beforeTransaction = () => { state.appointment.notes = ''; state.appointment.profissional.name = 'Outra pessoa'; };
  assert.equal((await PATCH(request(routes[0]))).status, 403);
  assert.equal(events('update').length, 0);
  assert.equal((await PATCH(request(routes[0], { permissions: { crmEvaluationsAll: true } }))).status, 200);
});

test('reagendamento usa último horário e reseta confirmação sem criar aviso de confirmado', async () => {
  state.beforeTransaction = () => {
    state.appointment.status = 'confirmado';
    state.appointment.startTime = new Date('2026-10-11T15:00:00Z');
    state.appointment.endTime = new Date('2026-10-11T15:30:00Z');
  };
  assert.equal((await PATCH(request(routes[0], { body: { id: 'appointment', startTime: '2026-10-12T15:00:00Z' } }))).status, 200);
  assert.equal(state.appointment.status, 'pendente');
  assert.equal(state.appointment.endTime.toISOString(), '2026-10-12T15:30:00.000Z');
  assert.equal(events('reschedule')[0].params.previousStartTime.toISOString(), '2026-10-11T15:00:00.000Z');
  assert.equal(JSON.parse(events('audit')[0].data.details).confirmationReset, true);
  assert.equal(state.notices.length, 0);
});

test('criação já confirmada mantém somente o gatilho de criação', async () => {
  const route = { handler: createAppointment, method: 'POST', body: { ...state.appointment, profissionalId: 'professional', status: 'confirmado' } };
  assert.equal((await createAppointment(request(route))).status, 200);
  assert.equal(events('creation-notice').length, 1);
  assert.equal(events('enqueue').length, 0);
  assert.equal(state.notices.length, 0);
});

test('check-in preserva 404 para registro ausente sem aviso', async () => {
  state.appointment = null;
  const response = await checkin(request(routes[2]));
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: 'Agendamento not found' });
  assert.equal(events('update').length, 0);
  assert.equal(state.callbacks.length, 0);
});
