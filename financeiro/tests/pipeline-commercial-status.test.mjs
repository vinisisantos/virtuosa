import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { Prisma } from '@prisma/client';
import { validateCommercialDraft, pausesCommercialCallbacks, isCommercialClosed } from '../src/lib/pipeline/commercial-status.ts';
import { whatsAppCallbackQueueView } from '../src/lib/whatsapp/callback-queue.ts';

const unexpected = async () => { throw new Error('Acesso inesperado ao banco no teste'); };
globalThis.prisma = { whatsAppInstance: { findUnique: unexpected }, whatsAppConversation: { findMany: unexpected }, pipelineCommercialHold: { findMany: unexpected }, $transaction: unexpected };
const { prisma } = await import('../src/lib/db.ts');
const { refreshCommercialPauses, saveCommercialClassification } = await import('../src/lib/pipeline/commercial-service.ts');
const { recordInboundForCallbackTracking, recordOutboundForCallbackTracking, processExpiredWhatsAppCallbacks } = await import('../src/lib/whatsapp/callbacks.ts');

const now = new Date('2026-09-20T12:00:00Z');
const draft = { status: 'later', reason: 'timing', note: 'Cliente pediu contato mês que vem', nextContactAt: '2026-10-01T12:00:00Z' };

test('retomar exige futuro válido, motivo e observação', () => {
  assert.equal(validateCommercialDraft(draft, now).data.commercialStatus, 'later');
  for (const patch of [{ nextContactAt: null }, { nextContactAt: 'invalid' }, { nextContactAt: now.toISOString() }, { reason: '' }, { note: '' }]) {
    assert.ok(validateCommercialDraft({ ...draft, ...patch }, now).error);
  }
});
test('não presume causa da ausência e limpa retorno na retomada/nutrição', () => {
  assert.ok(validateCommercialDraft({ ...draft, status: 'no_response', reason: 'price' }, now).error);
  assert.equal(validateCommercialDraft({ ...draft, status: 'no_response', reason: 'no_response' }, now).data.commercialReason, 'no_response');
  assert.equal(validateCommercialDraft({ ...draft, status: 'nurture' }, now).data.nextContactAt, null);
  const active = validateCommercialDraft({ ...draft, status: 'active' }, now).data;
  assert.equal(active.commercialReason, null);
  assert.equal(active.nextContactAt, null);
  assert.ok(validateCommercialDraft({ ...draft, status: 'fabricado' }, now).error);
  assert.ok(validateCommercialDraft({ ...draft, note: 'a'.repeat(501) }, now).error);
});
test('pausa não é encerramento e não expira automaticamente', () => {
  for (const status of ['later', 'nurture']) {
    assert.equal(pausesCommercialCallbacks(status), true);
    assert.equal(isCommercialClosed(status), false);
  }
  for (const status of ['lost', 'unqualified']) assert.equal(isCommercialClosed(status), true);
  assert.equal(pausesCommercialCallbacks('no_response'), false);
  assert.equal(pausesCommercialCallbacks(null), false);
  assert.equal(whatsAppCallbackQueueView({ commercialPaused: true, status: 'open', callbackTrackingStartedAt: now, callbackDueAt: '2020-01-01', callbackStreakCount: 0, lastOutboundAt: '2020-01-01' }), null);
});
test('entrada nova preserva pausa e saída não consome tentativa', async () => {
  const inboundWrites = [];
  await recordInboundForCallbackTracking({ whatsAppConversation: {
    findUnique: async () => ({ commercialPaused: true, callbackAttempts: [] }),
    update: async (args) => inboundWrites.push(args.data),
  } }, 'conversation', now);
  assert.deepEqual(inboundWrites, [{ lastInboundAt: now }]);
  const conditions = [];
  assert.equal(await recordOutboundForCallbackTracking({ whatsAppConversation: {
    updateMany: async (args) => { conditions.push(args.where); return { count: 0 }; },
  } }, 'conversation', now), false);
  assert.equal(conditions.length, 2);
  assert.ok(conditions.every((where) => where.commercialPaused === false));
});
test('cron revalida pausa no claim e não encerra oportunidade pausada por outra conversa', async () => {
  for (const claimed of [0, 1]) {
    const calls = [];
    const stubs = [
      mock.method(prisma.whatsAppConversation, 'findMany', async (args) => {
        assert.equal(args.where.commercialPaused, false);
        return [{ id: 'chat', contact: { phone: '5511999999999', unit: 'SBC' }, instance: { unit: 'SBC' } }];
      }),
      mock.method(prisma, '$transaction', async (fn) => fn({
        whatsAppConversation: { updateMany: async (args) => { assert.equal(args.where.commercialPaused, false); return { count: claimed }; }, update: async () => {} },
        whatsAppCallbackAttempt: { updateMany: async () => {} },
        client: { findMany: async () => [{ id: 'client', phone: '5511999999999', unit: 'SBC' }], update: unexpected },
        salesPipeline: {
          findMany: async (args) => { calls.push(args); return [{ id: 'deal', pipelineId: null, stage: 'em_atendimento', unit: 'SBC' }]; },
          updateMany: async (args) => { calls.push(args); return { count: 0 }; },
        },
        auditLog: { create: unexpected },
      })),
    ];
    try {
      const result = await processExpiredWhatsAppCallbacks(now);
      assert.equal(result.pipelineUpdated, 0);
      assert.equal(result.skipped, claimed ? 0 : 1);
      assert.equal(calls.length, claimed ? 2 : 0);
      for (const args of calls) {
        assert.deepEqual(args.where.OR[1].commercialStatus.notIn, ['later', 'nurture', 'lost', 'unqualified']);
        assert.equal(args.where.stage.not, 'fechado');
      }
    } finally { stubs.forEach((stub) => stub.mock.restore()); }
  }
});
test('migração idempotente, sem reclassificação; pausas múltiplas e retomada sem apagar histórico', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE "SalesPipeline" (id text PRIMARY KEY, unit text);
      CREATE TABLE "WhatsAppConversation" (id text PRIMARY KEY, "callbackDueAt" timestamp, "callbackStreakCount" int DEFAULT 5, "callbackTotalCount" int DEFAULT 12, "callbackPipelineSyncedAt" timestamp, "updatedAt" timestamp);
      INSERT INTO "SalesPipeline" VALUES ('a','SBC'),('b','SBC'),('c','SCS');
      INSERT INTO "WhatsAppConversation" (id) VALUES ('chat'),('scs');`);
    const sql = readFileSync(new URL('../prisma/migrations/20260920120000_pipeline_commercial_status/migration.sql', import.meta.url), 'utf8');
    await db.exec(sql); await db.exec(sql);
    assert.ok((await db.query('SELECT "commercialStatus" FROM "SalesPipeline"')).rows.every((r) => r.commercialStatus === null));
    await db.exec(`INSERT INTO "PipelineCommercialHold" VALUES ('a','chat'),('b','chat');`);
    const tx = { $executeRaw: async (...args) => { const q = Prisma.sql(...args); return db.query(q.text, q.values); } };
    await refreshCommercialPauses(tx, ['chat']);
    await db.exec(`DELETE FROM "PipelineCommercialHold" WHERE "dealId"='a';`);
    await refreshCommercialPauses(tx, ['chat']);
    assert.equal((await db.query(`SELECT "commercialPaused" FROM "WhatsAppConversation" WHERE id='chat'`)).rows[0].commercialPaused, true);
    await db.exec(`DELETE FROM "SalesPipeline" WHERE id='b';`);
    await refreshCommercialPauses(tx, ['chat']);
    const result = (await db.query(`SELECT * FROM "WhatsAppConversation" WHERE id='chat'`)).rows[0];
    assert.equal(result.commercialPaused, false);
    assert.equal(result.callbackStreakCount, 0);
    assert.equal(result.callbackTotalCount, 12);
    assert.equal(result.callbackDueAt, null);
    assert.equal((await db.query(`SELECT "callbackStreakCount" FROM "WhatsAppConversation" WHERE id='scs'`)).rows[0].callbackStreakCount, 5);
  } finally { await db.close(); }
});

function serviceFixture({ unit = 'SBC', role = 'OWNER', holds = [], count = 1 } = {}) {
  const calls = [];
  const existing = { id: 'deal', clientId: 'client', clientName: 'Teste', unit, stage: 'em_atendimento', stageId: 'service', pipelineId: 'pipeline', assignedTo: 'operator', assignedName: 'Equipe', updatedAt: now, commercialStatus: null };
  const req = new Request('http://localhost/api/pipeline?targetInstanceId=instance', { headers: { 'x-user-id': 'operator', 'x-user-name': 'Equipe', 'x-user-role': 'VENDEDOR', 'x-user-unit': unit } });
  const stubs = [
    mock.method(prisma.whatsAppInstance, 'findUnique', async () => ({ id: 'instance', userId: 'operator', unit, status: 'connected', members: role === 'OWNER' ? [] : [{ userId: 'operator', isActive: true, role }] })),
    mock.method(prisma.whatsAppConversation, 'findMany', async (args) => { calls.push(['conversations', args]); return [{ id: 'chat', instanceId: 'instance', assignedTo: 'operator', contact: { phone: '5511999999999' } }, { id: 'wrong-number', instanceId: 'instance', contact: { phone: '5511888888888' } }]; }),
    mock.method(prisma.pipelineCommercialHold, 'findMany', async () => holds),
    mock.method(prisma, '$transaction', async (fn) => fn({
      $queryRaw: async () => [], $executeRaw: async () => 1,
      salesPipeline: { updateMany: async (args) => { calls.push(['save', args]); return { count }; }, findUniqueOrThrow: async () => existing },
      pipelineCommercialHold: { deleteMany: async () => {}, createMany: async (args) => { calls.push(['holds', args]); } },
      auditLog: { create: async (args) => { calls.push(['audit', args]); } },
    })),
  ];
  return { calls, close: () => stubs.forEach((stub) => stub.mock.restore()), params: { req, existing, guard: { userId: 'operator', userName: 'Equipe', isAdmin: false }, phone: '11999999999', draft: { ...draft, nextContactAt: '2099-01-01T12:00:00Z' }, expectedUpdatedAt: now.toISOString() } };
}
test('SBC, SCS e Osasco vinculam apenas telefone exato e instância autorizada', async () => {
  for (const unit of ['SBC', 'SCS', 'Osasco']) {
    const fixture = serviceFixture({ unit });
    try {
      await saveCommercialClassification(fixture.params);
      const query = fixture.calls.find(([key]) => key === 'conversations')[1];
      assert.deepEqual(query.where.instanceId, { in: ['instance'] });
      assert.equal(query.where.OR[0].instance.unit, unit);
      assert.deepEqual(fixture.calls.find(([key]) => key === 'holds')[1].data, [{ dealId: 'deal', conversationId: 'chat' }]);
      assert.equal(fixture.calls.find(([key]) => key === 'save')[1].data.nextContactAt.toISOString(), '2099-01-01T12:00:00.000Z');
      assert.ok(fixture.calls.some(([key]) => key === 'audit'));
    } finally { fixture.close(); }
  }
});
test('nega VIEWER, versão antiga e liberação de pausa em outra caixa', async () => {
  for (const options of [{ role: 'VIEWER' }, { holds: [{ conversationId: 'other-inbox' }] }, { count: 0 }]) {
    const fixture = serviceFixture(options);
    try { await assert.rejects(saveCommercialClassification(fixture.params)); }
    finally { fixture.close(); }
  }
  const fixture = serviceFixture();
  try {
    await assert.rejects(saveCommercialClassification({ ...fixture.params, expectedUpdatedAt: 'old' }), /atualizado/);
    assert.equal(fixture.calls.length, 0);
  } finally { fixture.close(); }
});
