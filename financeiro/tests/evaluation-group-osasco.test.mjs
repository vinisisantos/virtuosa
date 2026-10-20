import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import { state, pg, api, database, dispatch, change, notice, migration } from './fixtures/evaluation-group-reschedule.mjs';
import { getEvaluationGroupUnitConfig, getEvaluationGroupUnitConfigByInstance, parseEvaluationGroupConfig } from '../src/lib/whatsapp/evaluation-group-notice-config.ts';
import { EVALUATION_CONFIRMATION_REQUEST_AUTOMATION_TRIGGER as trigger } from '../src/lib/whatsapp/evaluation-schedule-confirmation-message.ts';

const scope = getEvaluationGroupUnitConfig('Osasco');
const sbc = getEvaluationGroupUnitConfig('SBC');
const expansion = '20261020120000_evaluation_group_osasco_destination';
const save = () => pg.query('UPDATE "AppSetting" SET value=$1 WHERE key=$2', [JSON.stringify(state.config), scope.settingKey]);
const enqueue = (extra = {}) => api.enqueueEvaluationGroupNotice(database(), { appointment: state.appointment, isNew: true, sourceInstanceId: scope.instanceId, ...extra }, state.now);
beforeEach(async () => {
  await migration(expansion);
  state.config = { ...state.config, instanceId: scope.instanceId, groupName: scope.groupName, groupJid: '120363000009@g.us' };
  state.appointment = { ...state.appointment, id: 'osasco-appointment', unit: 'Osasco' };
  await pg.query('INSERT INTO "AppSetting" VALUES($1,$2)', [scope.settingKey, JSON.stringify(state.config)]);
  await pg.query('INSERT INTO "WhatsAppInstance" VALUES($1,$2,$3,$4,$5)', [scope.instanceId, 'synthetic-osasco', scope.unit, 'connected', 'evolution']);
  await pg.query(`INSERT INTO "Agendamento" SELECT $1,"clientName","clientPhone",procedimento,$2,"startTime","createdAt","updatedAt",status,"evaluationProcedure" FROM "Agendamento" WHERE id='appointment'`, [state.appointment.id, scope.unit]);
  state.operations = 0;
});

test('registro e configuração isolam unidade, caixa e nome exato sem habilitar implicitamente', () => {
  assert.equal(getEvaluationGroupUnitConfig('SCS'), null);
  assert.equal(getEvaluationGroupUnitConfigByInstance(scope.instanceId), scope);
  assert.equal(parseEvaluationGroupConfig(null, 'Osasco'), null);
  assert.equal(parseEvaluationGroupConfig(state.config), null, 'default continua restrito a SBC');
  assert.equal(parseEvaluationGroupConfig(state.config, 'SBC'), null);
  assert.equal(parseEvaluationGroupConfig({ ...state.config, groupName: '  léad   OSASCO ' }, 'Osasco').groupName, 'Lead Osasco');
  assert.equal(parseEvaluationGroupConfig({ ...state.config, groupName: 'Leads Osasco' }, 'Osasco'), null);
  assert.equal(parseEvaluationGroupConfig({ ...state.config, instanceId: sbc.instanceId }, 'Osasco'), null);
});

test('migração/replay preservam SBC byte a byte, sem configuração ou eventos novos', async () => {
  const configBefore = (await pg.query('SELECT value FROM "AppSetting" WHERE key=$1', [sbc.settingKey])).rows[0].value;
  const noticesBefore = (await pg.query('SELECT * FROM "WhatsAppEvaluationGroupNotice"')).rows;
  await pg.query('DELETE FROM "AppSetting" WHERE key=$1', [scope.settingKey]);
  await migration(expansion);
  await migration('20261009020000_whatsapp_evaluation_group_notice');
  await migration(expansion);
  assert.equal((await pg.query('SELECT value FROM "AppSetting" WHERE key=$1', [sbc.settingKey])).rows[0].value, configBefore);
  assert.deepEqual((await pg.query('SELECT * FROM "WhatsAppEvaluationGroupNotice"')).rows, noticesBefore);
  assert.equal((await pg.query('SELECT count(*)::int n FROM "AppSetting" WHERE key=$1', [scope.settingKey])).rows[0].n, 0);
  const row = noticesBefore[0];
  await assert.rejects(pg.query('UPDATE "WhatsAppEvaluationGroupNotice" SET "instanceId"=$1 WHERE id=$2', ['bbb24b4e-ef6d-4b64-93e8-9998d0514c65', row.id]), /destination_check/);
  await assert.rejects(pg.query('UPDATE "WhatsAppEvaluationGroupNotice" SET "groupJid"=$1 WHERE id=$2', ['5511999999999@s.whatsapp.net', row.id]), /destination_check/);
});

test('novo agendamento Osasco usa oito operações e um HTTP ao destino exato; replay não repete', async () => {
  const id = await enqueue();
  assert.ok(id);
  assert.equal((await dispatch(id)).status, 'submitted');
  assert.equal(state.operations, 8);
  assert.equal(state.sent.length, 1);
  assert.equal(state.sent[0].number, state.config.groupJid);
  assert.match(state.sent[0].url, /synthetic-osasco$/);
  assert.match(state.sent[0].text, /Nova avaliação — Osasco/);
  assert.equal((await dispatch(id)).status, 'skipped');
  assert.equal(await enqueue(), id);
  assert.equal(state.sent.length, 1);
});

test('config ausente/pausada/corte futuro, caixa cruzada, SCS e telefone no nome não criam aviso', async () => {
  assert.equal(await enqueue({ sourceInstanceId: sbc.instanceId }), null);
  assert.equal(await enqueue({ appointment: { ...state.appointment, unit: 'SCS' } }), null);
  assert.equal(await enqueue({ appointment: { ...state.appointment, clientName: '(11) 99999-9999' } }), null);
  state.config.enabled = false; await save();
  assert.equal(await enqueue(), null);
  state.config.enabled = true; state.config.activatedAt = new Date(+state.now + 1).toISOString(); await save();
  assert.equal(await enqueue(), null);
  await pg.query('DELETE FROM "AppSetting" WHERE key=$1', [scope.settingKey]);
  assert.equal(await enqueue(), null);
  assert.equal(state.sent.length, 0);
});

for (const [eventType, status, method] of [['confirmed', 'confirmado', 'enqueueEvaluationGroupConfirmation'], ['cancelled', 'desmarcou', 'enqueueEvaluationGroupCancellation']]) {
  test(`${eventType} Osasco preserva origem, dez operações e um envio; repetição não reabre`, async () => {
    await enqueue();
    state.appointment.status = status;
    await pg.query('UPDATE "Agendamento" SET status=$1 WHERE id=$2', [status, state.appointment.id]);
    state.operations = 0;
    const result = await api[method](database(), { appointment: state.appointment, previousStatus: 'pendente' }, state.now);
    assert.equal(result.status, 'queued');
    assert.equal((await dispatch(result.noticeId)).status, 'submitted');
    assert.equal(state.operations, 10);
    assert.match(state.sent[0].text, /— Osasco/);
    assert.equal((await api[method](database(), { appointment: state.appointment, previousStatus: 'pendente' }, state.now)).status, 'already_recorded');
    assert.equal(state.sent.length, 1);
  });
}

test('reagendamento Osasco usa onze operações e informa os dois horários; mudança invalida pendente', async () => {
  await enqueue(); state.operations = 0;
  const first = await change('2026-10-21T14:30:00Z');
  assert.equal(first.status, 'queued');
  assert.equal((await dispatch(first.noticeId)).status, 'submitted');
  assert.equal(state.operations, 11);
  assert.match(state.sent[0].text, /Avaliação reagendada — Osasco/);
  assert.match(state.sent[0].text, /Anterior: 20\/10\/2026, 10:00/);
  const second = await change('2026-10-22T14:30:00Z');
  const third = await change('2026-10-21T14:30:00Z');
  assert.equal((await notice(second.noticeId)).state, 'cancelled');
  assert.equal((await notice(first.noticeId)).state, 'submitted');
  assert.notEqual(first.noticeId, third.noticeId);
});

test('prova legada exige log, automação e conversa da unidade e caixa Osasco exatas', async () => {
  await pg.query('INSERT INTO "Automation" VALUES($1,$2,$3)', ['automation-osasco', trigger, 'Osasco']);
  await pg.query('INSERT INTO "WhatsAppContact" VALUES($1,$2)', ['contact-osasco', state.appointment.clientPhone]);
  await pg.query('INSERT INTO "WhatsAppConversation" VALUES($1,$2,$3)', ['conversation-osasco', scope.instanceId, 'contact-osasco']);
  const triggerData = { topic: 'AGENDA', action: trigger, appointmentId: state.appointment.id, startTime: state.appointment.startTime.toISOString(),
    unit: 'SBC', instanceId: scope.instanceId, conversationId: 'conversation-osasco' };
  const sourceId = `evaluation-message:${trigger}:automation-osasco:${state.appointment.id}:${state.appointment.startTime.toISOString()}`;
  await pg.query('INSERT INTO "AutomationLog" VALUES($1,$2,$3,$4,$5)', [sourceId, 'automation-osasco', state.appointment.clientPhone, triggerData, 'success']);
  state.appointment.status = 'confirmado';
  await pg.query('UPDATE "Agendamento" SET status=$1 WHERE id=$2', ['confirmado', state.appointment.id]);
  const params = { appointment: state.appointment, previousStatus: 'pendente' };
  assert.equal((await api.enqueueEvaluationGroupConfirmation(database(), params, state.now)).reason, 'unverified_source');
  triggerData.unit = 'Osasco';
  await pg.query('UPDATE "AutomationLog" SET "triggerData"=$1 WHERE id=$2', [triggerData, sourceId]);
  const result = await api.enqueueEvaluationGroupConfirmation(database(), params, state.now);
  assert.equal(result.status, 'queued');
  await pg.query('UPDATE "WhatsAppConversation" SET "instanceId"=$1 WHERE id=$2', [sbc.instanceId, 'conversation-osasco']);
  assert.equal((await dispatch(result.noticeId)).status, 'cancelled', 'fence revalida a origem');
  assert.equal(state.sent.length, 0);
});

test('fence por unidade impede vazamento; timeout não autoriza retry', async () => {
  const id = await enqueue();
  assert.equal((await dispatch(id, { database: database({ beforeFence: () => pg.query('UPDATE "Agendamento" SET unit=$1 WHERE id=$2', ['SBC', state.appointment.id]) }) })).status, 'cancelled');
  assert.equal(state.sent.length, 0);
  await pg.query('UPDATE "Agendamento" SET unit=$1 WHERE id=$2', ['Osasco', state.appointment.id]);
  const result = await change('2026-10-21T13:00:00Z');
  let httpCalls = 0;
  assert.equal((await dispatch(result.noticeId, { fetcher: async () => { httpCalls++; throw new Error('timeout'); } })).status, 'uncertain');
  assert.equal((await dispatch(result.noticeId)).status, 'skipped');
  assert.equal(httpCalls, 1);
});

for (const change of ['pause', 'phone-as-name']) {
  test(`Osasco revalida ${change} antes do envio sem afetar configuração SBC`, async () => {
    const sbcBefore = (await pg.query('SELECT value FROM "AppSetting" WHERE key=$1', [sbc.settingKey])).rows[0].value;
    const id = await enqueue();
    if (change === 'pause') { state.config.enabled = false; await save(); }
    else await pg.query('UPDATE "Agendamento" SET "clientName"=$1 WHERE id=$2', [state.appointment.clientPhone, state.appointment.id]);
    assert.equal((await dispatch(id)).status, 'cancelled');
    assert.equal(state.sent.length, 0);
    assert.equal((await pg.query('SELECT value FROM "AppSetting" WHERE key=$1', [sbc.settingKey])).rows[0].value, sbcBefore);
  });
}

test('recuperação compartilha um único lote entre as unidades, com três consultas fixas', async () => {
  await enqueue(); state.operations = 0;
  const result = await api.recoverEvaluationGroupNotices({ database: database(), limit: 1, timeBudgetMs: 8000, now: () => state.now,
    fetcher: async () => { state.sent.push({}); return Response.json({ key: { id: 'recovery-ack' } }); } });
  assert.equal(result.selected, 1);
  assert.equal(result.processed, 1);
  assert.equal(state.sent.length, 1);
  assert.equal(state.operations, 9, 'três consultas fixas + seis de despacho; não há um lote por unidade');
});
