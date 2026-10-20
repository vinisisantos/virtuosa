import assert from 'node:assert/strict';
import test from 'node:test';
import {state,pg,api,database,enqueue,dispatch,change,notice,migration,finalize,saveConfig} from './fixtures/evaluation-group-reschedule.mjs';
import { EVALUATION_CONFIRMATION_REQUEST_AUTOMATION_TRIGGER as trigger } from '../src/lib/whatsapp/evaluation-schedule-confirmation-message.ts';

test('salvar igual não consulta, gate ausente/futuro e outra unidade não notificam',async()=>{
  assert.equal((await enqueue({appointment:state.appointment,previousStartTime:state.appointment.startTime})).reason,'not_reschedule');
  assert.equal(state.operations,0);
  delete state.config.reschedulesActivatedAt;await saveConfig();
  assert.equal((await change('2026-10-21T13:00:00Z')).reason,'disabled');
  state.config.reschedulesActivatedAt='2030-01-01T00:00:00Z';await saveConfig();
  assert.equal((await change('2026-10-22T13:00:00Z')).reason,'disabled');
  assert.equal((await enqueue({appointment:{...state.appointment,unit:'SCS'},previousStartTime:new Date(0)})).reason,'not_reschedule');
  assert.equal(state.sent.length,0);
});
test('agenda existente usa onze operações, um HTTP e mensagem com os dois horários',async()=>{
  const result=await change('2026-10-21T14:30:00Z');assert.equal(result.status,'queued');
  assert.equal((await dispatch(result.noticeId)).status,'submitted');
  assert.equal(state.operations,11);assert.equal(state.sent.length,1);
  assert.match(state.sent[0].text,/🔄 \*Avaliação reagendada — SBC\*/);
  assert.match(state.sent[0].text,/Anterior: 20\/10\/2026, 10:00/);
  assert.match(state.sent[0].text,/Nova data: 21\/10\/2026\nHorário: 11:30/);
  assert.equal(state.sent[0].number,state.config.groupJid);
});
test('concorrência/replay da mesma alteração não duplica nem reabre aviso aceito',async()=>{
  const result=await change('2026-10-21T13:00:00Z');
  const results=await Promise.all([enqueue(result.params),enqueue(result.params)]);
  assert.ok(results.every(r=>r.status==='already_recorded'&&r.noticeId===result.noticeId));
  const outcomes=await Promise.all([dispatch(result.noticeId),dispatch(result.noticeId)]);
  assert.deepEqual(outcomes.map(r=>r.status).sort(),['skipped','submitted']);
  assert.equal((await enqueue(result.params)).status,'already_recorded');assert.equal(state.sent.length,1);
});
test('A→B→A→B cria ocorrências distintas e invalida apenas as antigas ainda não enviadas',async()=>{
  const a=await change('2026-10-21T13:00:00Z');
  const b=await change('2026-10-20T13:00:00Z');
  const c=await change('2026-10-21T13:00:00Z');
  assert.equal(new Set([a.noticeId,b.noticeId,c.noticeId]).size,3);
  assert.equal((await notice(a.noticeId)).state,'cancelled');assert.equal((await notice(b.noticeId)).state,'cancelled');
  assert.equal((await dispatch(a.noticeId)).status,'skipped');assert.equal((await dispatch(c.noticeId)).status,'submitted');
  assert.equal(state.sent.length,1);
});
test('aviso aceito de uma alteração permanece intacto após outra mudança legítima',async()=>{
  const a=await change('2026-10-21T13:00:00Z');await dispatch(a.noticeId);
  const b=await change('2026-10-20T13:00:00Z');await dispatch(b.noticeId);
  assert.equal((await notice(a.noticeId)).state,'submitted');assert.equal(state.sent.length,2);
});
test('horário passado, cadastro incompleto e encerramento não enviam e invalidam pendência antiga',async()=>{
  const a=await change('2026-10-21T13:00:00Z');
  assert.equal((await change('2026-10-22T13:00:00Z',{evaluationProcedure:null})).reason,'missing_procedure');
  assert.equal((await notice(a.noticeId)).state,'cancelled');
  assert.equal((await change('2026-10-23T13:00:00Z',{status:'fechou_pacote'})).reason,'not_future_evaluation');
  assert.equal((await change('2026-10-15T13:00:00Z',{status:'pendente'})).reason,'not_future_evaluation');
  assert.equal(state.sent.length,0);
});
test('cancelamento, exclusão e alteração durante o fence impedem o envio',async()=>{
  const a=await change('2026-10-21T13:00:00Z');
  await pg.exec('UPDATE "Agendamento" SET status=\'desmarcou\'');assert.equal((await dispatch(a.noticeId)).status,'cancelled');
  await pg.exec('UPDATE "Agendamento" SET status=\'pendente\'');
  const b=await change('2026-10-22T13:00:00Z');
  assert.equal((await dispatch(b.noticeId,{database:database({beforeFence:()=>pg.exec('UPDATE "Agendamento" SET "startTime"=\'2026-10-24\'')})})).status,'cancelled');
  const c=await change('2026-10-23T13:00:00Z');await pg.exec('DELETE FROM "Agendamento"');
  assert.equal((await dispatch(c.noticeId)).status,'cancelled');assert.equal(state.sent.length,0);
});
test('timeout iniciado fica incerto e não permite outro HTTP no replay',async()=>{
  const a=await change('2026-10-21T13:00:00Z');let calls=0;
  assert.equal((await dispatch(a.noticeId,{fetcher:async()=>{calls++;throw new Error('timeout');}})).status,'uncertain');
  assert.equal((await enqueue(a.params)).status,'already_recorded');
  assert.equal((await dispatch(a.noticeId)).status,'skipped');assert.equal(calls,1);
});
test('sem origem comprovada e com aviso inicial incompatível não há contorno por remarcação',async()=>{
  await pg.exec('DELETE FROM "WhatsAppEvaluationGroupNotice"');
  assert.equal((await change('2026-10-21T13:00:00Z')).reason,'unverified_source');
  assert.equal(state.sent.length,0);
});
test('aviso inicial incompatível não pode ser contornado',async()=>{
  await pg.exec('UPDATE "WhatsAppEvaluationGroupNotice" SET "configActivatedAt"=\'2026-10-08\'');
  assert.equal((await change('2026-10-21T13:00:00Z')).reason,'unverified_source');assert.equal(state.sent.length,0);
});
test('agenda anterior ao piloto usa prova da ocorrência anterior e mantém cadeia de origem',async()=>{
  await pg.exec('DELETE FROM "WhatsAppEvaluationGroupNotice"');
  state.appointment.createdAt=new Date('2026-10-01T13:00:00Z');
  await pg.query('UPDATE "Agendamento" SET "createdAt"=$1',[state.appointment.createdAt]);
  await pg.query('INSERT INTO "Automation" VALUES($1,$2,$3)',['automation',trigger,'SBC']);
  await pg.query('INSERT INTO "WhatsAppContact" VALUES($1,$2)',['contact',state.appointment.clientPhone]);
  await pg.query('INSERT INTO "WhatsAppConversation" VALUES($1,$2,$3)',['conversation',state.config.instanceId,'contact']);
  const start=state.appointment.startTime.toISOString();
  const data={topic:'AGENDA',action:trigger,appointmentId:'appointment',startTime:start,unit:'SBC',instanceId:state.config.instanceId,conversationId:'conversation'};
  await pg.query('INSERT INTO "AutomationLog" VALUES($1,$2,$3,$4,$5)',[`evaluation-message:${trigger}:automation:appointment:${start}`,'automation',state.appointment.clientPhone,data,'success']);
  const first=await change('2026-10-21T13:00:00Z');assert.equal(first.status,'queued');
  const second=await change('2026-10-22T13:00:00Z');assert.equal(second.status,'queued');
  assert.equal((await notice(first.noticeId)).state,'cancelled');
  assert.equal((await dispatch(second.noticeId)).status,'submitted');assert.equal(state.sent.length,1);
});
test('nova mudança durante a preparação cancela o claim anterior, sem HTTP obsoleto',async()=>{
  const first=await change('2026-10-21T13:00:00Z');let next;
  assert.equal((await dispatch(first.noticeId,{database:database({beforeFence:async()=>{next=await change('2026-10-22T13:00:00Z');}})})).status,'cancelled');
  assert.equal(state.sent.length,0);assert.equal((await notice(first.noticeId)).state,'cancelled');
  assert.equal((await dispatch(next.noticeId)).status,'submitted');
});
test('migrações antigas/novas repetidas preservam histórico, coluna e restrição',async()=>{
  const a=await change('2026-10-21T13:00:00Z');await dispatch(a.noticeId);const before=await notice(a.noticeId);
  for(const file of ['20261009020000_whatsapp_evaluation_group_notice','20261009120000_evaluation_group_confirmation_events','20261017120000_evaluation_group_cancellation_events','20261017150000_evaluation_group_reschedule_events'])await migration(file);
  assert.deepEqual(await notice(a.noticeId),before);
  await assert.rejects(pg.query('UPDATE "WhatsAppEvaluationGroupNotice" SET "previousStartTime"=NULL WHERE id=$1',[a.noticeId]),/check constraint/);
});
test('ativação exige drenagem, é idempotente e preserva todos os cortes anteriores',async()=>{
  delete state.config.reschedulesActivatedAt;await saveConfig();
  await pg.exec('UPDATE "WhatsAppEvaluationGroupNotice" SET state=\'processing\'');
  await assert.rejects(finalize(),/processamento/);await pg.exec('ROLLBACK');
  await pg.exec('UPDATE "WhatsAppEvaluationGroupNotice" SET state=\'submitted\'');
  await finalize();const first=JSON.parse((await pg.query('SELECT value FROM "AppSetting"')).rows[0].value);
  assert.ok(Number.isFinite(Date.parse(first.reschedulesActivatedAt)));const {reschedulesActivatedAt,...other}=first;
  assert.deepEqual(other,state.config);await finalize();assert.deepEqual(JSON.parse((await pg.query('SELECT value FROM "AppSetting"')).rows[0].value),first);
});
