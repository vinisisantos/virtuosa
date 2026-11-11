import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { runnerFixture } from './fixtures/alice-autonomy-runner.mjs';
import { contextInput, scope, earlier } from './fixtures/alice-memory-context.mjs';
import { structuredOutput, providerResponse } from './fixtures/alice-structured-output.mjs';
import { buildAliceContext } from '../src/lib/alice/build-context.ts';
import { generateAliceStructuredReply } from '../src/lib/alice/structured-generation.ts';
import { guardAliceReply } from '../src/lib/alice/guards.ts';
import { splitAliceMessageParts } from '../src/lib/alice/message-parts.ts';

globalThis.prisma = {};
globalThis.fetch = async () => { throw new Error('Rede real proibida'); };
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'server-only') return { url: 'data:text/javascript,export {};', shortCircuit: true };
  if (specifier === '@/generated/alice-knowledge') return { url: new URL('./fixtures/alice-test-knowledge.mjs', import.meta.url).href, shortCircuit: true };
  if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
    const source = new URL(`${specifier}.ts`, context.parentURL);
    if (existsSync(source)) return next(source.href, context);
  }
  return next(['next/server', 'next/headers'].includes(specifier) ? `${specifier}.js` : specifier, context);
} });
const { loadAliceAutonomousContext } = await import('../src/lib/ai-assistant/autonomy/context.ts');
const { processAliceAutonomousTurn } = await import('../src/lib/ai-assistant/autonomy/runner.ts');
const { generateAliceAutonomousReply } = await import('../src/lib/ai-assistant/autonomy/generate.ts');
const { claimAliceAutonomousTurn, pauseAliceForHuman } = await import('../src/lib/ai-assistant/autonomy/queue.ts');
const { getOrCreateMemory } = await import('../src/lib/alice/memory.ts');
const words = value => value.trim().split(/\s+/u);

test('200 palavras são aceitas e 451 viram complementos completos sem segunda geração', async () => {
  assert.equal(guardAliceReply(structuredOutput({ resposta: [Array(200).fill('sim').join(' ')] }),
    { scope, presentationAt: earlier, appointment: null, contactName: 'Cliente Teste' }).status, 'ready');
  const text = Array.from({ length: 451 }, (_, i) => `p${i}`).join(' ');
  let calls = 0;
  const result = await generateAliceStructuredReply({ scope, prompt: buildAliceContext(contextInput()) }, {
    apiKey: 'fixture', fetcher: async () => { calls++; return providerResponse(structuredOutput({ resposta: [text] })); },
  });
  assert.equal(result.status, 'draft');
  assert.equal(calls, 1);
  assert.ok(result.proposal.resposta.length >= 3);
  assert.ok(result.proposal.resposta.every(part => words(part).length <= 200 && part.length <= 1200));
  assert.deepEqual(result.proposal.resposta.flatMap(words), words(text));
});

test('divisão preserva parágrafos, frases, links, preços e o final, sem quebrar palavras', () => {
  const paragraphs = [Array(100).fill('Objetivo').join(' '), Array(100).fill('Contexto').join(' '),
    'O valor é R$ 699,00. Veja https://example.com/avaliacao?dia=14&hora=10. Qual período prefere?'];
  const parts = splitAliceMessageParts([paragraphs.join('\n\n')]);
  assert.deepEqual(parts.flatMap(words), words(paragraphs.join(' ')));
  assert.ok(parts.every(part => words(part).length <= 200 && part.length <= 1200));
  assert.ok(parts.at(-1).endsWith('Qual período prefere?'));
  assert.throws(() => splitAliceMessageParts(['x'.repeat(1201)]), /unsplittable_word/);
});

test('caixas adicionais não invalidam acolhimento já dividido; promessas clínicas continuam bloqueadas no lote inteiro', () => {
  const text = Array.from({ length: 3 }, () => Array(220).fill('Contexto').join(' ')).join('\n\n');
  const parts = splitAliceMessageParts([text]);
  const context = { scope, presentationAt: earlier, appointment: null, contactName: null,
    fear: { kind: 'needles', requiresHuman: false, generalInformationOnly: true } };
  assert.ok(parts.length > 4);
  assert.equal(guardAliceReply(structuredOutput({ resposta: parts }), context).status, 'ready');
  assert.equal(guardAliceReply(structuredOutput({ resposta: [...parts, 'Não tem risco.'] }), context).reason, 'fear_unsafe_claim');
});

test('worker drena três ou mais caixas, preserva recibos e só grava o resumo ao concluir; intervenção interrompe complementos', async () => {
  process.env.ALICE_CONVERSATION_MEMORY_SBC_ENABLED = 'true';
  for (const stop of ['none', 'human', 'incoming', 'timeout']) {
    const f = await runnerFixture(claimAliceAutonomousTurn, { memory: true });
    try {
      await f.pg.query(`INSERT INTO "WhatsAppMessage" (id,"conversationId","messageId","fromMe",body,status,timestamp,"respondedByName")
        VALUES ('intro','conversation-a','intro',TRUE,'Sou a Alice, da Virtuosa.','sent',NOW()-interval '1 day','Alice')`);
      const text = Array(451).fill('Sim').join(' ');
      const deps = { ...f.deps, loadContext: loadAliceAutonomousContext, generate: (context, _, signal) =>
        generateAliceAutonomousReply(context, async () => { f.state.generations++; return providerResponse(structuredOutput({
          resposta: [text], memoria: { resumo: 'Contexto concluído sem perder os complementos.' } })); }, signal) };
      let claim = f.claim;
      assert.equal(await processAliceAutonomousTurn(claim, {}, deps), 'queued');
      assert.equal((await getOrCreateMemory({ conversationId: 'conversation-a', instanceId: claim.turn.instanceId, unidade: 'SBC' }, {}, f.adapter)).resumo, null);
      const first = await f.readTurn();
      assert.equal(await claimAliceAutonomousTurn(f.adapter), null, 'respeita três segundos');
      if (stop === 'human') await pauseAliceForHuman('conversation-a', f.adapter);
      if (stop === 'incoming') await f.pg.query(`INSERT INTO "WhatsAppMessage" (id,"conversationId","messageId",body,timestamp)
        VALUES ('new-source','conversation-a','new-source','Uma dúvida nova',NOW()+interval '1 second')`);
      if (stop === 'timeout') f.state.failSend = true;
      for (let part = 0; part < 8; part++) {
        await f.pg.query(`UPDATE "AliceAutonomousTurn" SET "availableAt"=NOW()-interval '1 second' WHERE id='turn-a' AND status='queued'`);
        f.state.clock = new Date(+f.state.clock + 3000);
        claim = await claimAliceAutonomousTurn(f.adapter);
        if (!claim) break;
        await processAliceAutonomousTurn(claim, {}, deps);
      }
      const turn = await f.readTurn();
      assert.equal(turn.status, stop === 'none' ? 'sent' : stop === 'timeout' ? 'uncertain' : 'skipped');
      assert.equal(f.state.generations, 1);
      assert.equal(f.state.sends.length, stop === 'none' ? 3 : stop === 'timeout' ? 2 : 1);
      assert.equal(turn.firstSentAt.getTime(), first.firstSentAt.getTime());
      assert.equal(turn.providerMessageIds.length, stop === 'timeout' ? 1 : f.state.sends.length);
      if (stop === 'none') {
        assert.deepEqual(f.state.sends.flatMap(words), words(text));
        const memory = await getOrCreateMemory({ conversationId: 'conversation-a', instanceId: f.claim.turn.instanceId, unidade: 'SBC' }, {}, f.adapter);
        assert.equal(memory.resumo, 'Contexto concluído sem perder os complementos.');
      }
      assert.equal(await processAliceAutonomousTurn(f.claim, {}, deps), 'skipped', 'não repete a primeira caixa');
    } finally { await f.pg.close(); }
  }
  delete process.env.ALICE_CONVERSATION_MEMORY_SBC_ENABLED;
});

test('conteúdo interno na terceira caixa barra todo o lote antes de enviar a primeira', async () => {
  process.env.ALICE_CONVERSATION_MEMORY_SBC_ENABLED = 'true';
  const f = await runnerFixture(claimAliceAutonomousTurn, { memory: true });
  try {
    const load = f.deps.loadContext;
    f.deps.loadContext = async (...args) => ({ ...await load(...args), memoryRuntime: {
      scope: { conversationId: 'conversation-a', instanceId: f.claim.turn.instanceId, unidade: 'SBC' },
      guard: { scope: { conversationId: 'conversation-a', instanceId: f.claim.turn.instanceId, unidade: 'SBC' },
        presentationAt: earlier, contactName: null, appointment: null } } });
    const generate = f.deps.generate;
    f.deps.generate = async (...args) => ({ ...await generate(...args), messages: ['Primeira parte.', 'Segunda parte.', '[NOTA interna]'],
      proposal: structuredOutput({ resposta: ['Primeira parte.', 'Segunda parte.', '[NOTA interna]'] }) });
    assert.equal(await processAliceAutonomousTurn(f.claim, {}, f.deps), 'needs_human');
    assert.equal((await f.readTurn()).error, 'internal_content');
    assert.equal(f.state.sends.length, 0);
  } finally { delete process.env.ALICE_CONVERSATION_MEMORY_SBC_ENABLED; await f.pg.close(); }
});
