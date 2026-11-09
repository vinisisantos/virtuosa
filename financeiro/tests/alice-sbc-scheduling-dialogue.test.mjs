import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveSbcEvaluationChoice } from '../src/lib/ai-assistant/sbc-scheduling-policy.ts';
import { selectSbcSchedulingExchange } from '../src/lib/ai-assistant/sbc-scheduling-exchange.ts';

const now = new Date('2026-11-09T15:00:00Z');
const offer = (body) => ({ body, fromMe: true, status: 'delivered' });
const reply = (body) => ({ body, fromMe: false, status: 'received' });

test('escolhe quarta às 14h entre três dias realmente oferecidos, sem inventar data', () => {
  const offered = offer('Aqui vão algumas opções à tarde\n09/11 (segunda) às 14h\n10/11 (terça) às 14h\n11/11 (quarta) às 14h\nQual delas fica melhor pra você?');
  assert.equal(deriveSbcEvaluationChoice({ offer: offered, reply: reply('quarta às 14h'), now }), '2026-11-11T14:00');
  assert.equal(deriveSbcEvaluationChoice({ offer: offered, reply: reply('às 14h'), now }), null);
  assert.equal(deriveSbcEvaluationChoice({ offer: offered, reply: reply('quinta às 14h'), now }), null);
});

const message = (id, body, fromMe) => ({ id, body, fromMe, status: fromMe ? 'delivered' : 'received', type: 'text' });
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
