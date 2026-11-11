import assert from 'node:assert/strict';
import test from 'node:test';
import { aliceAutonomySchedulingTextValid } from '../src/lib/ai-assistant/autonomy/content-policy.ts';
import { buildAliceAssistantRequest } from '../src/lib/ai-assistant/provider.ts';

const now = new Date('2026-11-10T15:00:00-03:00');
const offered = (times) => `Na quarta-feira, 11/11/2026, posso te oferecer ${times.join(', ')}. Qual funciona melhor para você?`;
const context = (...texts) => ({ UNIDADE: 'SBC', CONVERSA: texts.map((text) => ({ role: 'cliente', text })) });

test('Alice pode variar entre duas, três e quatro opções e não enviar uma lista de cinco', () => {
  for (const times of [['10h', '14h'], ['10h', '14h', '19h'], ['10h', '11h30', '15h', '19h']]) {
    assert.equal(aliceAutonomySchedulingTextValid([offered(times)], now), true, times.join(', '));
  }
  assert.equal(aliceAutonomySchedulingTextValid([offered(['10h', '11h', '14h', '16h', '19h'])], now), false);
  assert.equal(aliceAutonomySchedulingTextValid(['11/11/2026 temos horários das 10h às 14h.'], now), false);
  assert.equal(aliceAutonomySchedulingTextValid(['Temos das 10h às 14h no dia 11/11/2026.'], now), false);
  assert.equal(aliceAutonomySchedulingTextValid(['11/11/2026 temos horários a partir das 18h.'], now), false);
  assert.equal(aliceAutonomySchedulingTextValid(['11/11/2026 temos das 18h em diante.'], now), false);
  assert.equal(aliceAutonomySchedulingTextValid(['11/11/2026 temos 18h até 20h.'], now), false);
});

test('limite considera os slots da oferta inteira, inclusive quando dividida em mensagens', () => {
  assert.equal(aliceAutonomySchedulingTextValid([
    '11/11/2026 posso te oferecer 10h, 11h ou 12h.',
    '12/11/2026 posso te oferecer 14h ou 15h.',
  ], now), false);
  assert.equal(aliceAutonomySchedulingTextValid([
    '11/11/2026 posso te oferecer 10h ou 14h.',
    '11/11/2026, às 10h ou 14h, qual fica melhor?',
  ], now), true);
  assert.equal(aliceAutonomySchedulingTextValid(['11/11/2026 às 10h ou 11h. 12/11/2026 às 18h ou 19h.'], now), true);
});

test('nova oferta não mistura faixa aberta a lista; funcionamento canônico fica separado das opções', () => {
  for (const text of [
    'No sábado 14/11 temos horários disponíveis das 8h às 13h.\n08h00, 09h00 ou 10h30',
    'No sábado 14/11 temos das 8h às 13h. Opções: 9h, 10h, 11h ou 12h.',
    '14/11 temos 9h ou 10h, e das 11h às 13h.',
  ]) assert.equal(aliceAutonomySchedulingTextValid([text], now), false, text);
  for (const times of ['8h, 9h ou 10h30', '8h, 9h, 10h30 ou 11h']) {
    assert.equal(aliceAutonomySchedulingTextValid([
      `Aos sábados, atendemos das 8h às 13h. No sábado 14/11/2026 temos ${times}. Qual prefere?`,
    ], now), true);
  }
});

test('preferência explícita de período limita a oferta sem fixar sua quantidade', () => {
  const afternoon = context('Prefiro pela tarde');
  assert.equal(aliceAutonomySchedulingTextValid([offered(['14h', '16h'])], now, afternoon), true);
  assert.equal(aliceAutonomySchedulingTextValid([offered(['14h', '15h', '16h', '17h30'])], now, afternoon), true);
  assert.equal(aliceAutonomySchedulingTextValid([offered(['10h', '14h'])], now, afternoon), false);
  assert.equal(aliceAutonomySchedulingTextValid([offered(['18h', '19h'])], now, context('Noite')), true);
  assert.equal(aliceAutonomySchedulingTextValid([offered(['16h', '19h'])], now, context('Noite')), false);
  assert.equal(aliceAutonomySchedulingTextValid([offered(['10h', '11h'])], now, context('Tem alguma vaga de manhã?')), true);
  assert.equal(aliceAutonomySchedulingTextValid([offered(['14h', '15h'])], now, context('Tem alguma vaga de manhã?')), false);
});

test('recusa de período e correção recente prevalecem sobre a preferência anterior', () => {
  assert.equal(aliceAutonomySchedulingTextValid([offered(['14h', '19h'])], now, context('Não posso de manhã')), true);
  assert.equal(aliceAutonomySchedulingTextValid([offered(['10h', '14h'])], now, context('Não posso de manhã')), false);
  assert.equal(aliceAutonomySchedulingTextValid([offered(['10h', '14h'])], now, context('Não pela manhã')), false);
  assert.equal(aliceAutonomySchedulingTextValid([offered(['18h', '19h'])], now,
    context('Prefiro de manhã', 'Na verdade, pode ser à noite')), true);
  assert.equal(aliceAutonomySchedulingTextValid([offered(['10h', '11h'])], now,
    context('Prefiro de manhã', 'Na verdade, pode ser à noite')), false);
  assert.equal(aliceAutonomySchedulingTextValid([offered(['10h', '14h', '19h'])], now,
    context('Prefiro de manhã', 'Qualquer horário funciona')), true);
});

test('saudação, trabalho e preferência antiga não viram restrição nova de período', () => {
  assert.equal(aliceAutonomySchedulingTextValid([offered(['10h', '14h', '19h'])], now,
    context('Boa noite', 'Trabalho de manhã')), true);
  const old = { UNIDADE: 'SBC', CONVERSA: [
    { role: 'cliente', text: 'Prefiro de manhã', timestamp: '2026-11-01T10:00:00-03:00' },
    { role: 'cliente', text: 'Quero marcar para quarta', timestamp: now.toISOString() },
  ] };
  assert.equal(aliceAutonomySchedulingTextValid([offered(['14h', '19h'])], now, old), true);
});

test('uma opção exata e duração do procedimento continuam válidas; escassez inventada é barrada', () => {
  assert.equal(aliceAutonomySchedulingTextValid(['11/11/2026 às 19h30 pode ser?'], now), true);
  assert.equal(aliceAutonomySchedulingTextValid(['A sessão dura cerca de 1h. 11/11/2026 posso te oferecer 10h ou 14h.'], now), true);
  assert.equal(aliceAutonomySchedulingTextValid(['São as últimas vagas! 11/11/2026 temos 10h ou 14h.'], now), false);
  assert.equal(aliceAutonomySchedulingTextValid(['Só restam 2 horários: 11/11/2026 às 10h e 14h.'], now), false);
  assert.equal(aliceAutonomySchedulingTextValid(['Não são as últimas vagas. 11/11/2026 posso te oferecer 10h ou 14h.'], now), true);
  assert.equal(aliceAutonomySchedulingTextValid(['Você perguntou sobre últimas vagas. 11/11/2026 posso te oferecer 10h ou 14h.'], now), true);
});

test('oferta usa a grade recebida na geração e a recuperação sem grade não pode sugerir horário', () => {
  const prompt = { ...context('Prefiro quarta'), HORARIOS_SBC: ['2026-11-11T10:00', '2026-11-11T14:00'] };
  assert.equal(aliceAutonomySchedulingTextValid([offered(['10h', '14h'])], now, prompt), true);
  assert.equal(aliceAutonomySchedulingTextValid([offered(['10h', '19h'])], now, prompt), false);
  assert.equal(aliceAutonomySchedulingTextValid([offered(['10h', '14h'])], now, { ...prompt, HORARIOS_SBC: [] }), false);
  assert.equal(aliceAutonomySchedulingTextValid(['Qual dia fica melhor para você?'], now, { ...prompt, HORARIOS_SBC: [] }), true);
});

test('instruções SBC liberam seleção contextual de duas a quatro sem impor uma quantidade fixa', () => {
  const request = buildAliceAssistantRequest(context('Quero marcar uma avaliação'));
  assert.match(request.instructions, /OFERTAS_ENXUTAS_VARIAVEIS_SBC/u);
  assert.match(request.instructions, /duas, três ou quatro/u);
  assert.doesNotMatch(request.instructions, /Ofereça até dois horários/u);
  assert.doesNotMatch(buildAliceAssistantRequest({ UNIDADE: 'Osasco' }).instructions, /OFERTAS_ENXUTAS_VARIAVEIS_SBC/u);
});
