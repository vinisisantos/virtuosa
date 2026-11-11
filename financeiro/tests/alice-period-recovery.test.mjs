import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { database, activateFixture, insertTurn } from './fixtures/alice-autonomy-database.mjs';
import { ALICE_AUTONOMY_INSTANCE_ID } from '../src/lib/ai-assistant/autonomy/policy.ts';
import { SBC_BOOKING_CHOICE_CLARIFICATION } from '../src/lib/ai-assistant/sbc-scheduling-exchange.ts';

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
const { activateAliceConversation } = await import('../src/lib/ai-assistant/autonomy/activate.ts');
const now = new Date('2026-11-11T21:25:00Z');

async function fixture() {
  const f = await database({ memory: true });
  await activateFixture(f.pg, ALICE_AUTONOMY_INSTANCE_ID, now);
  await insertTurn(f.pg, { instanceId: ALICE_AUTONOMY_INSTANCE_ID, status: 'sent' });
  await f.pg.query(`UPDATE "WhatsAppMessage" SET body='Na parte da tarde teria?',timestamp=$1,"createdAt"=$1 WHERE id='source-a'`, [new Date(+now - 120_000)]);
  for (const [id, body, offset] of [['offer', 'No sábado, 14/11/2026, temos 8h, 9h ou 10h30. Qual prefere?', 180_000],
    ['old-reply', SBC_BOOKING_CHOICE_CLARIFICATION, 60_000]]) {
    await f.pg.query(`INSERT INTO "WhatsAppMessage" (id,"conversationId","messageId","fromMe",body,status,"respondedByName",timestamp,"createdAt")
      VALUES ($1,'conversation-a',$1,TRUE,$2,'delivered','Alice',$3,$3)`, [id, body, new Date(+now - offset)]);
  }
  await f.pg.query(`UPDATE "AliceAutonomousTurn" SET attempts=1,"nextMessageIndex"=1,"firstSentAt"=$1,"completedAt"=$1,
    "providerMessageIds"='["old-reply"]',"costMicroUsd"=4500 WHERE id='turn-a'`, [new Date(+now - 60_000)]);
  await f.pg.exec(`UPDATE "WhatsAppConversation" SET "aiMode"='manual',"aiModeUpdatedBy"='operator' WHERE id='conversation-a'`);
  // O adaptador de fila não implementa filtros de relações; só essa fronteira da ativação é adaptada.
  const wrap = adapter => ({ ...adapter, whatsAppConversation: { ...adapter.whatsAppConversation,
    updateMany: args => adapter.whatsAppConversation.updateMany({ ...args, where: { id: args.where.id, instanceId: args.where.instanceId,
      aiMode: args.where.aiMode, aiModeUpdatedBy: args.where.aiModeUpdatedBy, aiModeUpdatedAt: args.where.aiModeUpdatedAt } }) },
  $transaction: callback => adapter.$transaction(tx => callback(wrap(tx))) });
  f.db = wrap(f.adapter);
  f.activate = async (overrides = {}) => {
    const prior = await f.adapter.whatsAppConversation.findFirst({ where: { id: 'conversation-a' } });
    return activateAliceConversation('conversation-a', { ...prior, ...overrides }, 'operator', new Date(+now - 300_000), undefined, f.db, now);
  };
  f.turn = async () => (await f.pg.query(`SELECT * FROM "AliceAutonomousTurn" WHERE id='turn-a'`)).rows[0];
  return f;
}

test('reativação explícita após pergunta de período continua só a resposta canônica equivocada, sem apagar recibos', async () => {
  const f = await fixture();
  try {
    await f.activate();
    const turn = await f.turn();
    assert.equal(turn.status, 'queued');
    assert.equal(turn.nextMessageIndex, 1);
    assert.equal(turn.firstSentAt.getTime(), +now - 60_000);
    assert.deepEqual(turn.providerMessageIds, ['old-reply']);
    assert.equal(turn.costMicroUsd, 4500);
    assert.deepEqual(turn.messagesJson, [SBC_BOOKING_CHOICE_CLARIFICATION,
      'Sim! Para sábado, 14/11/2026, posso te oferecer 12h, 12h30 ou 13h. Qual fica melhor para você? 😊']);
    assert.equal(turn.appointmentId, null);
    await f.activate();
    assert.equal((await f.turn()).attempts, 1);
    assert.equal((await f.pg.query(`SELECT count(*) FROM "AuditLog" WHERE action='alice_period_negotiation_recovery'`)).rows[0].count, 1);
  } finally { await f.pg.close(); }
});

test('recuperação não reabre respostas gerais, intervenção, outras fontes, agenda ou casos clínicos', async () => {
  const cases = [
    `UPDATE "WhatsAppMessage" SET body='Tudo certo!' WHERE id='old-reply'`,
    `UPDATE "WhatsAppMessage" SET "respondedBy"='human' WHERE id='old-reply'`,
    `UPDATE "WhatsAppMessage" SET body='Na parte da tarde teria? Estou grávida' WHERE id='source-a'`,
    `UPDATE "WhatsAppMessage" SET body='Na segunda à tarde teria?' WHERE id='source-a'`,
    `UPDATE "WhatsAppMessage" SET timestamp=timestamp-interval '101 hours',"createdAt"="createdAt"-interval '101 hours' WHERE id='source-a'`,
    `UPDATE "WhatsAppMessage" SET body='Na segunda, 14/11/2026, temos 8h ou 9h' WHERE id='offer'`,
    `UPDATE "AliceAutonomousTurn" SET "providerMessageIds"='["other"]' WHERE id='turn-a'`,
    `UPDATE "AliceAutonomousTurn" SET "appointmentId"='registered' WHERE id='turn-a'`,
    `INSERT INTO "AliceAutonomousTurn" (id,"conversationId","sourceMessageId","instanceId","updatedAt") VALUES ('active','conversation-a','other','${ALICE_AUTONOMY_INSTANCE_ID}',NOW())`,
    `INSERT INTO "LeadMemory" (id,"conversationId",unidade,"saudeObservacoes","updatedAt") VALUES ('memory','conversation-a','SBC','Condição que exige revisão',NOW())`,
    `INSERT INTO "Agendamento" (id,unit,"clientPhone",procedimento,status,"startTime","endTime") VALUES ('appointment','SBC','5511900001234','Avaliação','pendente',NOW(),NOW()+interval '1 day')`,
    `INSERT INTO "AliceAutoSchedule" (id,"conversationId","replyMessageId",state) VALUES ('ledger','conversation-a','source-a','booked')`,
    `INSERT INTO "WhatsAppMessage" (id,"conversationId","messageId",body,"fromMe",timestamp) VALUES ('new','conversation-a','new','A equipe assumiu',TRUE,TIMESTAMP '2026-11-11 21:24:30')`,
    `UPDATE "WhatsAppConversation" SET "aiModeUpdatedBy"='another-operator' WHERE id='conversation-a'`,
    `UPDATE "WhatsAppConversation" SET "aiMode"='agent' WHERE id='conversation-a'`,
  ];
  for (const sql of cases) {
    const f = await fixture();
    try {
      await f.pg.exec(sql);
      await f.activate();
      assert.equal((await f.turn()).status, 'sent', sql);
      assert.equal((await f.turn()).messagesJson, null, sql);
    } finally { await f.pg.close(); }
  }
});
