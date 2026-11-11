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

test('não agenda aceite de uma oferta cujo dia da semana contradiz a data', () => {
  const inconsistent = offer('Na quarta (12/11) à noite temos horários às 19h ou 19h30. Qual fica melhor para você?');
  assert.equal(deriveSbcEvaluationChoice({ offer: inconsistent, reply: reply('19h30'), now }), null);
});

const message = (id, body, fromMe) => ({ id, body, fromMe, status: fromMe ? 'delivered' : 'received', type: 'text',
  ...(fromMe ? { respondedByName: 'Alice', respondedBy: null } : {}) });
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
  assert.equal(selectSbcSchedulingExchange([offered, choice, { ...message('human', 'Vou conferir', true), respondedByName: 'Claudinice' }, message('ok', 'Sim', false)], now), null);
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

test('oferta legítima com todos os horários de sábado continua reconhecível', () => {
  const offered = offer('Para sábado, 14/11/2026, tenho 8h, 8h30, 9h, 9h30, 10h, 10h30, 11h, 11h30, 12h, 12h30 ou 13h. Qual prefere?');
  assert.equal(deriveSbcEvaluationChoice({ offer: offered, reply: reply('10h'), now }), '2026-11-14T10:00');
  assert.equal(deriveSbcEvaluationChoice({ offer: offered, reply: reply('13h'), now: new Date('2026-11-14T15:45Z') }), '2026-11-14T13:00');
});

const aliceMessage = (id, body) => ({ ...message(id, body, true), respondedByName: 'Alice', respondedBy: null });
test('Carol conserva oferta após pergunta de fotos, aceita 10h e mantém somente dúvidas não cobertas pela confirmação', () => {
  const offered = aliceMessage('offer', 'Para sábado, 14/11/2026, tenho 8h, 8h30, 9h, 9h30, 10h, 10h30, 11h, 11h30, 12h ou 12h30. Qual prefere?');
  const followup = aliceMessage('followup', 'Fotos a equipe pode enviar. Qual horário do sábado funciona melhor?');
  const messages = [offered, message('photos', 'Tem mais fotos pra ver?', false), followup,
    message('choice', '10h', false), message('address', 'Manda o endereço pra mim por favor', false),
    message('pain', 'Dói muito?', false), message('fear', 'Morro de medo de agulha', false)];
  const result = selectSbcSchedulingExchange(messages, now);
  assert.equal(result?.slot, '2026-11-14T10:00');
  assert.equal(result?.offer.id, 'offer');
  assert.equal(result?.reply.id, 'fear');
  assert.deepEqual(result?.pendingQuestions, ['Dói muito?', 'Morro de medo de agulha']);
  assert.deepEqual(result?.continuationMessages.map((m) => m.id), ['photos', 'followup']);
});

test('escolha e perguntas na mesma mensagem não apagam o horário inequívoco', () => {
  const offered = aliceMessage('offer', 'Sábado, 14/11/2026, tenho 10h ou 10h30. Qual prefere?');
  for (const text of ['10h, qual o endereço?', '10h. Dói muito? Tenho medo de agulha', '10h tenho medo de agulha']) {
    const result = selectSbcSchedulingExchange([offered, message('choice', text, false)], now);
    assert.equal(result?.slot, '2026-11-14T10:00', text);
  }
  const cost = selectSbcSchedulingExchange([offered, message('choice', '10h, a avaliação é gratuita?', false)], now);
  assert.equal(cost?.slot, '2026-11-14T10:00');
  assert.equal(cost?.asksEvaluationCost, true);
});

test('aceite condicionado, retratação, saúde e complemento desconhecido nunca viram reserva', () => {
  const offered = aliceMessage('offer', 'Sábado, 14/11/2026, tenho 10h ou 10h30. Qual prefere?');
  for (const text of ['10h, ainda não confirma', '10h. Depois eu confirmo', '10h se eu conseguir',
    '10h. Só confirmo depois do endereço', '10h, mas estou grávida', '10h, tenho diabetes',
    '10h. Preciso ver com meu marido', '10h. Não quero mais', '10h, uma coisa qualquer']) {
    assert.equal(selectSbcSchedulingExchange([offered, message('choice', text, false)], now)?.slot ?? null, null, text);
  }
  assert.equal(selectSbcSchedulingExchange([offered, message('availability', '10h, tem esse horário?', false)], now)?.slot ?? null, null);
  for (const question of ['Pode deixar em aberto?', 'Pode ser provisório?', 'Pode desmarcar?', 'Pode mudar para depois?']) {
    assert.equal(selectSbcSchedulingExchange([offered, message('conditional', `10h. ${question}`, false)], now)?.slot ?? null, null, question);
  }
});

test('oferta antiga não cruza saída humana, retirada, renegociação nem uma oferta nova', () => {
  const offered = aliceMessage('offer', 'Sábado, 14/11/2026, tenho 10h ou 10h30. Qual prefere?');
  const intervening = [
    [{ ...aliceMessage('human', 'Vou conferir'), respondedByName: 'Claudinice' }],
    [aliceMessage('withdraw', 'Esse horário já foi preenchido.')],
    [aliceMessage('withdraw-plural', 'Não temos mais esse horário.')],
    [aliceMessage('withdraw-available', 'Esse horário não está mais disponível.')],
    [aliceMessage('partial-change', 'Você prefere quinta-feira?')],
    [message('change', 'Prefiro quinta', false), aliceMessage('followup', 'Qual período fica melhor?')],
  ];
  for (const middle of intervening) assert.equal(selectSbcSchedulingExchange([offered, ...middle, message('choice', '10h', false)], now)?.slot ?? null, null);
  const newer = aliceMessage('newer', 'Na sexta, 13/11/2026, tenho 15h ou 16h. Qual prefere?');
  assert.equal(selectSbcSchedulingExchange([offered, newer, message('choice', '10h', false)], now)?.slot ?? null, null);
  assert.equal(selectSbcSchedulingExchange([offered, newer, message('choice', '15h', false)], now)?.slot, '2026-11-13T15:00');
});

test('oferta tem validade de 24 horas e o Ok posterior não substitui uma escolha válida', () => {
  const offered = { ...aliceMessage('offer', 'Sábado, 14/11/2026, tenho 10h ou 10h30. Qual prefere?'), timestamp: new Date('2026-11-08T14:59Z') };
  const choice = { ...message('choice', '10h', false), timestamp: now };
  assert.equal(selectSbcSchedulingExchange([offered, choice], now), null);
  const current = { ...offered, timestamp: new Date('2026-11-09T14:30Z') };
  const result = selectSbcSchedulingExchange([current, choice, { ...message('ok', 'Ok', false), timestamp: now }], now);
  assert.equal(result?.slot, '2026-11-14T10:00');
  assert.equal(result?.reply.id, 'ok');
});

test('fluxo assistido pode usar oferta humana exata, mas não atravessa outra intervenção humana', () => {
  const offered = { ...aliceMessage('offer', 'Sábado, 14/11/2026, tenho 10h ou 10h30. Qual prefere?'), respondedByName: 'Claudinice', respondedBy: 'operator' };
  const choice = message('choice', '10h', false);
  assert.equal(selectSbcSchedulingExchange([offered, choice], now), null);
  assert.equal(selectSbcSchedulingExchange([offered, choice], now, { allowHumanOffer: true })?.slot, '2026-11-14T10:00');
  assert.equal(selectSbcSchedulingExchange([offered, { ...offered, id: 'intervention', body: 'Vou confirmar' }, choice], now, { allowHumanOffer: true }), null);
  assert.equal(selectSbcSchedulingExchange([{ ...offered, respondedBy: null, respondedByName: null }, choice], now), null);
});

test('pedido sem escolha mantém negociação reconhecível sem inventar horário', () => {
  const offered = aliceMessage('offer', 'Sábado, 14/11/2026, tenho 10h ou 10h30. Qual prefere?');
  const result = selectSbcSchedulingExchange([offered, message('open', 'Pode ser no horário que tiver?', false)], now);
  assert.ok(result);
  assert.equal(result.slot, null);
});

test('confirmação de agenda não vira nova oferta nem reativa a oferta antiga após Ok', () => {
  const offered = aliceMessage('offer', 'Sábado, 14/11/2026, tenho 10h ou 11h. Qual prefere?');
  const choice = message('choice', '10h', false);
  for (const confirmation of [
    'Carol sua avaliação ficou agendada para sábado, 14/11/2026, às 10h.',
    'Sua avaliação está confirmada.',
  ]) {
    const history = [offered, choice, aliceMessage('confirmation', confirmation), message('ok', 'Ok', false)];
    assert.equal(selectSbcSchedulingExchange(history, now), null, confirmation);
  }
});
