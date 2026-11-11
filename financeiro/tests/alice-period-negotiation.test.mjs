import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { runnerFixture } from './fixtures/alice-autonomy-runner.mjs';
import { selectSbcSchedulingExchange, SBC_BOOKING_CHOICE_CLARIFICATION } from '../src/lib/ai-assistant/sbc-scheduling-exchange.ts';
import { aliceEvaluationAllowedPeriods, evaluationRequestedPeriod } from '../src/lib/ai-assistant/evaluation-offer-policy.ts';
import { buildSbcEvaluationOptions } from '../src/lib/ai-assistant/sbc-scheduling-policy.ts';

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
const { claimAliceAutonomousTurn } = await import('../src/lib/ai-assistant/autonomy/queue.ts');
const { processAliceAutonomousTurn } = await import('../src/lib/ai-assistant/autonomy/runner.ts');
const { pauseAliceForHuman } = await import('../src/lib/ai-assistant/autonomy/queue.ts');
const now = new Date('2026-11-11T21:22:20Z');
const offer = { id: 'offer', fromMe: true, type: 'text', status: 'sent', respondedByName: 'Alice',
  body: 'No sábado, 14/11/2026, temos 8h, 9h ou 10h30. Qual prefere?' };
const reply = (body) => ({ id: 'source-a', fromMe: false, type: 'text', status: 'delivered', body });

test('pedir outro período em forma de pergunta gera negociação, sem escolha incompleta', () => {
  for (const body of ['Na parte da tarde teria?', 'Teria à tarde?', 'E à tarde?', 'Tem horário de tarde?',
    'Na parte da tarde tem horário?', 'No sábado teria no período da tarde?', 'Tem no sábado à tarde?']) {
    assert.equal(selectSbcSchedulingExchange([offer, reply(body)], now), null, body);
    assert.deepEqual([...aliceEvaluationAllowedPeriods({ UNIDADE: 'SBC', CONVERSA: [{ role: 'cliente', text: body }] }, now)], ['afternoon'], body);
  }
});

test('pergunta de tarde substitui preferência antiga e não libera horário fora do período', () => {
  const prompt = { UNIDADE: 'SBC', CONVERSA: [{ role: 'cliente', text: 'Prefiro de manhã' },
    { role: 'cliente', text: 'Na parte da tarde teria?' }] };
  assert.deepEqual([...aliceEvaluationAllowedPeriods(prompt, now)], ['afternoon']);
  assert.deepEqual(buildSbcEvaluationOptions(now).filter(slot => slot.startsWith('2026-11-14T') && Number(slot.slice(11, 13)) >= 12),
    ['2026-11-14T12:00', '2026-11-14T12:30', '2026-11-14T13:00']);
});

test('leitura de período não apaga relógios, perguntas extras, condições ou segurança clínica', () => {
  for (const text of ['10h, na parte da tarde teria?', 'Na parte da tarde teria? Qual o valor?',
    'Se eu conseguir, à tarde', 'Não consigo à tarde', 'À tarde tem anestesia?', 'Manhã ou tarde?',
    'Sábado ou segunda à tarde?', 'À tarde, estou grávida']) assert.equal(evaluationRequestedPeriod(text), null, text);
  for (const text of ['10h30, mas ainda não confirma', '10h30 se eu conseguir', '10h30, estou grávida']) {
    assert.equal(selectSbcSchedulingExchange([offer, reply(text)], now)?.slot ?? null, null, text);
  }
});

test('worker responde com novas opções da tarde sem tentar reservar nem insistir na manhã', async () => {
  const f = await runnerFixture(claimAliceAutonomousTurn);
  try {
    const load = f.deps.loadContext;
    f.deps.loadContext = async (...args) => ({ ...await load(...args), source: reply('Na parte da tarde teria?'),
      messages: [offer, reply('Na parte da tarde teria?')], prompt: { UNIDADE: 'SBC',
        CONVERSA: [{ role: 'cliente', text: 'Na parte da tarde teria?' }] } });
    let attempts = 0;
    f.deps.schedule = async () => { attempts++; return { status: 'choice_required', reason: 'Escolha exata ausente' }; };
    const generate = f.deps.generate;
    f.deps.generate = async (...args) => ({ ...await generate(...args), messages: ['No sábado, 14/11/2026, posso te oferecer 12h, 12h30 ou 13h. Qual fica melhor?'] });
    assert.equal(await processAliceAutonomousTurn(f.claim, {}, f.deps), 'sent');
    assert.equal(attempts, 0);
    assert.equal(f.state.generations, 1);
    assert.equal(f.state.sends.length, 1);
    assert.match(f.state.sends[0], /12h.*12h30.*13h/u);
    assert.doesNotMatch(f.state.sends[0], /opções que te enviei/u);
    assert.equal((await f.readTurn()).appointmentId, null);
  } finally { await f.pg.close(); }
});

test('continuação pontual preserva recibo anterior e envia apenas a nova oferta da tarde com as mesmas guardas', async () => {
  const newOffer = 'Sim! Para sábado, 14/11/2026, posso te oferecer 12h, 12h30 ou 13h. Qual fica melhor para você? 😊';
  for (const intervene of [false, true]) {
    const f = await runnerFixture(claimAliceAutonomousTurn, { memory: true, beforeClaim: async pg => {
      await pg.exec(`UPDATE "WhatsAppMessage" SET body='Na parte da tarde teria?',timestamp=NOW()-interval '2 minutes',"createdAt"=NOW()-interval '2 minutes' WHERE id='source-a';
        INSERT INTO "WhatsAppMessage" (id,"conversationId","messageId","fromMe",body,type,status,timestamp,"createdAt","respondedByName")
        VALUES ('old-reply','conversation-a','old-provider',TRUE,'${SBC_BOOKING_CHOICE_CLARIFICATION}','text','delivered',NOW()-interval '1 minute',NOW()-interval '1 minute','Alice');`);
      await pg.query(`UPDATE "AliceAutonomousTurn" SET "nextMessageIndex"=1,"firstSentAt"=NOW()-interval '1 minute',
        "providerMessageIds"='["old-provider"]',"messagesJson"=$1,attempts=1 WHERE id='turn-a'`,
      [JSON.stringify([SBC_BOOKING_CHOICE_CLARIFICATION, newOffer])]);
    } });
    try {
      const scope = { conversationId: f.claim.turn.conversationId, instanceId: f.claim.turn.instanceId, unidade: 'SBC' };
      const load = f.deps.loadContext;
      f.deps.loadContext = async (...args) => ({ ...await load(...args), source: reply('Na parte da tarde teria?'),
        messages: [offer, reply('Na parte da tarde teria?'), { id: 'old-reply', fromMe: true, status: 'delivered',
          respondedByName: 'Alice', body: SBC_BOOKING_CHOICE_CLARIFICATION }],
        prompt: { UNIDADE: 'SBC', CONVERSA: [{ role: 'cliente', text: 'Na parte da tarde teria?' }] },
        memoryRuntime: { scope, guard: { scope, presentationAt: new Date(+f.state.clock - 100_000),
          contactName: 'Cliente de teste', appointment: null } } });
      f.deps.generate = async () => { throw new Error('A continuação já está persistida'); };
      if (intervene) f.state.onBeforeSend = () => pauseAliceForHuman(f.claim.turn.conversationId, f.adapter);
      assert.equal(await processAliceAutonomousTurn(f.claim, {}, f.deps), intervene ? 'skipped' : 'sent');
      assert.deepEqual(f.state.sends, intervene ? [] : [newOffer]);
      const turn = await f.readTurn();
      assert.equal(turn.firstSentAt.getTime(), f.claim.turn.firstSentAt.getTime());
      assert.deepEqual(turn.providerMessageIds, intervene ? ['old-provider'] : ['old-provider', 'provider-fixture-1']);
      assert.equal(await processAliceAutonomousTurn(f.claim, {}, f.deps), 'skipped');
      if (!intervene) assert.equal(selectSbcSchedulingExchange([
        { ...offer, body: newOffer }, reply('12h30')], f.state.clock)?.slot, '2026-11-14T12:30');
    } finally { await f.pg.close(); }
  }
});
