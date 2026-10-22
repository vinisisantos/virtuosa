import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveContactNameFromMessage, shouldUpdateContactName } from '../src/lib/whatsapp/contact-name.ts';
import { extractLeadName, isValidLeadName } from '../src/lib/whatsapp/lead-name.ts';

const phone = '5511999999999';
const decoratedNames = [
  ['Camila Vieira 🍀', 'Camila Vieira'],
  ['~Camila Vieira 🍀', 'Camila Vieira'],
  ['🍀 Camila Vieira ✨', 'Camila Vieira'],
  ['Maria 💗 Clara', 'Maria Clara'],
  ['Ana ❤️ Maria', 'Ana Maria'],
  ['👩🏽‍⚕️ Ana Paula', 'Ana Paula'],
  ['Ana👩🏻‍⚕️Paula', 'Ana Paula'],
  ['João 🇧🇷 Silva', 'João Silva'],
  ['Júlia 💅🏽', 'Júlia'],
  ['João 🏳️‍🌈 Silva', 'João Silva'],
  ['Rafael 🏴\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}', 'Rafael'],
  ['🌸 ~Érica D’Ávila', 'Érica D’Ávila'],
  ["Anne-Marie O'Connor 🌻", "Anne-Marie O'Connor"],
  ['  Camila\n  Vieira 🍀  ', 'Camila Vieira'],
];

for (const [input, expected] of decoratedNames) {
  test(`perfil decorado aproveita o nome pessoal: ${input}`, () => {
    assert.equal(resolveContactNameFromMessage({ pushName: input }, phone, false), expected);
    assert.equal(resolveContactNameFromMessage({ senderName: input }, phone, false), expected);
  });
}

test('preserva nomes simples, acentos e pontuação pessoal existentes', () => {
  for (const name of ['Camila Vieira', 'José da Silva', 'Érica D’Ávila', "Anne-Marie O'Connor", '李美']) {
    assert.equal(resolveContactNameFromMessage({ pushName: name }, phone, false), name);
  }
});

test('não transforma emoji, número, URL ou mensagem comercial em nome', () => {
  for (const input of [undefined, null, 123, {}, '', '🍀✨', '~', '  ', phone, `~${phone} 🍀`,
    'Camila 123 🍀', 'Ana 1️⃣', 'https://example.invalid 🍀', '@camila 🍀', 'oi 🍀',
    'Quero agendar ✨', 'Qual endereço? 🍀', 'Quanto custa? 💗']) {
    assert.equal(resolveContactNameFromMessage({ pushName: input }, phone, false), phone, String(input));
  }
});

test('usa senderName válido se pushName não contiver um nome aproveitável', () => {
  assert.equal(resolveContactNameFromMessage({ pushName: '🍀', senderName: 'Camila Vieira 💗' }, phone, false), 'Camila Vieira');
  assert.equal(resolveContactNameFromMessage({ pushName: 'Camila 🍀', senderName: 'Outra Pessoa' }, phone, false), 'Camila');
});

test('evento enviado nunca usa o nome da própria conta para o destinatário', () => {
  assert.equal(resolveContactNameFromMessage({ pushName: 'Clínica Virtuosa ✨', senderName: 'Camila Vieira 🍀' }, phone, true), phone);
});

test('nome recebido pode substituir telefone provisório sem sobrescrever nome manual', () => {
  const next = resolveContactNameFromMessage({ pushName: 'Camila Vieira 🍀' }, phone, false);
  for (const current of [null, '', phone, '(11) 99999-9999', 'Virtuosa Estética']) {
    assert.equal(shouldUpdateContactName(current, next, phone), true, String(current));
  }
  for (const current of ['Camila V.', 'Nome Corrigido', 'Camila Vieira 🍀']) {
    assert.equal(shouldUpdateContactName(current, next, phone), false, current);
  }
});

test('mantém proteção contra nome vazio, telefone e identificação da própria clínica', () => {
  for (const next of [null, '', phone, 'Virtuosa Estética', 'Clínica Virtuosa SBC']) {
    assert.equal(shouldUpdateContactName(phone, next, phone), false, String(next));
  }
});

test('normalização de perfil não relaxa a captura de nomes no corpo das mensagens', () => {
  assert.equal(isValidLeadName('Camila Vieira 🍀'), false);
  assert.equal(extractLeadName('Qual endereço?', { allowBareName: true }), null);
  assert.equal(extractLeadName('Me chamo Camila Vieira'), 'Camila Vieira');
});
