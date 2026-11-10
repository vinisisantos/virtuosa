import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSbcEvaluationOptions, deriveSbcEvaluationChoice } from '../src/lib/ai-assistant/sbc-scheduling-policy.ts';
import { selectSbcSchedulingExchange } from '../src/lib/ai-assistant/sbc-scheduling-exchange.ts';

const now = new Date('2026-11-09T15:00:00Z');
const offer = (body) => ({ body, fromMe: true, status: 'delivered' });
const reply = (body) => ({ body, fromMe: false, status: 'received' });

test('primeiro horário refere-se à primeira hora ofertada de um dia, não à primeira vaga ainda no futuro', () => {
  const pick = (text, answer, clock = now) => deriveSbcEvaluationChoice({ offer: offer(text), reply: reply(answer), now: clock });
  const range = '14/11/2026 temos horários a partir das 8h até às 13h. Alguma preferência?';
  assert.equal(pick(range, 'Primeiro horário'), '2026-11-14T08:00');
  assert.equal(pick(range, '10h30'), '2026-11-14T10:30');
  for (const answer of ['não quero o primeiro horário', 'tem o primeiro horário?', 'se der no primeiro horário', 'primeiro horário ou 10h', 'pode ser']) {
    assert.equal(pick(range, answer), null, answer);
  }
  assert.equal(pick(range, 'o primeiro horário', new Date('2026-11-14T11:15Z')), null);
  const options = 'Opções: 11/11 às 14h ou 13h e 14/11 às 9h ou 8h.';
  assert.equal(pick(options, 'primeiro horário'), null);
  assert.equal(pick(options, 'sábado no primeiro horário'), '2026-11-14T08:00');
});

test('escolhe quarta às 14h entre três dias realmente oferecidos, sem inventar data', () => {
  const offered = offer('Aqui vão algumas opções à tarde\n09/11 (segunda) às 14h\n10/11 (terça) às 14h\n11/11 (quarta) às 14h\nQual delas fica melhor pra você?');
  assert.equal(deriveSbcEvaluationChoice({ offer: offered, reply: reply('quarta às 14h'), now }), '2026-11-11T14:00');
  assert.equal(deriveSbcEvaluationChoice({ offer: offered, reply: reply('às 14h'), now }), null);
  assert.equal(deriveSbcEvaluationChoice({ offer: offered, reply: reply('quinta às 14h'), now }), null);
});

const message = (id, body, fromMe) => ({ id, body, fromMe, status: fromMe ? 'delivered' : 'received', type: 'text' });
test('preferência só pelo sábado com vários horários mantém o diálogo, sem gravar nem escalar', () => {
  const offered = message('offer', 'Sábado 14/11 temos horários das 8h às 13h.', true);
  assert.equal(selectSbcSchedulingExchange([offered, message('reply', 'Prefiro sábado', false)], now), null);
});
test('recusar a manhã deste sábado é negociação; só agenda após aceitar uma alternativa da grade', () => {
  const offered = message('am', 'Temos horários disponíveis no sábado, 14/11/2026. Você prefere de manhã cedo (8h, 8h30 ou 9h) ou um pouco mais tarde (9h30, 10h ou 10h30)?', true);
  for (const replies of [
    ['eu não posso no periodo da manhã', 'neste sábado'],
    ['Neste sábado, não consigo de manhã.'],
    ['não dá de manhã nesse sábado'],
    ['prefiro à tarde no sábado'],
  ]) {
    assert.equal(selectSbcSchedulingExchange([offered, ...replies.map((text, i) => message(String(i), text, false))], now), null, replies.join(' / '));
  }
  const grid = buildSbcEvaluationOptions(now);
  assert.ok(['12:30', '13:00'].every(time => grid.includes('2026-11-14T' + time)));
  assert.ok(!grid.includes('2026-11-14T13:30'));
  const alternative = message('new', 'No sábado, 14/11/2026, temos 12h30 ou 13h. Qual horário você prefere?', true);
  const history = [offered, message('reject', 'Não posso de manhã neste sábado', false), alternative];
  assert.equal(selectSbcSchedulingExchange([...history, message('pick', 'As 13h', false)], now)?.slot, '2026-11-14T13:00');
  for (const unsafe of ['13h ou 12h30', '13h, mas estou grávida', 'não quero mais sábado']) {
    const result = selectSbcSchedulingExchange([...history, message('change', unsafe, false)], now);
    assert.ok(result && result.slot === null, unsafe);
  }
});
test('oferta de sábado com só um horário não transforma negativa, pergunta ou ressalva em aceite', () => {
  const offered = message('offer', 'No sábado, 14/11/2026, temos um horário às 13h. Pode ser?', true);
  const respond = (...texts) => selectSbcSchedulingExchange([offered, ...texts.map((t, i) => message(String(i), t, false))], now);
  assert.equal(respond('pode ser sábado')?.slot, '2026-11-14T13:00');
  for (const texts of [['não posso neste sábado'], ['não posso de manhã neste sábado'], ['não posso de manhã', 'neste sábado']]) {
    assert.equal(respond(...texts), null, texts.join(' / '));
  }
  for (const texts of [['pode ser sábado?'], ['pode ser sábado', 'mas estou grávida'], ['pode ser sábado, mas não às 13h']]) {
    assert.equal(respond(...texts)?.slot, null, texts.join(' / '));
  }
});
test('une saudação e escolha mantendo a oferta enviada e a última entrada como origem', () => {
  const messages = [
    message('offer', 'Na quarta-feira (11/11) temos horários disponíveis a partir das 13h. Você prefere 13h, 13h30 ou 14h?', true),
    message('greeting', 'Bom dia', false), message('choice', 'As 14 horas', false),
  ];
  const result = selectSbcSchedulingExchange(messages, now);
  assert.equal(result?.slot, '2026-11-11T14:00');
  assert.equal(result?.offer, messages[0]);
  assert.equal(result?.reply, messages[2]);
});

test('preserva escolha anterior à dúvida sobre avaliação gratuita sem usar pergunta como aceite', () => {
  const messages = [message('offer', 'Opções: 10/11 (terça) às 14h ou 11/11 (quarta) às 14h.', true),
    message('choice', 'quarta às 14h', false), message('question', 'Tem algum custo a avaliação?', false)];
  const result = selectSbcSchedulingExchange(messages, now);
  assert.equal(result?.slot, '2026-11-11T14:00');
  assert.equal(result?.reply.id, 'question');
  assert.equal(result?.asksEvaluationCost, true);
  assert.equal(selectSbcSchedulingExchange([messages[0], messages[2]], now), null);
});

test('não cruza intervenção humana, mídia, escolha contraditória ou condição clínica', () => {
  const offered = message('offer', 'Podemos agendar 11/11 às 14h ou 15h?', true);
  const choice = message('choice', '14h', false);
  for (const extra of [message('health', 'Mas estou grávida', false),
    message('cancel', 'Não quero mais', false), message('change', '15h', false),
    { ...message('audio', '', false), type: 'audio' }]) {
    assert.equal(selectSbcSchedulingExchange([offered, choice, extra], now)?.slot ?? null, null);
  }
  assert.equal(selectSbcSchedulingExchange([offered, choice, message('human', 'Vou conferir', true), message('ok', 'Sim', false)], now), null);
  assert.equal(selectSbcSchedulingExchange([{ ...offered, status: 'pending' }, choice], now)?.slot ?? null, null);
});

test('aceita o horário explícito no fim da faixa de sábado, sem escolher pela cliente', () => {
  const offered = offer('No sábado 14/11/2026 temos horários disponíveis das 8h às 13h. Qual horário fica melhor para você?');
  assert.equal(deriveSbcEvaluationChoice({ offer: offered, reply: reply('As 13h'), now }), '2026-11-14T13:00');
  assert.equal(deriveSbcEvaluationChoice({ offer: offered, reply: reply('Pode ser'), now }), null);
  assert.equal(deriveSbcEvaluationChoice({ offer: offered, reply: reply('13h30'), now }), null);
  assert.equal(deriveSbcEvaluationChoice({ offer: offered, reply: reply('7h30'), now }), null);
});

test('não transforma oferta ambígua em aceite só porque uma opção passou ou está fora da grade', () => {
  const offered = offer('Opções: 09/11 às 10h ou 11/11 às 14h. Qual prefere?');
  assert.equal(deriveSbcEvaluationChoice({ offer: offered, reply: reply('Sim'), now }), null);
  assert.equal(deriveSbcEvaluationChoice({ offer: offered, reply: reply('quarta às 14h'), now }), '2026-11-11T14:00');
  const sameHour = offer('Opções: 09/11 às 14h ou 11/11 às 14h. Qual prefere?');
  const later = new Date('2026-11-09T23:30:00Z');
  assert.equal(deriveSbcEvaluationChoice({ offer: sameHour, reply: reply('14h'), now: later }), null);
  assert.equal(deriveSbcEvaluationChoice({ offer: sameHour, reply: reply('quarta às 14h'), now: later }), '2026-11-11T14:00');
});
