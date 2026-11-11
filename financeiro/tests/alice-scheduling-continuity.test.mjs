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
const { claimAliceAutonomousTurn, pauseAliceForHuman } = await import('../src/lib/ai-assistant/autonomy/queue.ts');
const { processAliceAutonomousTurn } = await import('../src/lib/ai-assistant/autonomy/runner.ts');
const { getOrCreateMemory } = await import('../src/lib/alice/memory.ts');
const { sbcSchedulingContinuityReply } = await import('../src/lib/ai-assistant/autonomy/scheduling-continuity.ts');
const { aliceAutonomySchedulingFailure, aliceAutonomySchedulingTextValid } = await import('../src/lib/ai-assistant/autonomy/content-policy.ts');

async function fixture() {
  const f = await runnerFixture(claimAliceAutonomousTurn, { memory: true });
  const scope = { conversationId: f.claim.turn.conversationId, instanceId: f.claim.turn.instanceId, unidade: 'SBC' };
  await getOrCreateMemory(scope, {}, f.adapter);
  const loadContext = f.deps.loadContext;
  const incoming = [{ id: 'preference', fromMe: false, type: 'text', status: 'delivered', body: 'Durante a semana' },
    { id: 'source-a', fromMe: false, type: 'text', status: 'delivered', body: 'Qual o endereço?' }];
  f.deps.loadContext = async (...args) => ({ ...await loadContext(...args), source: incoming[1],
    messages: [{ id: 'question', fromMe: true, status: 'read', respondedByName: 'Alice',
      body: 'Você prefere vir durante a semana ou no sábado?' }, ...incoming],
    prompt: { UNIDADE: 'SBC', HORARIOS_SBC: [], MENSAGENS_RECENTES_SEM_RESPOSTA: incoming.map(({ body: text }) => ({ text })) },
    memoryRuntime: { scope, guard: { scope, presentationAt: new Date(+f.state.clock - 100_000),
      contactName: 'Cliente de teste', appointment: null } } });
  f.deps.generate = async () => {
    f.state.generations++;
    await f.state.onGenerate?.();
    // Informação factual fora da formulação canônica: o filtro exige data para esses relógios.
    const response = 'Ficamos na Avenida das Nações Unidas, 30, São Bernardo do Campo. Atendemos de segunda a sexta das 10h às 20h. Qual período prefere?';
    return { messages: [response], proposal: structuredOutput({ resposta: [response] }), needsHuman: false,
      model: 'claude-sonnet-4-6', inputTokens: 100, outputTokens: 50, generationMs: 20, costMicroUsd: 1_050,
      cacheReadInputTokens: 0, cacheCreationInputTokens: 0, usageRecorded: true };
  };
  return { ...f, scope };
}

test('pergunta de endereço e preferência de semana não termina em silêncio após rejeição de horários', async () => {
  const f = await fixture();
  try {
    assert.equal(await processAliceAutonomousTurn(f.claim, {}, f.deps), 'sent');
    assert.equal(f.state.sends.length, 1);
    assert.match(f.state.sends[0], /Avenida das Nações Unidas, 30.*Jardim do Mar.*São Bernardo do Campo/su);
    assert.match(f.state.sends[0], /dia da semana.*período/su);
    assert.doesNotMatch(f.state.sends[0], /sou a Alice|agendad|reservad|equipe vai confirmar/iu);
    assert.equal(f.state.generations, 1);
    assert.equal((await f.readTurn()).appointmentId, null);
    assert.equal((await f.readChat()).aiMode, 'agent');
    assert.equal((await getOrCreateMemory(f.scope, {}, f.adapter)).resumo, null);
    const logs = (await f.pg.query(`SELECT details FROM "AuditLog" WHERE action='alice_scheduling_rejected'`)).rows;
    assert.equal(logs.length, 1);
    assert.deepEqual(JSON.parse(logs[0].details), { version: 1, stage: 'initial', reason: 'clock_requires_date', continuation: true });
    assert.doesNotMatch(logs[0].details, /endereco|Nações|Cliente|10h/u);
    assert.equal(await processAliceAutonomousTurn(f.claim, {}, f.deps), 'skipped');
    assert.equal(f.state.sends.length, 1);
  } finally { await f.pg.close(); }
});

test('diagnóstico diferencia falta de data, faixa misturada e opção fora da política', () => {
  const now = new Date('2026-11-11T20:27:00Z');
  assert.equal(aliceAutonomySchedulingFailure(['Atendemos das 10h às 20h.'], now), 'clock_requires_date');
  assert.equal(aliceAutonomySchedulingFailure(['14/11 temos das 8h às 13h. Opções: 9h ou 10h.'], now), 'mixed_range_and_options');
  assert.equal(aliceAutonomySchedulingFailure(['14/11 temos às 15h.'], now), 'option_outside_policy');
  assert.equal(aliceAutonomySchedulingTextValid(['Aos sábados, atendemos das 8h às 13h.'], now), true);
});

test('continuidade não substitui segurança clínica, agenda existente, unidade ou mídia', async () => {
  const f = await fixture();
  try {
    const context = await f.deps.loadContext(f.claim.turn);
    assert.ok(sbcSchedulingContinuityReply(context));
    for (const changed of [
      { handoffReason: 'clinical_safety' }, { bookingFollowup: true },
      { prompt: { UNIDADE: 'Osasco' } },
      { prompt: { ...context.prompt, DADOS_AGENDA_ATUAIS: { id: 'appointment' } } },
      { memoryRuntime: { ...context.memoryRuntime, guard: { ...context.memoryRuntime.guard, fear: { kind: 'needles' } } } },
      { memoryRuntime: { ...context.memoryRuntime, guard: { ...context.memoryRuntime.guard, appointment: { id: 'appointment' } } } },
      { messages: [...context.messages.slice(0, -1), { ...context.source, type: 'image' }] },
      { conversation: { ...context.conversation, instance: { ...context.conversation.instance, id: 'another-instance' } } },
    ]) assert.equal(sbcSchedulingContinuityReply({ ...context, ...changed }), null);
    f.state.handoffReason = 'clinical_safety';
    assert.equal(await processAliceAutonomousTurn(f.claim, {}, f.deps), 'needs_human');
    assert.equal(f.state.generations, 0);
    assert.deepEqual(f.state.sends, []);
  } finally { await f.pg.close(); }
});

test('retomada indisponível mantém a falha precisa no histórico, sem incluir o texto rejeitado', async () => {
  const f = await fixture();
  try {
    const load = f.deps.loadContext;
    f.deps.loadContext = async (...args) => {
      const context = await load(...args);
      return { ...context, messages: [...context.messages.slice(0, -1), { ...context.source, type: 'image' }] };
    };
    const generate = f.deps.generate;
    f.deps.generate = async (...args) => {
      if (f.state.generations) throw new Error('Erro de provedor com dados que não podem entrar na auditoria');
      return generate(...args);
    };
    assert.equal(await processAliceAutonomousTurn(f.claim, {}, f.deps), 'failed');
    const logs = (await f.pg.query(`SELECT details FROM "AuditLog" WHERE action='alice_scheduling_rejected'`)).rows.map(({ details }) => JSON.parse(details));
    assert.equal(logs[0].reason, 'clock_requires_date');
    assert.ok(logs.some(log => log.stage === 'retry_error'));
    assert.doesNotMatch(JSON.stringify(logs), /Erro de provedor|Nações|endereco/u);
    assert.deepEqual(f.state.sends, []);
  } finally { await f.pg.close(); }
});

test('continuidade após rejeição continua sujeita à tomada humana antes do envio', async () => {
  const f = await fixture();
  try {
    f.state.onBeforeSend = () => pauseAliceForHuman(f.claim.turn.conversationId, f.adapter);
    assert.equal(await processAliceAutonomousTurn(f.claim, {}, f.deps), 'skipped');
    assert.deepEqual(f.state.sends, []);
  } finally { await f.pg.close(); }
});
