import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeAppointmentClientName, requireAppointmentClientName, EVALUATION_CLIENT_NAME_REQUIRED } from '../src/lib/appointment-client-name.ts';

test('nomes humanos preservam acentos, pontuação de nomes e sobrenomes longos sem exigir sobrenome', () => {
  for (const name of ['Ana', 'João', 'Érica D’Ávila', "Anne-Marie O'Connor", 'Maria da Conceição dos Santos de Oliveira Silva', '李美']) {
    assert.equal(normalizeAppointmentClientName(name), name);
  }
  assert.equal(normalizeAppointmentClientName('  Jose\u0301\n  da Silva  '), 'José da Silva');
});

test('telefone, JID, números, ausência e marcadores provisórios nunca viram nome de agendamento', () => {
  for (const name of [null, undefined, {}, '', ' ', '5511999999999', '(11) 99999-9999', '+55 (11) 99999-9999',
    '5511999999999@s.whatsapp.net', '123456@lid', 'Maria 123', '---', "''", '...', 'Sem nome',
    'Lead sem nome', 'Cliente desconhecida', 'Nome não informado', 'Contato', 'WhatsApp', 'N/A']) {
    assert.equal(normalizeAppointmentClientName(name), null, String(name));
    assert.throws(() => requireAppointmentClientName(name), { code: EVALUATION_CLIENT_NAME_REQUIRED });
  }
});
