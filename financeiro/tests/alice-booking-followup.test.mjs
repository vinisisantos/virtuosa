import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { runnerFixture } from './fixtures/alice-autonomy-runner.mjs';
import { structuredOutput } from './fixtures/alice-structured-output.mjs';
globalThis.prisma = {};
globalThis.fetch = async () => { throw new Error('Rede externa proibida'); };
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'server-only') return { url: 'data:text/javascript,export {};', shortCircuit: true };
  if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
    const source = new URL(`${specifier}.ts`, context.parentURL);
    if (existsSync(source)) return next(source.href, context);
  }
  return next(['next/server', 'next/headers'].includes(specifier) ? `${specifier}.js` : specifier, context);
} });
const { claimAliceAutonomousTurn, recoverAliceAutonomousTurns } = await import('../src/lib/ai-assistant/autonomy/queue.ts');
const { processAliceAutonomousTurn } = await import('../src/lib/ai-assistant/autonomy/runner.ts');
const { getOrCreateMemory } = await import('../src/lib/alice/memory.ts');
const { aliceFearPolicy } = await import('../src/lib/alice/fear-policy.ts');

async function fixture() {
  const f = await runnerFixture(claimAliceAutonomousTurn, { memory: true });
  const scope = { conversationId: f.claim.turn.conversationId, instanceId: f.claim.turn.instanceId, unidade: 'SBC' };
  await getOrCreateMemory(scope, {}, f.adapter);
  const questions = ['Dói muito?', 'Morro de medo de agulha'];
  const prompt = { UNIDADE: 'SBC', CONVERSA: questions.map(text => ({ role: 'cliente', text })),
    MENSAGENS_RECENTES_SEM_RESPOSTA: questions.map(text => ({ text })) };
  const originalContext = f.deps.loadContext;
  f.deps.loadContext = async (...args) => ({ ...await originalContext(...args), prompt, messages: [
    { id: 'offer', fromMe: true, status: 'read', body: 'Temos 14/11/2026 às 10h ou 10h30. Qual prefere?', respondedByName: 'Alice' },
    { id: 'source-a', fromMe: false, status: 'received', body: '10h. Dói muito? Morro de medo de agulha' },
  ], memoryRuntime: { scope, guard: { scope, presentationAt: new Date(f.state.clock.getTime() - 100_000),
    contactName: 'Cliente de teste', appointment: null, fear: aliceFearPolicy(prompt) } } });
  let bookings = 0;
  f.deps.schedule = async () => {
    bookings++;
    const start = new Date(f.state.clock.getTime() + 86_400_000);
    await f.pg.query(`INSERT INTO "AliceAutoSchedule" (id,"conversationId","replyMessageId","appointmentId",state)
      VALUES ('ledger','conversation-a','source-a','appointment','submitted')`);
    await f.pg.query(`INSERT INTO "Agendamento" (id,unit,"clientPhone",procedimento,status,"startTime","endTime")
      VALUES ('appointment','SBC','5511900001234','Avaliação','pendente',$1,$2)`, [start, new Date(start.getTime() + 30*60_000)]);
    await f.pg.query(`UPDATE "AliceAutonomousTurn" SET "appointmentId"='appointment',"messagesJson"=$1 WHERE id=$2`,
      [JSON.stringify({ kind: 'booking_followup', version: 1, questions, startTime: start.toISOString() }), f.claim.turn.id]);
    await f.pg.query(`INSERT INTO "WhatsAppMessage" (id,"conversationId","messageId","fromMe","respondedByName",body,status,timestamp)
      VALUES ('confirmation','conversation-a','provider-confirmation',true,'Alice','Confirmação com endereço','sent',$1)`, [f.state.clock]);
    return { status: 'booked', confirmation: 'submitted', startTime: start.toISOString(), pendingQuestions: questions,
      confirmationMessage: { messageId: 'provider-confirmation', messageRowId: 'confirmation', sentAt: f.state.clock } };
  };
  const reply = 'Entendo seu receio e podemos conversar com calma.\n\nA avaliação é gratuita e sem compromisso, para você esclarecer suas dúvidas com a profissional.\n\nVocê pode decidir sobre o procedimento depois dessa conversa, quando se sentir confortável.';
  f.deps.generate = async context => {
    f.state.generations++;
    assert.equal(context.bookingFollowup, true);
    assert.deepEqual(context.prompt.HORARIOS_SBC, []);
    assert.equal(context.prompt.DUVIDAS_APOS_AGENDAMENTO.confirmacao, 'submitted');
    return { messages: [reply], proposal: structuredOutput({ resposta: [reply] }), needsHuman: false,
      model: 'claude-sonnet-4-6', inputTokens: 100, outputTokens: 50, generationMs: 20, costMicroUsd: 1_050,
      cacheReadInputTokens: 0, cacheCreationInputTokens: 0, usageRecorded: true };
  };
  const next = async () => {
    f.state.clock = new Date(f.state.clock.getTime() + 3_000);
    await f.pg.query(`UPDATE "AliceAutonomousTurn" SET "availableAt"=NOW()-interval '1 second' WHERE id=$1`, [f.claim.turn.id]);
    return claimAliceAutonomousTurn(f.adapter);
  };
  return { ...f, questions, reply, bookings: () => bookings, next };
}

test('agenda com medo geral, registra confirmação própria e responde a dúvida no mesmo turno sem nova reserva', async () => {
  const f = await fixture();
  try {
    assert.equal(await processAliceAutonomousTurn(f.claim, {}, f.deps), 'queued');
    const booked = await f.readTurn();
    assert.equal(booked.appointmentId, 'appointment');
    assert.deepEqual(booked.providerMessageIds, ['provider-confirmation']);
    assert.equal(booked.messagesJson.kind, 'booking_followup');
    assert.equal(booked.availableAt.getTime(), f.state.clock.getTime() + 3_000);
    assert.equal(f.state.generations, 0);
    const claim = await f.next();
    assert.equal(await processAliceAutonomousTurn(claim, {}, f.deps), 'sent', (await f.readTurn()).error);
    const final = await f.readTurn();
    assert.equal(f.bookings(), 1);
    assert.equal(f.state.generations, 1);
    assert.deepEqual(f.state.sends, [f.reply]);
    assert.equal(final.nextMessageIndex, 2);
    assert.equal(final.providerMessageIds.length, 2);
    assert.equal(final.costMicroUsd, 1_050);
    assert.equal(final.messagesJson, null);
    assert.deepEqual(f.state.handoffs, []);
  } finally { await f.pg.close(); }
});

test('revisão do complemento conserva a avaliação e não repete confirmação ou reserva', async () => {
  const f = await fixture();
  try {
    assert.equal(await processAliceAutonomousTurn(f.claim, {}, f.deps), 'queued');
    const claim = await f.next();
    f.deps.generate = async () => ({ messages: [], needsHuman: true, generationFailure: 'human_review_low_confidence',
      model: 'claude-sonnet-4-6', inputTokens: 100, outputTokens: 0, generationMs: 20, costMicroUsd: 300,
      cacheReadInputTokens: 0, cacheCreationInputTokens: 0, usageRecorded: true });
    assert.equal(await processAliceAutonomousTurn(claim, {}, f.deps), 'needs_human');
    const final = await f.readTurn();
    assert.equal(final.error, 'booking_followup_requires_review');
    assert.equal(final.appointmentId, 'appointment');
    assert.equal((await f.pg.query('SELECT count(*)::int AS count FROM "Agendamento"')).rows[0].count, 1);
    assert.equal(f.bookings(), 1);
    assert.equal(f.state.sends.length, 0);
    assert.equal((await f.readChat()).aiMode, 'agent');
  } finally { await f.pg.close(); }
});

test('nova entrada antes do complemento cancela a saída sem apagar o agendamento', async () => {
  const f = await fixture();
  try {
    assert.equal(await processAliceAutonomousTurn(f.claim, {}, f.deps), 'queued');
    const claim = await f.next();
    await f.pg.query(`INSERT INTO "WhatsAppMessage" (id,"conversationId","messageId",body,timestamp)
      VALUES ('new-source','conversation-a','new-source','Quero outro dia',$1)`, [new Date(f.state.clock.getTime() + 1_000)]);
    assert.equal(await processAliceAutonomousTurn(claim, {}, f.deps), 'skipped');
    assert.equal((await f.readTurn()).appointmentId, 'appointment');
    assert.equal(f.bookings(), 1);
    assert.equal(f.state.sends.length, 0);
    assert.equal(f.state.generations, 0);
  } finally { await f.pg.close(); }
});

test('alerta clínico posterior mantém código clínico e controle humano sem duplicar a avaliação', async () => {
  const f = await fixture();
  try {
    assert.equal(await processAliceAutonomousTurn(f.claim, {}, f.deps), 'queued');
    const claim = await f.next();
    f.state.handoffReason = 'clinical_safety';
    assert.equal(await processAliceAutonomousTurn(claim, {}, f.deps), 'needs_human');
    assert.equal((await f.readTurn()).error, 'clinical_safety');
    assert.equal((await f.readTurn()).appointmentId, 'appointment');
    assert.equal((await f.readChat()).aiMode, 'manual');
    assert.equal(f.bookings(), 1);
    assert.equal(f.state.generations, 0);
    assert.equal(f.state.sends.length, 0);
  } finally { await f.pg.close(); }
});

test('queda após confirmação e antes de o runner receber o resultado preserva a dúvida registrada com a agenda', async () => {
  const f = await fixture();
  try {
    await f.deps.schedule();
    const beforeRecovery = await f.readTurn();
    assert.equal(beforeRecovery.nextMessageIndex, 0, 'o runner ainda não registrou o recebimento da confirmação');
    assert.deepEqual(beforeRecovery.providerMessageIds, []);
    assert.equal(beforeRecovery.messagesJson.kind, 'booking_followup');
    await f.pg.query(`UPDATE "AliceAutonomousTurn" SET "claimedAt"=NOW()-interval '5 minutes' WHERE id=$1`, [f.claim.turn.id]);
    await recoverAliceAutonomousTurns(f.adapter);
    const turn = await f.readTurn();
    assert.equal(turn.status, 'needs_human', 'a confirmação não deve dar a dúvida como respondida');
    assert.equal(turn.error, 'booking_followup_requires_review');
    assert.equal(turn.appointmentId, 'appointment');
    assert.equal((await f.readChat()).aiMode, 'agent');
    assert.equal(f.bookings(), 1);
    assert.equal(f.state.sends.length, 0);
  } finally { await f.pg.close(); }
});

for (const status of ['processing', 'sending']) test(`interrupção do complemento em ${status} preserva agenda e impede replay`, async () => {
  const f = await fixture();
  try {
    assert.equal(await processAliceAutonomousTurn(f.claim, {}, f.deps), 'queued');
    await f.pg.query(`UPDATE "AliceAutonomousTurn" SET status=$1,"claimedAt"=NOW()-interval '5 minutes',"claimToken"='stale' WHERE id=$2`, [status, f.claim.turn.id]);
    await recoverAliceAutonomousTurns(f.adapter);
    const turn = await f.readTurn();
    assert.equal(turn.status, status === 'sending' ? 'uncertain' : 'needs_human');
    assert.equal(turn.error, status === 'sending' ? 'booking_followup_send_interrupted_no_retry' : 'booking_followup_requires_review');
    assert.equal(turn.appointmentId, 'appointment');
    assert.equal((await f.readChat()).aiMode, status === 'sending' ? 'manual' : 'agent');
    assert.equal(f.bookings(), 1);
  } finally { await f.pg.close(); }
});
